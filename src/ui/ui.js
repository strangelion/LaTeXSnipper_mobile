// UI module — status bar, progress, result display, event bindings
// Extracted from ocr_demo.html

import { isReady, recognize, loadTokenizer, loadModels } from '../ocr/ocr-engine.js';
import { processPDF } from '../ocr/pdf-processor.js';
import { toggleTheme, getThemeIcon, getTheme } from './theme.js';
import { ICONS, COOLDOWN_MS } from '../constants.js';

// DOM refs (set by initUI)
let els = {};
let fileInputHandler = null;
let lastRecognitionTime = 0;

export function initUI(elementMap) {
  els = elementMap;
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
  setStatus('error', 'Failed', false);
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
  if (shareBtn) shareBtn.style.display = 'block';
  if (sendBtn) sendBtn.style.display = 'block';
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
  const tex = latex.replace(/\n/g, ' ').trim();
  if (!tex) { els.mathPreview.classList.remove('show'); return; }
  MathJax.tex2svgPromise(tex).then(node => {
    els.mathPreview.innerHTML = '';
    els.mathPreview.appendChild(node);
    els.mathPreview.classList.add('show');
  }).catch(() => { els.mathPreview.classList.remove('show'); });
}

// ── Copy result ──

export function copyResult() {
  if (!els.resultCode) return;
  navigator.clipboard.writeText('$$\n' + els.resultCode.textContent + '\n$$').then(() => {
    if (els.copyBtn) {
      els.copyBtn.textContent = 'Copied ✓';
      els.copyBtn.classList.add('copied');
      setTimeout(() => {
        els.copyBtn.textContent = 'Copy LaTeX';
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
  if (navigator.share) {
    try {
      await navigator.share({ title: 'LaTeXSnipper OCR Result', text: text });
    } catch (e) { /* user cancelled */ }
  } else {
    copyResult();
  }
}

// ── Image processing entry point ──

export async function processImage(file) {
  if (!isReady()) { showError('Model not loaded yet, please wait'); return; }

  const now = Date.now();
  if (now - lastRecognitionTime < COOLDOWN_MS) {
    showError('Please wait ' + Math.ceil((COOLDOWN_MS - (now - lastRecognitionTime)) / 1000) + 's before next recognition');
    return;
  }
  if (file.size < 1024) { showError('File too small, minimum 1KB'); return; }

  // PDF branch
  if (file.type === 'application/pdf') {
    hideResult();
    if (els.errorMsg) els.errorMsg.style.display = 'none';
    setStatus('processing', 'Parsing PDF…', true);
    try {
      const pdfResult = await processPDF(file, (info) => {
        showProgress('PDF page ' + info.page + '/' + info.total, info.pct);
      });
      hideProgress();
      lastRecognitionTime = Date.now();
      showResult(pdfResult.latex, pdfResult.confidence, pdfResult.pageCount + ' pages');
      setStatus('done', 'Recognition complete (' + pdfResult.pageCount + ' pages)', false);
      return pdfResult;
    } catch (e) { showError(e.message); setStatus('ready', 'Model ready! Upload a formula image to start', false); return null; }
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
  setStatus('processing', 'Recognizing…', true);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const result = await recognize(img);
        lastRecognitionTime = Date.now();
        URL.revokeObjectURL(url);
        if (!result.latex) {
          showError('No formula detected (confidence ' + (result.confidence * 100).toFixed(1) + '% too low)');
          setStatus('ready', 'Model ready! Please re-upload a formula image', false);
          resolve(null);
          return;
        }
        showResult(result.latex, result.confidence);
        setStatus('done', 'Recognition complete', false);
        if (fileInputHandler) fileInputHandler(result, file);
        resolve(result);
      } catch (e) {
        URL.revokeObjectURL(url);
        showError('Recognition failed: ' + (e.message || e));
        setStatus('ready', 'Model ready! Upload a formula image to start', false);
        resolve(null);
      }
    };
    img.src = url;
  });
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
  if (crossOriginIsolated) {
    ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 4);
    ort.env.wasm.simd = true;
  } else {
    ort.env.wasm.numThreads = 1;
  }
  setStatus('loading', 'Loading tokenizer…', true);
  if (onProgress) onProgress('tokenizer', 0);
  await loadTokenizer();
  if (onProgress) onProgress('tokenizer', 100);

  setStatus('loading', 'Downloading encoder model (84MB)…', true);
  await loadModels((label, pct) => {
    if (pct < 0) {
      setStatus('loading', label, true);
    } else if (pct === 0) {
      showProgress(label, 0);
    } else if (pct === 100) {
      hideProgress();
    } else {
      showProgress(label, pct);
    }
    if (onProgress) onProgress(label, pct);
  });
  setStatus('ready', 'Model ready! Upload a formula image or Ctrl+V paste', false);
}
