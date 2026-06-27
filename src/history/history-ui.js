// History list rendering with smooth swipe gestures
//
// Swipe bg: card-bg fills the gap; zones pinned to edges and grow dynamically.
// - RIGHT swipe (dx > 0) → delete zone grows from left  → width = dx
// - LEFT  swipe (dx < 0) → actions zone grows from right → width = |dx|
// - Overswipe right → direct delete
// - Overswipe left  → fav-mode (yellow) → toggle fav + auto-return
// - Snap thresholds → snap to fixed zone width
//
// Inline buttons at card bottom-right (always visible): share, copy
// Star at top-right corner: toggle favorite
import { getAllResults, toggleFavorite, deleteResult, clearHistory } from './history-db.js';
import { setEditorContent } from '../editor/mathlive-config.js';
import { t } from '../lang/i18n.js';

// ── Constants ──
const DELETE_ZONE    = 80;   // fixed width delete zone when snapped
const ACTIONS_ZONE   = 150;  // fixed width actions zone when snapped
const SNAP_DELETE   = 40;    // right-swipe snap threshold
const SNAP_ACTIONS  = 60;    // left-swipe snap threshold
const DIRECT_DELETE = 260;   // overswipe right → immediate delete
const FAV_START     = 250;   // past actions zone max → fav-mode visual
const FAV_TRIGGER   = 300;   // ~50% of max left drag → toggle fav + auto-return

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

/** Burst of particles at element center */
function burstParticles(el, color, count = 12) {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div');
    dot.style.cssText = `
      position: fixed; z-index: 9999; pointer-events: none;
      left: ${cx}px; top: ${cy}px;
      width: ${4 + Math.random() * 4}px; height: ${4 + Math.random() * 4}px;
      border-radius: 50%; background: ${color};
      box-shadow: 0 0 4px ${color};
      transition: none;
    `;
    document.body.appendChild(dot);
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 80;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 30;
    const dur = 300 + Math.random() * 400;
    requestAnimationFrame(() => {
      dot.style.transition =
        `transform ${dur}ms cubic-bezier(0,.6,.2,1), opacity ${dur}ms ease`;
      dot.style.transform = `translate(${dx}px, ${dy}px)`;
      dot.style.opacity = '0';
    });
    setTimeout(() => dot.remove(), dur + 50);
  }
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

// ── Per-card swipe state ──
const stateMap = new WeakMap();

function getState(el) {
  if (!stateMap.has(el)) stateMap.set(el, { offsetX: 0, revealed: false });
  return stateMap.get(el);
}

function closeAllBut(exclude) {
  document.querySelectorAll('.history-item').forEach(el => {
    if (el === exclude) return;
    const s = getState(el);
    if (s.revealed) {
      s.revealed = false;
      s.offsetX = 0;
      el.classList.add('returning');
      el.style.transform = '';
      const wrap = el.parentElement;
      const bg = wrap?.querySelector('.hi-swipe-bg');
      if (bg) {
        const dz = bg.querySelector('.hi-swipe-delete');
        const az = bg.querySelector('.hi-swipe-actions');
        if (dz) dz.style.width = '0';
        if (az) { az.style.width = '0'; az.classList.remove('fav-mode'); }
      }
    }
  });
}

// ── Helper: update zone widths ──
function setZoneWidths(bg, dx) {
  if (!bg) return;
  const dz = bg.querySelector('.hi-swipe-delete');
  const az = bg.querySelector('.hi-swipe-actions');
  if (dx > 0) {
    if (dz) dz.style.width = Math.round(dx) + 'px';
    if (az) { az.style.width = '0'; az.classList.remove('fav-mode'); }
    if (az) az.querySelectorAll('.hi-swipe-btn').forEach(b => b.classList.remove('visible'));
    // Enable pointer events on delete zone when wide enough
    if (dz) dz.style.pointerEvents = dx > SNAP_DELETE ? 'auto' : 'none';
  } else if (dx < 0) {
    const abs = Math.abs(dx);
    if (az) az.style.width = Math.round(abs) + 'px';
    if (dz) dz.style.width = '0';
    // Show buttons if past snap threshold
    if (az) {
      if (abs > SNAP_ACTIONS) {
        az.querySelectorAll('.hi-swipe-btn').forEach(b => b.classList.add('visible'));
      } else {
        az.querySelectorAll('.hi-swipe-btn').forEach(b => b.classList.remove('visible'));
      }
    }
  } else {
    if (dz) dz.style.width = '0';
    if (az) {
      az.style.width = '0';
      az.classList.remove('fav-mode');
      az.querySelectorAll('.hi-swipe-btn').forEach(b => b.classList.remove('visible'));
    }
  }
}

// ── Swipe controller ──
function initSwipe(card) {
  let startX = 0, startY = 0, startTime = 0;
  let tracking = false, currentDx = 0;

  const wrap = card.parentElement;
  const bg = wrap.querySelector('.hi-swipe-bg');
  const deleteZone = bg?.querySelector('.hi-swipe-delete');
  const actionZone = bg?.querySelector('.hi-swipe-actions');
  const actionBtns = actionZone ? [...actionZone.querySelectorAll('.hi-swipe-btn')] : [];

  // ── Return to origin ──
  function returnToOrigin(smooth = true) {
    const s = getState(card);
    s.revealed = false;
    s.offsetX = 0;
    if (smooth) {
      card.classList.remove('swiping');
      card.classList.add('returning');
      card.style.transform = '';
      card.style.opacity = '';
      // Zone width transitions back with same timing as card
      if (deleteZone) deleteZone.classList.remove('no-transition');
      if (actionZone) actionZone.classList.remove('no-transition');
    } else {
      card.style.transition = 'none';
      card.style.transform = '';
      card.style.opacity = '';
      if (deleteZone) deleteZone.classList.add('no-transition');
      if (actionZone) actionZone.classList.add('no-transition');
      requestAnimationFrame(() => { card.style.transition = ''; });
    }
    setZoneWidths(bg, 0);
  }

  // ── Snap to fixed zone position ──
  function snapTo(dir) {
    const s = getState(card);
    const pos = dir > 0 ? DELETE_ZONE : -ACTIONS_ZONE;
    s.offsetX = pos;
    s.revealed = true;
    card.style.transition = 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)';
    card.style.transform = `translateX(${pos}px)`;
    // Let zone width transition with same timing as card
    if (deleteZone) deleteZone.classList.remove('no-transition');
    if (actionZone) actionZone.classList.remove('no-transition');
    // Reset fav-mode on snap (it was set by touchmove)
    if (actionZone) actionZone.classList.remove('fav-mode');
    setZoneWidths(bg, pos);
    setTimeout(() => { card.style.transition = ''; }, 300);
  }

  // ── Delete (fly out + remove) ──
  function doDelete() {
    const s = getState(card);
    s.revealed = false;
    s.offsetX = 0;
    const id = Number(card.dataset.id);
    card.classList.add('deleting');
    card.style.transform = 'translateX(100%)';
    card.style.opacity = '0';
    setTimeout(() => {
      deleteResult(id).then(() => {
        const filter =
          document.querySelector('.history-toolbar button.active')
            ?.dataset.filter || 'all';
        renderHistoryList(filter);
      });
    }, 300);
  }

  // ── Toggle favorite ──
  function doToggleFav() {
    const id = Number(card.dataset.id);
    toggleFavorite(id).then(isFav => {
      const favBtn = card.querySelector('.hi-fav[data-action="fav"]');
      if (favBtn) favBtn.classList.toggle('active', isFav);
    });
    // Flash glow
    card.style.transition = 'none';
    card.style.boxShadow =
      'inset 0 0 0 2px #f59e0b, 0 0 14px rgba(245,158,11,0.5)';
    requestAnimationFrame(() => {
      card.style.transition = 'box-shadow 0.35s ease';
      card.style.boxShadow = '';
    });
  }

  // ── Execute share/copy from swipe-revealed buttons ──
  function execAction(action) {
    const id = Number(card.dataset.id);
    returnToOrigin(true);
    getAllResults().then(all => {
      const r = all.find(x => x.id === id);
      if (!r) return;
      if (action === 'share') {
        burstParticles(card, '#22c55e', 10);
        shareLatex(r.latex);
      } else if (action === 'copy') {
        burstParticles(card, '#2563eb', 10);
        copyToClipboard(r.latex);
      }
    });
  }

  // ══════════════════════════════════════════════
  // Touch handlers
  // ══════════════════════════════════════════════
  card.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { tracking = false; return; }
    const target = e.target.closest('.hi-fav') || e.target.closest('.hi-swipe-delete');
    if (target) { tracking = false; return; }

    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    startTime = performance.now();

    const s = getState(card);
    if (s.revealed && s.offsetX > 0) {
      // Right-swipe revealed: allow further drag, don't reset
      closeAllBut(card);
      if (deleteZone) deleteZone.classList.add('no-transition');
      if (actionZone) actionZone.classList.add('no-transition');
      currentDx = s.offsetX;
      tracking = true;
      card.classList.add('swiping');
      return;
    }
    if (s.revealed) {
      // Left-swipe revealed: reset
      s.revealed = false;
      s.offsetX = 0;
      card.style.transition = 'none';
      card.style.transform = '';
      setZoneWidths(bg, 0);
      requestAnimationFrame(() => { card.style.transition = ''; });
      tracking = false;
      return;
    }

    closeAllBut(card);
    // Live drag: zone width follows finger instantly, no CSS transition
    if (deleteZone) deleteZone.classList.add('no-transition');
    if (actionZone) actionZone.classList.add('no-transition');
    currentDx = 0;
    tracking = true;
    card.classList.add('swiping');
  }, { passive: true });

  card.addEventListener('touchmove', e => {
    if (!tracking || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    // Vertical scroll cancels swipe
    if (Math.abs(dy) > Math.abs(dx) * 1.5) {
      tracking = false;
      card.classList.remove('swiping');
      setZoneWidths(bg, 0);
      return;
    }

    const s = getState(card);

    if (dx > 0) {
      // RIGHT swipe → delete zone
      currentDx = Math.min(DELETE_ZONE * 4, dx + s.offsetX);
      if (actionZone) actionZone.classList.remove('fav-mode');
    } else {
      // LEFT swipe → actions zone
      currentDx = Math.max(-(ACTIONS_ZONE * 4), dx + s.offsetX);
      // Past fav-start threshold → show yellow fav mode
      if (actionZone && Math.abs(currentDx) > FAV_START) {
        actionZone.classList.add('fav-mode');
      } else if (actionZone) {
        actionZone.classList.remove('fav-mode');
      }
    }

    setZoneWidths(bg, currentDx);
    card.style.transform = `translateX(${currentDx}px)`;
  }, { passive: true });

  card.addEventListener('touchend', () => {
    if (!tracking) return;
    tracking = false;
    card.classList.remove('swiping');

    const dt = performance.now() - startTime;
    const vel = dt > 10 ? Math.abs(currentDx) / dt : 0;

    if (currentDx > 0) {
      // ── RIGHT swipe → DELETE ──
      if (currentDx > DIRECT_DELETE) {
        doDelete();
      } else if (currentDx > SNAP_DELETE || (currentDx > 10 && vel > 0.3)) {
        snapTo(1);
      } else {
        returnToOrigin(true);
      }
    } else if (currentDx < 0) {
      // ── LEFT swipe → reveal actions zone, or toggle fav on overswipe ──
      const abs = Math.abs(currentDx);
      if (abs > FAV_TRIGGER) {
        doToggleFav();
        returnToOrigin(false);
      } else if (abs > SNAP_ACTIONS || (abs > 10 && vel > 0.3)) {
        // Snap to actions zone only if NOT already in fav-mode.
        // If fav-mode was shown during touch (past FAV_START), treat
        // releasing past SNAP_ACTIONS + near FAV_TRIGGER as a fav toggle too.
        if (abs > FAV_START && actionZone?.classList.contains('fav-mode')) {
          doToggleFav();
          returnToOrigin(false);
        } else {
          snapTo(-1);
        }
      } else {
        returnToOrigin(true);
      }
    } else {
      returnToOrigin(true);
    }

    currentDx = 0;
  }, { passive: true });

  // ── Clicks on swipe-revealed buttons (action zone) ──
  if (actionZone) {
    actionZone.addEventListener('click', e => {
      const btn = e.target.closest('.hi-swipe-btn');
      if (!btn) return;
      e.stopPropagation();
      // Burst particle with button's own color
      const color = btn.dataset.action === 'share' ? '#22c55e' : '#2563eb';
      burstParticles(btn, color, 10);
      execAction(btn.dataset.action);
    });
  }

  // ── Click on delete zone (right-swipe revealed) → execute delete ──
  if (deleteZone) {
    deleteZone.addEventListener('click', e => {
      e.stopPropagation();
      const s = getState(card);
      if (s.revealed && s.offsetX > 0) {
        burstParticles(deleteZone, '#ef4444', 10);
        doDelete();
      }
    });
  }
}

// ── Render ──
export async function renderHistoryList(filter = 'all') {
  const listEl = document.getElementById('historyList');
  if (!listEl) return;
  const results = await getAllResults({ filter });
  if (results.length === 0) {
    listEl.innerHTML =
      `<div class="history-empty">${t('history.empty')}</div>`;
    return;
  }

  listEl.innerHTML = results
    .map(r => {
      const isFav = r.favorite ? ' active' : '';
      const srcMap = {
        pdf: t('history.sourcePDF'),
        camera: t('history.sourceCamera'),
        handwrite: t('history.sourceHandwrite'),
      };
      const srcLabel = srcMap[r.source] || t('history.sourceFile');
      return `<div class="history-item-wrap">
        <div class="hi-swipe-bg">
          <div class="hi-swipe-delete">${t('history.delete')}</div>
          <div class="hi-swipe-actions">
            <button class="hi-swipe-btn" data-action="share">${t('btn.share')}</button>
            <button class="hi-swipe-btn" data-action="copy">${t('btn.copy')}</button>
            <span class="hi-swipe-fav-label">${t('history.favorite')}</span>
          </div>
        </div>
        <div class="history-item" data-id="${r.id}">
          <div class="hi-latex">${escapeHtml(r.latex.substring(0, 120))}${
            r.latex.length > 120 ? '…' : ''
          }</div>
          <div class="hi-meta">
            <span class="hi-tag">${srcLabel}</span>
            <span>${new Date(r.createdAt).toLocaleString()}</span>
            <span>${(r.confidence * 100).toFixed(0)}%</span>
            <button class="hi-fav${isFav}" data-action="fav" data-id="${r.id}">★</button>
          </div>
        </div>
      </div>`;
    })
    .join('');

  // ── Init swipe on each card ──
  listEl.querySelectorAll('.history-item').forEach(item => {
    initSwipe(item);
    const s = getState(item);
    s.offsetX = 0;
    s.revealed = false;
    item.style.transform = '';
    item.style.opacity = '';
    item.classList.remove('deleting', 'swiping', 'returning');
    setZoneWidths(item.parentElement.querySelector('.hi-swipe-bg'), 0);
  });

  // ── Close all revealed cards on outside tap ──
  const closeRevealed = () => {
    document.querySelectorAll('.history-item').forEach(el => {
      const s = getState(el);
      if (s.revealed) {
        s.revealed = false;
        s.offsetX = 0;
        el.classList.add('returning');
        el.style.transform = '';
        setZoneWidths(el.parentElement.querySelector('.hi-swipe-bg'), 0);
      }
    });
  };
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('.history-item-wrap')) return;
    closeRevealed();
  });

  // ── Star favorite toggle ──
  listEl.querySelectorAll('.hi-fav[data-action="fav"]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const isFav = await toggleFavorite(id);
      btn.classList.toggle('active', isFav);
    });
  });

  // ── Click card to fill editor ──
  listEl.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.hi-fav')) return;

      const s = getState(item);
      if (s.revealed) {
        s.revealed = false;
        s.offsetX = 0;
        item.classList.add('returning');
        item.style.transform = '';
        return;
      }
      const id = Number(item.dataset.id);
      getAllResults().then(all => {
        const record = all.find(r => r.id === id);
        if (record) setEditorContent(record.latex);
      });
    });
  });
}

// ── Event bindings (called from main.js via event-registry) ──

export function bindEvents() {
  document.getElementById('clearHistory')?.addEventListener('click', async () => {
    const filter = document.querySelector('.history-toolbar button.active')?.dataset?.filter || 'all';
    if (filter === 'favorites') {
      await clearHistory(false);
    } else {
      await clearHistory();
    }
    renderHistoryList(filter);
  });

  document.querySelectorAll('.history-toolbar button[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.history-toolbar button[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderHistoryList(btn.dataset.filter);
    });
  });

  document.querySelector('.bottom-nav button[data-page="history"]')?.addEventListener('click', () => {
    renderHistoryList();
  });
}
