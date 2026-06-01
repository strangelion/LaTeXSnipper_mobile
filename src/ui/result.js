// Result display, math preview, copy/share/export, PDF browser
import { els } from './dom-refs.js';
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

/** Collect all SVG elements from math preview lines, return as array */
function getMathSvgs() {
  return Array.from(els.mathPreview?.querySelectorAll('.math-line svg') || []);
}

/**
 * Combine multiple SVG elements into a single composite SVG.
 * Each child SVG is placed in a <g transform="translate(0, y)"> stack.
 */
function combineSvgs(svgs) {
  if (!svgs.length) return null;
  if (svgs.length === 1) {
    const c = svgs[0].cloneNode(true);
    if (!c.getAttribute('xmlns')) c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return c;
  }

  let maxW = 0, yOff = 0;
  const groups = svgs.map(svg => {
    const clone = svg.cloneNode(true);
    const vb = (clone.getAttribute('viewBox') || '').split(/[ ,]+/).map(Number);
    const w = vb[2] || parseFloat(clone.getAttribute('width')) || 400;
    const h = vb[3] || parseFloat(clone.getAttribute('height')) || 200;
    // Remove width/height on child so they don't clip; use viewBox for scaling
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(0,' + yOff + ')');
    while (clone.firstChild) g.appendChild(clone.firstChild);
    yOff += h;
    if (w > maxW) maxW = w;
    return g;
  });

  const composite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  composite.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  composite.setAttribute('width', maxW);
  composite.setAttribute('height', yOff);
  composite.setAttribute('viewBox', '0 0 ' + maxW + ' ' + yOff);
  groups.forEach(g => composite.appendChild(g));
  return composite;
}

export async function exportPNG() {
  const svgs = getMathSvgs();
  if (!svgs.length) {
    Logger.warn('EXPORT', 'No SVG found in math preview to export as PNG');
    return;
  }
  try {
    const composite = combineSvgs(svgs);
    if (!composite) return;
    const blob = await svgToPngBlob(composite);
    if (!blob) {
      Logger.warn('EXPORT', 'SVG→PNG conversion returned null blob');
      return;
    }
    Logger.info('EXPORT', 'Exporting PNG (' + blob.size + ' bytes, ' + svgs.length + ' lines)');
    const { shareFile } = await import('../shared/share.js');
    await shareFile(blob, 'formula.png', els.resultCode?.textContent || '', { title: 'LaTeXSnipper', dialogTitle: '分享公式图片' });
  } catch (e) {
    Logger.error('EXPORT', 'exportPNG failed', e);
  }
}

export async function exportSVG() {
  const svgs = getMathSvgs();
  if (!svgs.length) {
    Logger.warn('EXPORT', 'No SVG found in math preview to export');
    return;
  }
  try {
    const composite = combineSvgs(svgs);
    if (!composite) return;
    const svgStr = new XMLSerializer().serializeToString(composite);
    const data = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgStr;
    const blob = new Blob([data], { type: 'image/svg+xml' });
    Logger.info('EXPORT', 'Exporting SVG (' + blob.size + ' bytes, ' + svgs.length + ' lines)');
    const { shareFile } = await import('../shared/share.js');
    await shareFile(blob, 'formula.svg', els.resultCode?.textContent || '', { title: 'LaTeXSnipper', dialogTitle: '分享公式 SVG' });
  } catch (e) {
    Logger.error('EXPORT', 'exportSVG failed', e);
  }
}

async function svgToPngBlob(svgElement) {
  const clone = svgElement.cloneNode(true);
  // Ensure xmlns attribute for Data URI loading
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const w = parseFloat(clone.getAttribute('width')) || 400;
  const h = parseFloat(clone.getAttribute('height')) || 200;
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
