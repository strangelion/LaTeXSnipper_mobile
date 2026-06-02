// Result display, math preview, copy/share/export, PDF browser
import { els } from './dom-refs.js';
import { t } from '../lang/i18n.js';
import Logger from '../shared/logger.js';

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
    MathJax.tex2svgPromise(normalizeMixedLine(line), { display: true }).catch(() => null)
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

/**
 * Normalize a mixed text+formula line for MathJax rendering.
 *
 * MathJax.tex2svgPromise("hello $x^2$ world") treats the whole string as math
 * mode (wrapped in \[...\] for display), so bare $ is a literal character.
 * We need to convert:
 *   text outside $...$ → \text{...}
 *   content inside $...$ → stays as math
 *   pure display math ($$...$$) → unchanged (already a display-only line)
 *
 * Examples:
 *   "hello $x^2$ world"  →  "\text{hello } x^2 \text{ world}"
 *   "just plain text"    →  "\text{just plain text}"
 *   "$$\nf(x)dx\n$$"     →  unchanged
 */
function normalizeMixedLine(line) {
  if (line.startsWith('$$') && line.endsWith('$$')) return line;

  const parts = [];
  let remaining = line;

  while (remaining.length > 0) {
    const openIdx = remaining.indexOf('$');
    if (openIdx === -1) {
      // Remaining text
      parts.push('\\text{' + escapeTextForMath(remaining) + '}');
      break;
    }
    if (openIdx + 1 < remaining.length && remaining[openIdx + 1] === '$') {
      // $$ — shouldn't appear mid-line, pass through
      parts.push(remaining);
      break;
    }
    // Text before inline math
    if (openIdx > 0) {
      parts.push('\\text{' + escapeTextForMath(remaining.substring(0, openIdx)) + '}');
    }
    remaining = remaining.substring(openIdx + 1);
    const closeIdx = remaining.indexOf('$');
    if (closeIdx === -1) {
      // Unclosed $ — treat rest as math
      parts.push(remaining);
      break;
    }
    // Math content
    parts.push(remaining.substring(0, closeIdx));
    remaining = remaining.substring(closeIdx + 1);
  }

  return parts.join(' ').trim();
}

/**
 * Escape TeX special characters that would break inside \text{} in math mode.
 * Order matters: backslash first, then other chars, so \textbackslash doesn't
 * get its braces mangled.
 */
function escapeTextForMath(text) {
  return text
    .replace(/\\/g, '\\textbackslash ')
    .replace(/%/g, '\\%')
    .replace(/#/g, '\\#')
    .replace(/&/g, '\\&')
    .replace(/\$/g, '\\$')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}');
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
  // Only show AI polish when engine != builtin (i.e. has external API configured)
  const hasExternal = (() => {
    try { const s = JSON.parse(localStorage.getItem('ls_settings') || '{}'); return s.engine && s.engine !== 'builtin'; } catch (_) { return false; }
  })();
  ['shareBtn', 'sendToEditorBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = 'block';
  });
  if (hasExternal) {
    const polishBtn = document.getElementById('aiPolishBtn');
    if (polishBtn) polishBtn.style.display = 'block';
  }
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
      els.copyBtn.textContent = t('btn.copied');
      els.copyBtn.classList.add('copied');
      setTimeout(() => {
        els.copyBtn.textContent = t('btn.copyLatex');
        els.copyBtn.classList.remove('copied');
      }, 1500);
    }
    if (navigator.vibrate) navigator.vibrate(30);
  });
}

// ── Share result ──

export async function shareResult() {
  if (!els.resultCode) return;
  const { shareText } = await import('../shared/share.js');
  await shareText(els.resultCode.textContent, {
    title: 'LaTeXSnipper OCR Result',
    dialogTitle: '分享识别结果',
  });
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

/**
 * Render LaTeX lines with MathJax into individual SVG elements,
 * using an offscreen container (no DOM flicker).
 */
async function renderLatexToSvgs(latex) {
  if (!latex || typeof MathJax === 'undefined' || !MathJax.tex2svgPromise) return null;
  const lines = latex.split('\n').filter(l => l.trim());
  if (!lines.length) return null;

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(container);

  try {
    const nodes = await Promise.all(
      lines.map(line =>
        MathJax.tex2svgPromise(normalizeMixedLine(line), { display: true }).catch(() => null)
      )
    );
    const svgs = nodes.filter(Boolean).map(n => n.querySelector('svg')).filter(Boolean);
    return svgs.length ? svgs : null;
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Combine multiple MathJax SVGs into one composite SVG.
 *
 * Key fixes versus old approach:
 *  - Properly handles negative viewBox y (ascenders above baseline)
 *  - Extracts <defs> to composite level so glyphs / font paths render
 *  - viewBox covers the full bounding box of all rows
 *  - Auto-sizes width/height from actual content
 */
function combineSvgs(svgs) {
  if (!svgs.length) return null;
  if (svgs.length === 1) {
    const c = svgs[0].cloneNode(true);
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return c;
  }

  // Pull defs out of children so they work, compute row bounding boxes
  const rows = [];
  let yOff = 0;
  let contentMaxW = 0;

  for (const svg of svgs) {
    const el = svg.cloneNode(true);
    const vbStr = el.getAttribute('viewBox') || '0 0 400 200';
    const [vbx, vby, vbw, vbh] = vbStr.trim().split(/[,\s]+/).map(Number);
    el.removeAttribute('width');
    el.removeAttribute('height');

    // Extract <defs> to composite level
    const defs = el.querySelector('defs');
    if (defs) defs.remove();

    const rowTop = yOff + vby;
    const rowBot = yOff + vby + vbh;
    rows.push({ el, rowTop, rowBot, w: vbw });
    if (vbw > contentMaxW) contentMaxW = vbw;
    yOff += vbh;
  }

  // Full bounding box across all rows
  const minY = rows.reduce((m, r) => Math.min(m, r.rowTop), Infinity);
  const maxY = rows.reduce((m, r) => Math.max(m, r.rowBot), -Infinity);
  const totalH = maxY - minY;

  // Build composite
  const svgNs = 'http://www.w3.org/2000/svg';
  const composite = document.createElementNS(svgNs, 'svg');
  composite.setAttribute('xmlns', svgNs);
  composite.setAttribute('width', contentMaxW);
  composite.setAttribute('height', totalH);
  composite.setAttribute('viewBox', [0, minY, contentMaxW, totalH].join(' '));

  // Add padding around content
  const PAD = 20;
  const dispW = contentMaxW + PAD * 2;
  const dispH = totalH + PAD * 2;
  composite.setAttribute('width', dispW);
  composite.setAttribute('height', dispH);
  composite.setAttribute('viewBox', [-PAD, minY - PAD, dispW, dispH].join(' '));

  // Re-attach defs at composite level
  const allDefs = [];
  for (const svg of svgs) {
    const defs = svg.querySelector('defs');
    if (defs) allDefs.push(...defs.children);
  }
  if (allDefs.length) {
    const defsEl = document.createElementNS(svgNs, 'defs');
    allDefs.forEach(d => defsEl.appendChild(d.cloneNode(true)));
    composite.appendChild(defsEl);
  }

  // Groups: each row shifted by its baseline offset within the composite
  yOff = 0;
  for (const svg of svgs) {
    const el = svg.cloneNode(true);
    const vbStr = el.getAttribute('viewBox') || '0 0 400 200';
    const vbh = vbStr.trim().split(/[,\s]+/).map(Number)[3] || 200;
    el.removeAttribute('width');
    el.removeAttribute('height');
    const defs = el.querySelector('defs');
    if (defs) defs.remove();

    const g = document.createElementNS(svgNs, 'g');
    g.setAttribute('transform', 'translate(0,' + yOff + ')');
    while (el.firstChild) g.appendChild(el.firstChild);
    composite.appendChild(g);
    yOff += vbh;
  }

  return composite;
}

export async function exportPNG() {
  const latex = els.resultCode?.textContent;
  if (!latex) { Logger.warn('EXPORT', 'No result text'); return; }
  try {
    Logger.info('EXPORT', 'Rendering LaTeX for PNG export');
    const svgs = await renderLatexToSvgs(latex);
    if (!svgs) { Logger.warn('EXPORT', 'No SVGs from MathJax'); return; }
    Logger.info('EXPORT', 'Exporting PNG (' + svgs.length + ' rows)');
    const composite = combineSvgs(svgs);
    if (!composite) return;
    const blob = await svgToPngBlob(composite);
    if (!blob) return;
    const { shareFile } = await import('../shared/share.js');
    await shareFile(blob, 'formula.png', latex, { title: 'LaTeXSnipper' });
  } catch (e) { Logger.error('EXPORT', 'exportPNG failed', e); }
}

export async function exportSVG() {
  const latex = els.resultCode?.textContent;
  if (!latex) { Logger.warn('EXPORT', 'No result text'); return; }
  try {
    Logger.info('EXPORT', 'Rendering LaTeX for SVG export');
    const svgs = await renderLatexToSvgs(latex);
    if (!svgs) { Logger.warn('EXPORT', 'No SVGs from MathJax'); return; }
    Logger.info('EXPORT', 'Exporting SVG (' + svgs.length + ' rows)');
    const composite = combineSvgs(svgs);
    if (!composite) return;
    const svgStr = new XMLSerializer().serializeToString(composite);
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svgStr], { type: 'image/svg+xml' });
    const { shareFile } = await import('../shared/share.js');
    await shareFile(blob, 'formula.svg', latex, { title: 'LaTeXSnipper' });
  } catch (e) { Logger.error('EXPORT', 'exportSVG failed', e); }
}

async function svgToPngBlob(svgEl) {
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const w = parseFloat(clone.getAttribute('width')) || 400;
  const h = parseFloat(clone.getAttribute('height')) || 200;
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  const data = new XMLSerializer().serializeToString(clone);
  const canvas = document.createElement('canvas');
  // 2x retina quality, capped at 4096 to avoid OOM
  const scale = Math.min(2, 4096 / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0); canvas.toBlob(resolve, 'image/png'); };
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
