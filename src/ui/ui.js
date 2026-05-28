// UI module — status bar, progress, result display, event bindings
// Extracted from ocr_demo.html

import { isReady, recognize, loadTokenizer, loadModels } from '../ocr/ocr-engine.js';
import { isTextDetReady, detectText, cropTextRegion, loadTextDetModel } from '../ocr/text-detection.js';
import { isDetReady, detectFormulas, cropRegion, maskFormulaRegions, loadFormulaDetModel } from '../ocr/formula-detection.js';
import { isTesseractReady, recognizeText, loadTesseract } from '../ocr/tesseract-recognition.js';
import { isTextRecReady, recognizeText as recognizeTextPP, recognizeTextAuto, loadTextRecModel, loadEnRecModel } from '../ocr/text-recognition.js';
import { isRegionDetReady, detectRegions, cropRegion as cropRegionDetect, groupRegionsByLine, loadRegionDetectModel } from '../ocr/region-detect.js';
import { preprocessForOCR, enhanceHandwriting } from '../ocr/image-preprocess.js';
import { loadDocOriModel } from '../ocr/doc-preprocess.js';
import { processPDF } from '../ocr/pdf-processor.js';
import { toggleTheme, getThemeIcon, getTheme } from './theme.js';
import { ICONS } from '../constants.js';

// ── Splash screen progress ──

const MODEL_WEIGHTS = {
  '分词器': 2,
  '编码器模型': 50,
  'Tesseract': 8,
  '文字检测': 6,
  '公式检测': 8,
  '区域检测': 6,
  '中文OCR': 10,
  '英文OCR': 6,
  '方向检测': 4,
};

let splashProgress = {}; // modelName -> pct (0-100, -1=cached)

function updateSplash(modelName, pct) {
  const el = document.getElementById('splash');
  if (!el) return;
  splashProgress[modelName] = pct;

  // Compute weighted overall progress
  let totalWeight = 0, weightedSum = 0;
  for (const [name, weight] of Object.entries(MODEL_WEIGHTS)) {
    totalWeight += weight;
    const p = splashProgress[name];
    if (p !== undefined) {
      weightedSum += weight * Math.max(0, p) / 100;
    }
  }
  const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight * 100) : 0;

  const fill = document.getElementById('splashProgressFill');
  const label = document.getElementById('splashProgressLabel');
  const pctEl = document.getElementById('splashProgressPct');
  if (fill) fill.style.width = overall + '%';
  if (pctEl) pctEl.textContent = overall + '%';

  if (pct < 0) {
    if (label) label.textContent = modelName + ' (已缓存)';
  } else if (pct === 100) {
    if (label) label.textContent = modelName + ' ✓';
  } else if (pct >= 0) {
    if (label) label.textContent = modelName + '… ' + Math.round(pct) + '%';
  }

  // Update model tags
  const container = document.getElementById('splashModels');
  if (container) {
    let tag = container.querySelector(`[data-model="${modelName}"]`);
    if (!tag) {
      tag = document.createElement('span');
      tag.className = 'splash-model-tag';
      tag.dataset.model = modelName;
      tag.textContent = modelName;
      container.appendChild(tag);
    }
    tag.classList.remove('splash-model-tag--loaded', 'splash-model-tag--error');
    if (pct === 100 || pct < 0) tag.classList.add('splash-model-tag--loaded');
  }
}

export function hideSplash() {
  const el = document.getElementById('splash');
  if (!el || el.classList.contains('splash--hidden')) return;
  el.classList.add('splash--hidden');
  // Remove from DOM after CSS transition completes
  setTimeout(() => { if (el.parentNode) el.remove(); }, 600);
}

// DOM refs (set by initUI)
let els = {};
let fileInputHandler = null;
let lastRecognitionTime = 0;

// PDF page browser state
let _pdfPages = [];
let _currentPdfPage = 0;

export function initUI(elementMap) {
  els = elementMap;
  _initPDFNav();
  bindGlobalEvents();
}

// ── Status bar ──

export function setStatus(type, text, showSpin) {
  if (!els.statusIcon || !els.statusText || !els.spinner) return;
  els.statusIcon.innerHTML = ICONS[type] || ICONS.loading;
  els.statusText.textContent = text;
  els.spinner.classList.toggle('show', showSpin);
}

export function showError(msg) {
  if (!els.errorMsg) return;
  els.errorMsg.style.display = 'block';
  els.errorMsg.textContent = msg;
  setStatus('error', '加载失败', false);
}

// ── Progress bar ──

export function showProgress(label, pct) {
  if (!els.progressWrap) return;
  els.progressWrap.classList.add('show');
  if (els.progressFile) els.progressFile.textContent = label;
  if (pct >= 0 && els.progressFill) {
    els.progressFill.style.width = pct + '%';
    if (els.progressPercent) els.progressPercent.textContent = pct + '%';
  }
}

export function hideProgress() {
  if (els.progressWrap) els.progressWrap.classList.remove('show');
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
  const shareBtn = document.getElementById('shareBtn');
  const sendBtn = document.getElementById('sendToEditorBtn');
  const exportPng = document.getElementById('exportPngBtn');
  const exportSvg = document.getElementById('exportSvgBtn');
  if (shareBtn) shareBtn.style.display = 'block';
  if (sendBtn) sendBtn.style.display = 'block';
  if (exportPng) exportPng.style.display = 'inline-block';
  if (exportSvg) exportSvg.style.display = 'inline-block';
}

export function hideResult() {
  if (els.resultCard) els.resultCard.classList.remove('show');
  if (els.copyBtn) els.copyBtn.style.display = 'none';
  const shareBtn = document.getElementById('shareBtn');
  const sendBtn = document.getElementById('sendToEditorBtn');
  if (shareBtn) shareBtn.style.display = 'none';
  if (sendBtn) sendBtn.style.display = 'none';
}

function renderMathPreview(latex) {
  if (!els.mathPreview) return;
  if (!latex || typeof MathJax === 'undefined' || !MathJax.tex2svgPromise) {
    els.mathPreview.classList.remove('show');
    return;
  }
  // Render each line as a separate display block
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

// ── Copy result ──

export function copyResult() {
  if (!els.resultCode) return;
  const text = els.resultCode.textContent;
  // Split on newlines, wrap each line in its own $$ block for proper multi-line rendering
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
    // Try to render formula as PNG for richer sharing
    const svg = els.mathPreview?.querySelector('svg');
    const files = [];
    if (svg) {
      try {
        const blob = await svgToPngBlob(svg);
        if (blob) files.push(new File([blob], 'formula.png', { type: 'image/png' }));
      } catch (_) { /* render failed, share text only */ }
    }
    await navigator.share({
      title: 'LaTeXSnipper OCR Result',
      text: text,
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
  _pdfPages = []; _currentPdfPage = 0;
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
  // Render preview
  const tex = page.latex?.replace(/\n/g, ' ').trim();
  if (els.mathPreview && tex && typeof MathJax !== 'undefined' && MathJax.tex2svgPromise) {
    MathJax.tex2svgPromise(tex).then(node => {
      els.mathPreview.innerHTML = '';
      els.mathPreview.appendChild(node);
      els.mathPreview.classList.add('show');
    }).catch(() => {});
  }
  // Highlight active thumbnail
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

function _initPDFNav() {
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

// ── Image processing entry point ──

export async function processImage(file) {
  if (!isReady()) { showError('模型尚未加载完成，请稍等'); return; }

  // Check external model config
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem('ls_settings') || '{}'); } catch (_) {}

  if (settings.engine && settings.engine !== 'builtin' && settings.baseUrl) {
    return processImageExternal(file, settings);
  }

  // Local ONNX inference

  if (file.size < 1024) { showError('文件太小，至少 1KB'); return; }

  // PDF branch
  if (file.type === 'application/pdf') {
    hideResult();
    hidePDFBrowser();
    if (els.errorMsg) els.errorMsg.style.display = 'none';
    setStatus('processing', '正在解析 PDF…', true);
    try {
      const pdfResult = await processPDF(file, (info) => {
        showProgress('PDF 第 ' + info.page + '/' + info.total + ' 页', info.pct);
      });
      hideProgress();
      lastRecognitionTime = Date.now();
      if (pdfResult.pages && pdfResult.pages.length > 1) {
        showPDFBrowser(pdfResult.pages);
        showResult(pdfResult.pages[0].latex, pdfResult.pages[0].confidence, pdfResult.pageCount + ' 页');
      } else {
        showResult(pdfResult.latex, pdfResult.confidence, pdfResult.pageCount + ' 页');
      }
      setStatus('done', '识别完成（' + pdfResult.pageCount + ' 页）', false);
      if (fileInputHandler) fileInputHandler(pdfResult, file);
      return pdfResult;
    } catch (e) { showError(e.message); setStatus('ready', '模型就绪！拖入公式图片开始识别', false); return null; }
  }

  // Image branch: preview → recognize
  const url = URL.createObjectURL(file);
  if (els.preview) {
    els.preview.src = url;
    els.preview.style.display = 'block';
  }
  if (els.dropContent) els.dropContent.style.display = 'none';
  hideResult();
  if (els.errorMsg) els.errorMsg.style.display = 'none';
  setStatus('processing', '正在识别…', true);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const mode = window.__recogMode?.() || 'formula';
        let result;
        console.debug('[ocr] mode=' + mode);
        if (mode === 'text' && isTesseractReady()) {
          // Text mode: tesseract.js
          const text = await recognizeText(img);
          result = { latex: '\\text{' + text + '}', confidence: 0.8 };
        } else if (mode === 'mixed' && (isRegionDetReady() || isTesseractReady())) {
          // Mixed mode: region detection + per-region recognition
          result = await processMixedMode(img);
        } else if (mode === 'text' && isTextDetReady() && isTextRecReady()) {
          // Text mode: use PP-OCRv5 text detection + text recognition pipeline
          const boxes = await detectText(img);
          if (boxes.length === 0) {
            result = await recognize(img, 'formula');
          } else {
            const lines = [];
            let totalConf = 0;
            for (const box of boxes) {
              const crop = cropTextRegion(img, box);
              try {
                const enhanced = enhanceHandwriting(crop);
                const text = await recognizeTextAuto(enhanced);
                if (text && text.trim()) { lines.push(text.trim()); totalConf += 0.8; }
              } catch (e) {}
            }
            result = lines.length > 0
              ? { latex: lines.join('\n'), confidence: totalConf / boxes.length }
              : await recognize(img, 'formula');
          }
        } else {
          // Formula mode or fallback
          result = await recognize(img, mode);
        }
        lastRecognitionTime = Date.now();
        URL.revokeObjectURL(url);
        if (!result.latex) {
          showError('未识别到内容（置信度 ' + (result.confidence * 100).toFixed(1) + '% 过低），请重新尝试');
          setStatus('ready', '模型就绪！请重新上传图片', false);
          resolve(null);
          return;
        }
        showResult(result.latex, result.confidence);
        setStatus('done', '识别完成', false);
        if (fileInputHandler) fileInputHandler(result, file);
        resolve(result);
      } catch (e) {
        URL.revokeObjectURL(url);
        showError('识别失败: ' + (e.message || e));
        setStatus('ready', '模型就绪！拖入公式图片开始识别', false);
        resolve(null);
      }
    };
    img.src = url;
  });
}

// ── Mixed mode: region detection + per-region recognition ──

// Fix common LaTeX issues from the formula model
// e.g. \boldsymbol{中文} → \textbf{中文} (boldsymbol only supports Latin/Greek)
function sanitizeLatex(latex) {
  if (!latex) return latex;
  let out = latex;
  // \boldsymbol, \mathbf, \mathit applied to CJK chars → use \textbf instead
  out = out.replace(/\\boldsymbol\{([^}]*)\}/g, (_, t) =>
    /[一-鿿]/.test(t) ? '\\textbf{' + t + '}' : _);
  out = out.replace(/\\mathbf\{([^}]*)\}/g, (_, t) =>
    /[一-鿿]/.test(t) ? '\\textbf{' + t + '}' : _);
  out = out.replace(/\\mathit\{([^}]*)\}/g, (_, t) =>
    /[一-鿿]/.test(t) ? '\\textbf{' + t + '}' : _);
  out = out.replace(/\\mathrm\{([^}]*)\}/g, (_, t) =>
    /[一-鿿]/.test(t) ? '\\textbf{' + t + '}' : _);
  // Remove unclosed \boldsymbol{... \mathbf{... etc (no closing brace)
  out = out.replace(/\\boldsymbol\{[^}]*$/g, '');
  out = out.replace(/\\mathbf\{[^}]*$/g, '');
  out = out.replace(/\\mathit\{[^}]*$/g, '');
  out = out.replace(/\\mathrm\{[^}]*$/g, '');
  // Balance unclosed braces
  let open = 0;
  for (const ch of out) { if (ch === '{') open++; if (ch === '}') open--; }
  if (open > 0) out += '}'.repeat(open);
  return out;
}

// Detect garbled/hallucinated formula output
function isGarbledFormula(latex) {
  if (!latex || latex.length < 3) return true;
  // Check for repeated short patterns (e.g. "\nabla \bar{g}" x15)
  const stripped = latex.replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, '').trim();
  if (stripped.length > 10) {
    // Look for substrings that repeat excessively
    for (let len = 3; len <= Math.min(12, Math.floor(stripped.length / 3)); len++) {
      for (let i = 0; i <= stripped.length - len; i++) {
        const sub = stripped.substring(i, i + len);
        if (sub.trim().length < 2) continue;
        let count = 0, pos = 0;
        while ((pos = stripped.indexOf(sub, pos)) !== -1) { count++; pos += len; }
        if (count >= 5) { console.debug('[garbled] repeated:', JSON.stringify(sub), 'x'+count); return true; }
      }
    }
  }
  // Check for formula output that's mostly plain text (model hallucinating)
  const textContent = (latex.match(/\\text\{[^}]+\}/g) || []).join('');
  if (textContent.length > latex.length * 0.7) {
    // If >70% of output is \text{}, model probably misidentified text as formula
    console.debug('[garbled] text-dominated formula:', latex.substring(0, 80));
    return true;
  }
  return false;
}

async function processMixedMode(img) {
  console.debug('[mixed] Starting region detection...');

  // Step 1: Region detection (if model is ready)
  let regions = [];
  if (isRegionDetReady()) {
    try {
      const result = await detectRegions(img);
      regions = result.regions;
      console.debug(`[mixed] detected ${regions.length} regions:`,
        regions.map(r => `${r.label===0?'F':'T'}(${r.w}x${r.h})`).join(', '));
    } catch (e) {
      console.debug('[mixed] region-detect failed:', e.message);
    }
  }

  // Fallback: if no regions detected or model not ready, use formula-det
  if (regions.length === 0) {
    console.debug('[mixed] falling back to formula-det...');
    if (isDetReady()) {
      try {
        const formulaBoxes = await detectFormulas(img);
        for (const box of formulaBoxes) {
          if (box.w >= 20 && box.h >= 15) {
            regions.push({ x: box.x, y: box.y, w: box.w, h: box.h, label: 0 });
          }
        }
      } catch (e) { /* ignore */ }
    }
    // Treat the whole image as text if nothing found
    if (regions.length === 0) {
      if (isTesseractReady()) {
        const text = await recognizeText(img);
        if (text && text.trim().length > 1) {
          return { latex: text, confidence: 0.7 };
        }
      }
      return await recognize(img, 'formula');
    }
  }

  // Step 2: Group regions into lines (preserve x-order within each line)
  const lines = groupRegionsByLine(regions);
  console.debug(`[mixed] ${lines.length} lines from ${regions.length} regions`);

  // Step 3: Recognize each region
  const lineResults = [];
  for (const line of lines) {
    const parts = [];
    for (const region of line) {
      const crop = cropRegionDetect(img, region);
      try {
        if (region.label === 0) {
          // FORMULA region → formula recognition
          const r = await recognize(crop, 'formula');
          if (r.latex && r.latex.trim().length > 0 && r.confidence >= 0.15 && !isGarbledFormula(r.latex)) {
            parts.push({ type: 'formula', text: sanitizeLatex(r.latex.trim()), conf: r.confidence });
          }
        } else {
          // TEXT region → text OCR (prefer PP-OCRv5, fallback to Tesseract)
          let textResult = null;
          if (isTextRecReady()) {
            try {
              // Enhance contrast for better OCR on camera/handwriting images
              const enhanced = enhanceHandwriting(crop);
              const raw = await recognizeTextAuto(enhanced);
              if (raw && raw.trim().length > 0) {
                textResult = '\\text{' + raw.trim().replace(/[\\{}&#%_$~^]/g, '\\$&') + '}';
              }
            } catch (e) { console.debug('[mixed] PP-OCRv5 failed:', e.message); }
          }
          if (!textResult && isTesseractReady()) {
            try {
              textResult = await recognizeText(crop);
            } catch (e) { /* ignore */ }
          }
          if (textResult && textResult.trim().length > 1) {
            parts.push({ type: 'text', text: textResult.trim(), conf: 0.8 });
          } else {
            // No text engine or empty result — try formula rec as fallback
            const r = await recognize(crop, 'formula');
            if (r.latex && r.latex.trim().length > 0 && r.confidence >= 0.15 && !isGarbledFormula(r.latex)) {
              parts.push({ type: 'formula', text: sanitizeLatex(r.latex.trim()), conf: r.confidence });
            }
          }
        }
      } catch (e) {
        console.debug(`[mixed] rec failed for region:`, e.message);
      }
    }

    // Step 4: Assemble line output — same-line parts joined with space
    if (parts.length > 0) {
      lineResults.push({
        text: parts.map(p => p.text).join(' '),
        conf: parts.reduce((s, p) => s + p.conf, 0) / parts.length,
      });
    }
  }

  if (lineResults.length === 0) {
    return await recognize(img, 'formula');
  }

  const latex = lineResults.map(l => l.text).join('\n');
  const avgConf = lineResults.reduce((s, l) => s + l.conf, 0) / lineResults.length;
  // Log brace balance and snippet for debugging
  let braceDepth = 0;
  for (const ch of latex) {
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
  }
  console.debug(`[mixed] result: ${lineResults.length} lines, braceBalance=${braceDepth}, conf=${avgConf.toFixed(2)}`);
  console.debug(`[mixed] full LaTeX:\n${latex.substring(0, 500)}`);
  return { latex, confidence: avgConf };
}

// ── External API recognition ──
async function processImageExternal(file, settings) {
  hideResult();
  if (els.errorMsg) els.errorMsg.style.display = 'none';
  setStatus('processing', '正在调用云端模型…', true);

  try {
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    });

    const body = {
      model: settings.model || 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } },
          { type: 'text', text: 'Please convert the formula in this image to LaTeX code. Output ONLY the LaTeX code, no explanation.' },
        ],
      }],
      max_tokens: 1024,
    };

    const resp = await fetch(settings.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (settings.apiKey || ''),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) throw new Error('API error: HTTP ' + resp.status);
    const data = await resp.json();
    let latex = data.choices?.[0]?.message?.content || '';
    // Clean up markdown code fences
    latex = latex.replace(/```latex\n?/g, '').replace(/```\n?/g, '').trim();
    lastRecognitionTime = Date.now();
    if (latex) {
      showResult(latex, 1.0);
      setStatus('done', '云端识别完成', false);
      if (fileInputHandler) fileInputHandler({ latex, confidence: 1.0 }, file);
    } else {
      showError('云端未返回有效结果');
      setStatus('ready', '模型就绪！拖入公式图片开始识别', false);
    }
  } catch (e) {
    showError('云端识别失败: ' + (e.message || e));
    setStatus('ready', '模型就绪！拖入公式图片开始识别', false);
  }
}

// ── Drop zone ──

export function resetDropZone() {
  if (els.preview) { els.preview.style.display = 'none'; }
  if (els.dropContent) { els.dropContent.style.display = ''; }
}

// ── Mode switching ──

export function switchMode(mode) {
  const tabImage = els.tabImage, tabHandwrite = els.tabHandwrite;
  const dropZone = els.dropZone, hwPanel = els.hwPanel;
  if (mode === 'handwrite') {
    if (tabImage) tabImage.classList.remove('active');
    if (tabHandwrite) tabHandwrite.classList.add('active');
    if (dropZone) dropZone.style.display = 'none';
    if (hwPanel) hwPanel.classList.add('show');
  } else {
    if (tabHandwrite) tabHandwrite.classList.remove('active');
    if (tabImage) tabImage.classList.add('active');
    if (dropZone) dropZone.style.display = '';
    if (hwPanel) hwPanel.classList.remove('show');
  }
}

// ── File input callback for external listeners ──

export function onFileProcessed(callback) {
  fileInputHandler = callback;
}

// ── Global event bindings ──

function bindGlobalEvents() {
  // Drop zone
  if (els.dropZone && els.fileInput) {
    els.dropZone.addEventListener('click', (e) => {
      if (e.target.closest('#camTrigger')) return;
      els.fileInput.click();
    });
    els.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); els.dropZone.classList.add('drag-over'); });
    els.dropZone.addEventListener('dragleave', () => { els.dropZone.classList.remove('drag-over'); });
    els.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      els.dropZone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f && (f.type.startsWith('image/') || f.type === 'application/pdf')) processImage(f);
    });
    els.fileInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) processImage(f);
    });
  }

  // Paste
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const f = items[i].getAsFile();
        if (f) processImage(f);
        return;
      }
    }
  });

  // Theme toggle
  if (els.themeToggle) {
    els.themeToggle.addEventListener('click', () => {
      const newTheme = toggleTheme();
      els.themeToggle.innerHTML = getThemeIcon(newTheme);
      // dispatch event for handwriting theme update
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: newTheme } }));
    });
  }

  // Mode tabs
  if (els.tabImage) els.tabImage.addEventListener('click', () => switchMode('image'));
  if (els.tabHandwrite) els.tabHandwrite.addEventListener('click', () => switchMode('handwrite'));

  // Copy button
  if (els.copyBtn) els.copyBtn.addEventListener('click', copyResult);

  // Camera escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.camModal && els.camModal.classList.contains('show')) {
      window.dispatchEvent(new CustomEvent('closecamera'));
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && els.camModal && els.camModal.classList.contains('show')) {
      window.dispatchEvent(new CustomEvent('closecamera'));
    }
  });
}

// ── Model initialization helper ──

export async function initModels(onProgress) {
  ort.env.wasm.wasmPaths = '/ort/';
  const mtOn = (localStorage.getItem('ls_mt') || '1') !== '0';
  if (crossOriginIsolated && mtOn) {
    ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 8);
    ort.env.wasm.simd = true;
  } else {
    ort.env.wasm.numThreads = 1;
  }

  const splash = (name, pct) => { updateSplash(name, pct); if (onProgress) onProgress(name, pct); };

  setStatus('loading', '正在加载分词器…', true);
  splash('分词器', 0);
  await loadTokenizer();
  splash('分词器', 100);

  setStatus('loading', '正在下载编码器模型 (84MB)…', true);
  await loadModels((label, pct) => {
    if (pct < 0) {
      setStatus('loading', label, true);
      splash('编码器模型', 100);
    } else if (pct === 0) {
      showProgress(label, 0);
      splash('编码器模型', 0);
    } else if (pct === 100) {
      hideProgress();
      splash('编码器模型', 100);
    } else {
      showProgress(label, pct);
      splash('编码器模型', pct);
    }
  });

  // Background models: all load in parallel
  loadTesseract().then(() => splash('Tesseract', 100)).catch(() => {});
  splash('Tesseract', 0);

  loadTextDetModel((label, pct) => {
    if (pct < 0) { splash('文字检测', 100); }
    else if (pct === 0) { showProgress(label, 0); splash('文字检测', 0); }
    else if (pct === 100) { hideProgress(); splash('文字检测', 100); }
    else { showProgress(label, pct); splash('文字检测', pct); }
  }).catch(() => {});

  loadFormulaDetModel((label, pct) => {
    if (pct < 0) { splash('公式检测', 100); }
    else if (pct === 0) { showProgress(label, 0); splash('公式检测', 0); }
    else if (pct === 100) { hideProgress(); splash('公式检测', 100); }
    else { showProgress(label, pct); splash('公式检测', pct); }
  }).catch(() => {});

  loadRegionDetectModel((label, pct) => {
    if (pct < 0) { splash('区域检测', 100); }
    else if (pct === 0) { showProgress(label, 0); splash('区域检测', 0); }
    else if (pct === 100) { hideProgress(); splash('区域检测', 100); }
    else { showProgress(label, pct); splash('区域检测', pct); }
  }).catch(() => {});

  loadTextRecModel((label, pct) => {
    if (pct < 0) { splash('中文OCR', 100); }
    else if (pct === 0) { showProgress(label, 0); splash('中文OCR', 0); }
    else if (pct === 100) { hideProgress(); splash('中文OCR', 100); }
    else { showProgress(label, pct); splash('中文OCR', pct); }
  }).catch(() => {});

  loadDocOriModel((label, pct) => {
    if (pct < 0) { splash('方向检测', 100); }
    else if (pct === 0) { showProgress(label, 0); splash('方向检测', 0); }
    else if (pct === 100) { hideProgress(); splash('方向检测', 100); }
    else { showProgress(label, pct); splash('方向检测', pct); }
  }).catch(() => {});

  loadEnRecModel((label, pct) => {
    if (pct < 0) { splash('英文OCR', 100); }
    else if (pct === 0) { showProgress(label, 0); splash('英文OCR', 0); }
    else if (pct === 100) { hideProgress(); splash('英文OCR', 100); }
    else { showProgress(label, pct); splash('英文OCR', pct); }
  }).catch(() => {});

  setStatus('ready', '模型就绪！拖入公式图片或 Ctrl+V 粘贴', false);
}
