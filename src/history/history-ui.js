// History list rendering with smooth swipe gestures
import { getAllResults, toggleFavorite, deleteResult } from './history-db.js';
import { setEditorContent } from '../editor/mathlive-config.js';
import { t } from '../lang/i18n.js';

const SWIPE_THRESHOLD = 60;
const VELOCITY_SNAP = 0.3;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function copyToClipboard(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const formatted = lines.map(l => '$$\n' + l.trim() + '\n$$').join('\n');
  navigator.clipboard.writeText(formatted);
  if (navigator.vibrate) navigator.vibrate(30);
}

async function shareLatex(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const formatted = lines.map(l => '$$\n' + l.trim() + '\n$$').join('\n');
  const { shareText } = await import('../shared/share.js');
  await shareText(formatted, { title: 'LaTeXSnipper', dialogTitle: '分享公式' });
}

function measureSnap(wrap) {
  const bg = wrap.querySelector('.hi-swipe-bg');
  if (!bg) return { left: 80, right: 200 };
  const leftEl = bg.querySelector('.hi-swipe-left');
  const rightEl = bg.querySelector('.hi-swipe-right');
  return {
    left: leftEl ? leftEl.offsetWidth : 80,
    right: rightEl ? rightEl.offsetWidth : 200,
  };
}

function initSwipe(itemEl) {
  let startX = 0, startY = 0, startTime = 0, translateX = 0;
  let tracking = false;

  const wrap = itemEl.parentElement;
  const bg = wrap.querySelector('.hi-swipe-bg');
  const leftGroup = bg?.querySelector('.hi-swipe-left');
  const rightGroup = bg?.querySelector('.hi-swipe-right');
  const leftLabel = wrap.querySelector('.hi-swipe-label.left');
  const rightLabel = wrap.querySelector('.hi-swipe-label.right');

  function resetVisuals() {
    if (bg) {
      bg.style.background = '';
      bg.classList.remove('overscroll-right', 'overscroll-left');
    }
    leftGroup?.classList.remove('hide');
    rightGroup?.classList.remove('hide');
    leftLabel?.classList.remove('show');
    rightLabel?.classList.remove('show');
  }

  function closeOthers(exclude) {
    document.querySelectorAll('.history-item._revealed').forEach(el => {
      if (el !== exclude) {
        el._revealed = false;
        el._offsetX = 0;
        el.style.transform = '';
      }
    });
  }

  function snapTo(pos) {
    itemEl._offsetX = pos;
    itemEl.style.transform = `translateX(${pos}px)`;
    itemEl._revealed = pos !== 0;
  }

  function doDelete() {
    itemEl._revealed = false;
    itemEl._offsetX = 0;
    if (bg) bg.style.background = '#ef4444';
    const id = Number(itemEl.dataset.id);
    // Fly out in the direction of the swipe
    itemEl.classList.add('deleting');
    itemEl.style.transform = `translateX(${translateX > 0 ? '100%' : '-100%'})`;
    setTimeout(() => {
      deleteResult(id).then(() => {
        const filter = document.querySelector('.history-toolbar button.active')?.dataset.filter || 'all';
        renderHistoryList(filter);
      });
    }, 250);
  }

  function doToggleFav() {
    const id = Number(itemEl.dataset.id);
    toggleFavorite(id).then(isFav => {
      itemEl.querySelector('.hi-fav[data-action="fav"]')?.classList.toggle('active', isFav);
    });
  }

  itemEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { tracking = false; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = performance.now();
    closeOthers(itemEl);

    if (itemEl._revealed) {
      itemEl._revealed = false;
      itemEl._offsetX = 0;
      itemEl.style.transform = '';
      tracking = false;
      return;
    }

    translateX = itemEl._offsetX || 0;
    tracking = true;
    itemEl.classList.add('swiping');
  }, { passive: true });

  itemEl.addEventListener('touchmove', (e) => {
    if (!tracking || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) * 1.5) { tracking = false; itemEl.classList.remove('swiping'); return; }

    const snap = measureSnap(wrap);

    // Past snap point → hide ALL buttons, show label + color
    if (translateX > snap.left) {
      leftGroup?.classList.add('hide');
      rightGroup?.classList.add('hide');
      leftLabel?.classList.add('show');
      rightLabel?.classList.remove('show');
      if (bg) { bg.style.background = '#ef4444'; }
    } else if (translateX < -snap.right) {
      leftGroup?.classList.add('hide');
      rightGroup?.classList.add('hide');
      rightLabel?.classList.add('show');
      leftLabel?.classList.remove('show');
      if (bg) { bg.style.background = '#f59e0b'; }
    } else {
      resetVisuals();
    }

    const maxLeft = -(snap.right * 3);
    const maxRight = snap.left * 4;
    translateX = Math.max(maxLeft, Math.min(maxRight, dx + (itemEl._offsetX || 0)));
    itemEl.style.transform = `translateX(${translateX}px)`;
  }, { passive: true });

  itemEl.addEventListener('touchend', () => {
    tracking = false;
    itemEl.classList.remove('swiping');
    resetVisuals();

    const snap = measureSnap(wrap);
    const dt = performance.now() - startTime;
    const velocity = dt > 10 ? Math.abs(translateX) / dt : 0;
    const ACTION_THRESHOLD = 260;

    if (translateX > ACTION_THRESHOLD) {
      doDelete();
    } else if (translateX < -ACTION_THRESHOLD) {
      doToggleFav();
      snapTo(0);
    } else if (translateX > SWIPE_THRESHOLD || (translateX > 20 && velocity > VELOCITY_SNAP)) {
      snapTo(snap.left);
    } else if (translateX < -SWIPE_THRESHOLD || (translateX < -20 && velocity > VELOCITY_SNAP)) {
      snapTo(-snap.right);
    } else {
      snapTo(0);
    }
    translateX = 0;
  }, { passive: true });
}

export async function renderHistoryList(filter = 'all') {
  const listEl = document.getElementById('historyList');
  if (!listEl) return;
  const results = await getAllResults({ filter });
  if (results.length === 0) {
    listEl.innerHTML = `<div class="history-empty">${t('history.empty')}</div>`;
    return;
  }

  listEl.innerHTML = results.map(r => {
    const isFav = r.favorite ? ' active' : '';
    const favLabel = r.favorite ? '取消收藏' : '收藏';
    return `<div class="history-item-wrap">
      <div class="hi-swipe-label left">删除</div>
      <div class="hi-swipe-label right">${favLabel}</div>
      <div class="hi-swipe-bg">
        <div class="hi-swipe-left">
          <button class="hi-swipe-btn" data-action="del-swipe" data-id="${r.id}">删除</button>
        </div>
        <div class="hi-swipe-spacer"></div>
        <div class="hi-swipe-right">
          <button class="hi-swipe-btn" data-action="share" data-id="${r.id}">分享</button>
          <button class="hi-swipe-btn" data-action="copy" data-id="${r.id}">复制</button>
          <button class="hi-swipe-btn" data-action="del-swipe" data-id="${r.id}">删除</button>
        </div>
      </div>
      <div class="history-item" data-id="${r.id}">
        <div class="hi-latex">${escapeHtml(r.latex.substring(0, 120))}${r.latex.length > 120 ? '…' : ''}</div>
        <div class="hi-meta">
          <span class="hi-tag">${r.source}</span>
          <span>${new Date(r.createdAt).toLocaleString()}</span>
          <span>${(r.confidence * 100).toFixed(0)}%</span>
          <button class="hi-fav${isFav}" data-action="fav" data-id="${r.id}">★</button>
        </div>
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.history-item').forEach(item => {
    initSwipe(item);
    item._offsetX = 0;
    item._revealed = false;
    item.style.transform = '';
    item.classList.remove('deleting', 'swiping');
    item.style.opacity = '';
  });

  listEl.querySelectorAll('[data-action="del-swipe"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteResult(Number(btn.dataset.id));
      renderHistoryList(filter);
    });
  });

  listEl.querySelectorAll('[data-action="copy"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const all = await getAllResults();
      const r = all.find(x => x.id === Number(btn.dataset.id));
      if (r) copyToClipboard(r.latex);
    });
  });

  listEl.querySelectorAll('[data-action="share"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const all = await getAllResults();
      const r = all.find(x => x.id === Number(btn.dataset.id));
      if (r) shareLatex(r.latex);
    });
  });

  listEl.querySelectorAll('[data-action="fav"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const isFav = await toggleFavorite(id);
      btn.classList.toggle('active', isFav);
    });
  });

  listEl.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', async () => {
      if (item._revealed) {
        item._revealed = false;
        item._offsetX = 0;
        item.style.transform = '';
        return;
      }
      const id = Number(item.dataset.id);
      const all = await getAllResults();
      const record = all.find(r => r.id === id);
      if (record) setEditorContent(record.latex);
    });
  });
}
