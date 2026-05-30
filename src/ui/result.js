// Result display, math preview, copy/share/export, PDF browser
import { els } from './dom-refs.js';

// ── PDF page browser state ──
let _pdfPages = [];
let _currentPdfPage = 0;

// ── Math rendering (internal) ──

function renderMathPreview(latex) {
  if (!els.mathPreview) return;
  if (!latex || typeof MathJax === 'undefined' || !MathJax.tex2svgPromise) {
    els.mathPreview.classList.remove('show');
    return;
  }
  const lines = latex.split('\n').filter(l => l.trim());
  if (lines.length === 0) { els.mathPreview.classList.remove('show'); return; }
  els.mathPreview.innerHTML = '';
  Promise.all(lines.map(line =>
    MathJax.tex2svgPromise(line, { display: true }).catch(() => null)
  )).then(nodes => {
    nodes.forEach(node => {
      if (node) {
        const wrapper = document.createElement('div');
        wrapper.className = 'math-line';
        wrapper.appendChild(node);
        els.mathPreview.appendChild(wrapper);
      }
    });
    els.mathPreview.classList.add('show');
  }).catch(() => { els.mathPreview.classList.remove('show'); });
}

// ── Result display ──

export function showResult(latex, confidence, extra) {
  if (!els.resultCode || !els.resultCard) return;
  els.resultCode.textContent = latex;
  renderMathPreview(latex);
  const confPct = (confidence * 100).toFixed(1);
  if (els.confidence) els.confidence.textContent = extra
    ? '置信度 ' + confPct + '% | ' + extra
    : '置信度 ' + confPct + '%';
  els.resultCard.classList.add('show');
  if (els.copyBtn) els.copyBtn.style.display = 'block';
  ['shareBtn', 'sendToEditorBtn', 'aiPolishBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = 'block';
  });
  ['exportPngBtn', 'exportSvgBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = 'inline-block';
  });
}

export function hideResult() {
  if (els.resultCard) els.resultCard.classList.remove('show');
  if (els.copyBtn) els.copyBtn.style.display = 'none';
  ['shareBtn', 'sendToEditorBtn', 'aiPolishBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = 'none';
  });
}

// ── Copy result ──

export function copyResult() {
  if (!els.resultCode) return;
  const text = els.resultCode.textContent;
  const lines = text.split('\n').filter(l => l.trim());
  const formatted = lines.map(l => '$$\n' + l.trim() + '\n$$').join('\n');
  navigator.clipboard.writeText(formatted).then(() => {
    if (els.copyBtn) {
      els.copyBtn.textContent = '已复制 ✓';
      els.copyBtn.classList.add('copied');
      setTimeout(() => {
        els.copyBtn.textContent = '复制 LaTeX';
        els.copyBtn.classList.remove('copied');
      }, 1500);
    }
    if (navigator.vibrate) navigator.vibrate(30);
  });
}

// ── Share result ──

export async function shareResult() {
  if (!els.resultCode) return;
  const text = els.resultCode.textContent;
  if (!navigator.share) { copyResult(); return; }
  try {
    const svg = els.mathPreview?.querySelector('svg');
    const files = [];
    if (svg) {
      try {
        const blob = await svgToPngBlob(svg);
        if (blob) files.push(new File([blob], 'formula.png', { type: 'image/png' }));
      } catch (_) { /* render failed */ }
    }
    await navigator.share({
      title: 'LaTeXSnipper OCR Result',
      text,
      ...(files.length ? { files } : {}),
    });
  } catch (e) { /* user cancelled */ }
}

// ── PDF page browser ──

export function showPDFBrowser(pages) {
  if (!pages || pages.length < 2) { hidePDFBrowser(); return; }
  _pdfPages = pages;
  _currentPdfPage = 0;
  const browser = document.getElementById('pdfBrowser');
  if (!browser) return;
  browser.style.display = 'flex';
  renderPDFThumbnails();
  gotoPDFPage(0);
}

export function hidePDFBrowser() {
  _pdfPages = [];
  _currentPdfPage = 0;
  const browser = document.getElementById('pdfBrowser');
  if (browser) browser.style.display = 'none';
}

export function gotoPDFPage(n) {
  if (!_pdfPages.length || n < 0 || n >= _pdfPages.length) return;
  _currentPdfPage = n;
  const page = _pdfPages[n];
  if (els.resultCode) els.resultCode.textContent = page.latex;
  if (els.confidence) els.confidence.textContent = '置信度 ' + (page.confidence * 100).toFixed(1) + '%';
  const info = document.getElementById('pdfPageInfo');
  if (info) info.textContent = (n + 1) + ' / ' + _pdfPages.length;
  const tex = page.latex?.replace(/\n/g, ' ').trim();
  if (els.mathPreview && tex && typeof MathJax !== 'undefined' && MathJax.tex2svgPromise) {
    MathJax.tex2svgPromise(tex).then(node => {
      els.mathPreview.innerHTML = '';
      els.mathPreview.appendChild(node);
      els.mathPreview.classList.add('show');
    }).catch(() => {});
  }
  document.querySelectorAll('.pdf-thumb').forEach((t, i) => t.classList.toggle('active', i === n));
}

function renderPDFThumbnails() {
  const strip = document.getElementById('pdfThumbstrip');
  if (!strip) return;
  strip.innerHTML = _pdfPages.map((p, i) =>
    `<img class="pdf-thumb" src="${p.thumb}" data-page="${i}" alt="Page ${p.page}">`
  ).join('');
  strip.querySelectorAll('.pdf-thumb').forEach(img => {
    img.addEventListener('click', () => gotoPDFPage(Number(img.dataset.page)));
  });
}

export function initPDFNav() {
  const prev = document.getElementById('pdfPrev');
  const next = document.getElementById('pdfNext');
  if (prev) prev.addEventListener('click', () => gotoPDFPage(_currentPdfPage - 1));
  if (next) next.addEventListener('click', () => gotoPDFPage(_currentPdfPage + 1));
}

// ── Export formula as PNG / SVG ──

export function exportPNG() {
  const svg = els.mathPreview?.querySelector('svg');
  if (!svg) return;
  svgToPngBlob(svg).then(blob => {
    if (!blob) return;
    downloadBlob(blob, 'formula.png');
  }).catch(() => {});
}

export function exportSVG() {
  const svg = els.mathPreview?.querySelector('svg');
  if (!svg) return;
  const clone = svg.cloneNode(true);
  const data = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([data], { type: 'image/svg+xml' });
  downloadBlob(blob, 'formula.svg');
}

async function svgToPngBlob(svg) {
  const clone = svg.cloneNode(true);
  const bbox = svg.getBBox ? svg.getBBox() : { width: 400, height: 200 };
  const w = Math.ceil(bbox.width) + 16;
  const h = Math.ceil(bbox.height) + 16;
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  const data = new XMLSerializer().serializeToString(clone);
  const canvas = document.createElement('canvas');
  canvas.width = w * 2; canvas.height = h * 2;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(2, 2);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(resolve, 'image/png');
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(data)));
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Export for use by polish.js
export { renderMathPreview };
