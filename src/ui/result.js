// Result display, math preview, copy/share/export, PDF browser
import { els } from './dom-refs.js';
import { t } from '../lang/i18n.js';
import Logger from '../shared/logger.js';

// ── Render engine (MathJax support) ──
let _mathjaxRenderer = null;
function getRenderEngine() {
  return window.__renderEngine || 'katex';
}
/** Lazy-load and get the MathJax renderer module */
async function ensureMathjax() {
  if (_mathjaxRenderer) return;
  const mod = await import('../editor/mathjax-renderer.js');
  mod.ensureMathjax();
  _mathjaxRenderer = mod;
}
/** Render a single LaTeX block using the selected engine */
async function renderBlockWithEngine(block, displayMode = true) {
  const engine = getRenderEngine();
  if (engine === 'mathjax') {
    await ensureMathjax();
    if (_mathjaxRenderer && _mathjaxRenderer.isMathjaxReady()) {
      return await _mathjaxRenderer.renderMathjax(block, displayMode);
    }
  }
  // Fallback to KaTeX (default)
  return katex.renderToString(block, {
    throwOnError: false, displayMode, output: 'html', strict: false,
  });
}

// ── PDF page browser state ──
let _pdfPages = [];
let _currentPdfPage = 0;

// ── Math rendering (KaTeX) ──

/** Check if KaTeX is loaded */
function hasKatex() {
  return typeof katex !== 'undefined' && typeof katex.renderToString === 'function';
}

/**
 * Render multi-line LaTeX to HTML via KaTeX or MathJax.
 *
 * Strategy:
 *   1. Group logical blocks (environment \begin...\end groups stay together).
 *   2. For each block that contains LaTeX commands or $ delimiters, try
 *      display-mode rendering first; fall back to inline $...$ splitting
 *      for mixed text/formula blocks.
 *   3. Pure text (no $, no \) is escaped for safety.
 *
 * This ensures multi-line environments like aligned/cases/matrix render as
 * a single block instead of being broken line-by-line.
 *
 * Returns a Promise that resolves once HTML is set on the preview element.
 */
async function renderMathPreview(latex) {
  if (!els.mathPreview) return;
  if (!latex || !hasKatex()) {
    els.mathPreview.classList.remove('show');
    return;
  }
  const blocks = groupIntoBlocks(latex);
  if (blocks.length === 0) { els.mathPreview.classList.remove('show'); return; }
  els.mathPreview.innerHTML = '';

  const allHtml = [];
  for (const block of blocks) {
    try {
      allHtml.push(await renderBlock(block));
    } catch (_) {
      allHtml.push(escapeHtml(block));
    }
  }

  els.mathPreview.innerHTML = allHtml.join('');
  els.mathPreview.classList.add('show');
}

/**
 * Split LaTeX text into renderable blocks, keeping environment
 * (\begin{…} … \end{…}) groups intact across newlines.
 */
function groupIntoBlocks(latex) {
  const lines = latex.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect display-math $$...$$ spanning multiple lines
    if (trimmed.startsWith('$$')) {
      let blockLines = [line];
      i++;
      while (i < lines.length && !lines[i].trim().endsWith('$$')) {
        blockLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) blockLines.push(lines[i]);
      i++;
      blocks.push(blockLines.join('\n'));
      continue;
    }

    // Detect environment \begin{…}
    if (/^\\begin\{/.test(trimmed)) {
      let blockLines = [line];
      let depth = 1;
      i++;
      while (i < lines.length && depth > 0) {
        const l = lines[i];
        blockLines.push(l);
        if (/\\begin\{/.test(l)) depth++;
        if (/\\end\{/.test(l)) depth--;
        i++;
      }
      blocks.push(blockLines.join('\n'));
      continue;
    }

    // Regular single line
    if (trimmed) blocks.push(line);
    i++;
  }
  return blocks;
}

/**
 * Render one block (single line or multi-line environment) via the selected engine.
 *
 * Priority:
 *   1. $$…$$ display math — unwrap and render.
 *   2. $…$ inline math — split text around $ delimiters, render math
 *      segments with inline mode, escape text segments.
 *   3. LaTeX commands with no $ delimiters — render as display math.
 *   4. Plain text (no $, no \) — escape for HTML safety.
 */
async function renderBlock(block) {
  if (!block.trim()) return '';
  if (!hasKatex()) return escapeHtml(block);

  const trimmed = block.trim();
  const engine = getRenderEngine();
  const isMathjax = engine === 'mathjax';

  // ── Case A: Display math wrapped in $$…$$ (possibly multi-line) ──
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    try {
      return await renderBlockWithEngine(trimmed.slice(2, -2).trim(), true);
    } catch (_) {
      return escapeHtml(block);
    }
  }

  // ── Case B: Mixed content with $…$ inline delimiters ──
  if (trimmed.includes('$')) {
    return await renderMixedContent(trimmed);
  }

  // ── Case C: Has math-specific operators → try rendering ──
  //   Catches formulas without \ like "a^2 + b^2 = c^2", "x_{n+1}",
  //   or simple math like "1 + 2 = 3".
  //   Math operators that almost never appear alone in plain text:
  //     ^ _ { } & ~ # \ = (common LaTeX delimiters)
  //   Note: = is included because OCR formula output frequently has
  //   equals signs in simple math like "y = kx + b" that lack \.
  const hasMathOps = /[\\^{}_&#~=]/.test(trimmed);
  if (hasMathOps) {
    try {
      return await renderBlockWithEngine(trimmed, true);
    } catch (e) {
      try {
        return await renderBlockWithEngine(trimmed, false);
      } catch (_) {
        return escapeHtml(block);
      }
    }
  }

  // ── Case D: Pure text (no math patterns) — escape for HTML safety
  return escapeHtml(block);
}

/**
 * Render content that may mix plain text and $…$ inline formula segments.
 *
 * Splits on $…$ boundaries: text outside $ is escaped, content inside
 * $ is rendered via selected engine. Unclosed $ is treated as literal text.
 */
async function renderMixedContent(line) {
  const parts = [];
  let remaining = line;

  while (remaining.length > 0) {
    const openIdx = remaining.indexOf('$');
    if (openIdx === -1) {
      // No more formula delimiters → text segment
      parts.push(escapeHtml(remaining));
      break;
    }
    // Text before $
    if (openIdx > 0) {
      parts.push(escapeHtml(remaining.slice(0, openIdx)));
    }
    remaining = remaining.slice(openIdx + 1);
    const closeIdx = remaining.indexOf('$');
    if (closeIdx === -1) {
      // Unclosed $ → treat rest as literal text
      parts.push(escapeHtml('$' + remaining));
      break;
    }
    // Math segment between $…$
    const mathContent = remaining.slice(0, closeIdx);
    try {
      parts.push(await renderBlockWithEngine(mathContent, false));
    } catch (_) {
      // Render failure: show raw source
      parts.push(escapeHtml('$' + mathContent + '$'));
    }
    remaining = remaining.slice(closeIdx + 1);
  }

  return parts.join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Result display ──

export function showResult(latex, confidence, extra) {
  if (!els.resultCode || !els.resultCard) return;
  els.resultCode.textContent = latex;
  renderMathPreview(latex).catch(() => {});
  const confPct = (confidence * 100).toFixed(1);
  if (els.confidence) els.confidence.textContent = extra
    ? '置信度 ' + confPct + '% | ' + extra
    : '置信度 ' + confPct + '%';
  els.resultCard.classList.add('show');
  if (els.copyBtn) els.copyBtn.style.display = 'block';
  // i18n for engine check
  const engine = (() => {
    try { const s = JSON.parse(localStorage.getItem('ls_settings') || '{}'); return s.engine; } catch (_) { return null; }
  })() || localStorage.getItem('ls_engine') || 'builtin';
  const hasExternal = engine && engine !== 'builtin';
  ['shareBtn', 'sendToEditorBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = 'block';
  });
  if (hasExternal) {
    const polishBtn = document.getElementById('aiPolishBtn');
    if (polishBtn) polishBtn.style.display = 'block';
  }
  // Show export dropdown
  const exportContainer = document.getElementById('exportDropdownContainer');
  if (exportContainer) exportContainer.style.display = 'block';
}

export function hideResult() {
  if (els.resultCard) els.resultCard.classList.remove('show');
  if (els.copyBtn) els.copyBtn.style.display = 'none';
  ['shareBtn', 'sendToEditorBtn', 'aiPolishBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = 'none';
  });
  const exportContainer = document.getElementById('exportDropdownContainer');
  if (exportContainer) exportContainer.style.display = 'none';
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
  if (els.mathPreview && tex && hasKatex()) {
    const engine = getRenderEngine();
    if (engine === 'mathjax') {
      renderMathPreview(page.latex).catch(() => {});
    } else {
      try {
        els.mathPreview.innerHTML = katex.renderToString(tex, { throwOnError: false, displayMode: true, output: 'html' });
        els.mathPreview.classList.add('show');
      } catch (_) {
        els.mathPreview.classList.remove('show');
      }
    }
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
 * Render LaTeX lines with KaTeX into individual HTML strings, then
 * convert to SVG for export. Uses the same renderBlock logic as
 * renderMathPreview (handles mixed text+$...$, empty $$ lines, etc.).
 */
async function renderLatexToSvgs(latex) {
  if (!latex || !hasKatex()) return null;
  const blocks = groupIntoBlocks(latex);
  if (!blocks.length) return null;

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;font-size:20px';
  document.body.appendChild(container);

  try {
    const svgs = [];
    for (const block of blocks) {
      let html;
      try {
        const rendered = await renderBlock(block);
        // renderBlock may return escaped plain text for pure text blocks;
        // that's fine for the SVG foreignObject
        html = rendered;
      } catch (_) {
        html = escapeHtml(block);
      }

      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'white-space:nowrap;padding:8px';
      wrapper.innerHTML = html;
      container.appendChild(wrapper);

      const bbox = wrapper.getBoundingClientRect();
      const w = Math.max(bbox.width, 20);
      const h = Math.max(bbox.height, 20);

      // Create an SVG with foreignObject wrapping the rendered HTML
      const svgNs = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNs, 'svg');
      svg.setAttribute('xmlns', svgNs);
      svg.setAttribute('width', w);
      svg.setAttribute('height', h);
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);

      const foreign = document.createElementNS(svgNs, 'foreignObject');
      foreign.setAttribute('width', w);
      foreign.setAttribute('height', h);
      foreign.setAttribute('x', '0');
      foreign.setAttribute('y', '0');

      const div = document.createElementNS(svgNs, 'div');
      div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
      div.style.cssText = 'width:' + w + 'px;height:' + h + 'px;overflow:visible;font-size:20px';
      div.innerHTML = html;

      // Copy computed styles from the temp wrapper
      const styles = window.getComputedStyle(wrapper);
      div.style.fontFamily = styles.fontFamily;
      div.style.lineHeight = styles.lineHeight;
      div.style.color = '#000000';

      foreign.appendChild(div);
      svg.appendChild(foreign);

      container.removeChild(wrapper);
      svgs.push(svg);
    }

    return svgs.length ? svgs : null;
  } finally {
    if (container.parentNode) document.body.removeChild(container);
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

// Export for use by polish.js and pandoc-export.js
export { renderMathPreview, renderLatexToSvgs, combineSvgs, svgToPngBlob };
