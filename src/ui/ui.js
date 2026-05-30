// UI orchestrator — re-exports submodules, wires event bindings, model init
import { els, setFileInputHandler } from './dom-refs.js';
import { updateSplash, hideSplash } from './splash.js';
import { setStatus, showError, showProgress, hideProgress } from './status.js';
import { showResult, hideResult, copyResult, initPDFNav } from './result.js';
import { processImage } from './recognition.js';
import { toggleTheme, getThemeIcon, getTheme } from './theme.js';
import { loadTokenizer, loadModels } from '../ocr/ocr-engine.js';
import { loadTesseract } from '../ocr/tesseract-recognition.js';
import { loadTextDetModel } from '../ocr/text-detection.js';
import { loadFormulaDetModel } from '../ocr/formula-detection.js';
import { loadRegionDetectModel } from '../ocr/region-detect.js';
import { loadTextRecModel, loadEnRecModel } from '../ocr/text-recognition.js';
import { loadDocOriModel } from '../ocr/doc-preprocess.js';

// ── Re-exports (main.js imports via ui.js) ──
export { hideSplash, updateSplash } from './splash.js';
export { setStatus, showError, showProgress, hideProgress } from './status.js';
export { showResult, hideResult, copyResult, shareResult, exportPNG, exportSVG, showPDFBrowser, hidePDFBrowser, gotoPDFPage } from './result.js';
export { processImage } from './recognition.js';
export { polishResult } from './polish.js';

// ── Init ──

export function initUI(elementMap) {
  Object.assign(els, elementMap);
  initPDFNav();
  bindGlobalEvents();
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

// ── File input callback ──

export function onFileProcessed(callback) {
  setFileInputHandler(callback);
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

// ── Model initialization ──

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

  const bgModels = [];

  const m = (p) => { bgModels.push(p); return p; };

  m(loadTesseract().then(() => splash('Tesseract', 100)).catch(() => {}));
  splash('Tesseract', 0);

  m(loadTextDetModel((label, pct) => {
    if (pct < 0) { splash('文字检测', 100); }
    else if (pct === 0) { showProgress(label, 0); splash('文字检测', 0); }
    else if (pct === 100) { hideProgress(); splash('文字检测', 100); }
    else { showProgress(label, pct); splash('文字检测', pct); }
  }).catch(() => {}));

  m(loadFormulaDetModel((label, pct) => {
    if (pct < 0) { splash('公式检测', 100); }
    else if (pct === 0) { showProgress(label, 0); splash('公式检测', 0); }
    else if (pct === 100) { hideProgress(); splash('公式检测', 100); }
    else { showProgress(label, pct); splash('公式检测', pct); }
  }).catch(() => {}));

  m(loadRegionDetectModel((label, pct) => {
    if (pct < 0) { splash('区域检测', 100); }
    else if (pct === 0) { showProgress(label, 0); splash('区域检测', 0); }
    else if (pct === 100) { hideProgress(); splash('区域检测', 100); }
    else { showProgress(label, pct); splash('区域检测', pct); }
  }).catch(() => {}));

  m(loadTextRecModel((label, pct) => {
    if (pct < 0) { splash('中文OCR', 100); }
    else if (pct === 0) { showProgress(label, 0); splash('中文OCR', 0); }
    else if (pct === 100) { hideProgress(); splash('中文OCR', 100); }
    else { showProgress(label, pct); splash('中文OCR', pct); }
  }).catch(() => {}));

  m(loadDocOriModel((label, pct) => {
    if (pct < 0) { splash('方向检测', 100); }
    else if (pct === 0) { showProgress(label, 0); splash('方向检测', 0); }
    else if (pct === 100) { hideProgress(); splash('方向检测', 100); }
    else { showProgress(label, pct); splash('方向检测', pct); }
  }).catch(() => {}));

  m(loadEnRecModel((label, pct) => {
    if (pct < 0) { splash('英文OCR', 100); }
    else if (pct === 0) { showProgress(label, 0); splash('英文OCR', 0); }
    else if (pct === 100) { hideProgress(); splash('英文OCR', 100); }
    else { showProgress(label, pct); splash('英文OCR', pct); }
  }).catch(() => {}));

  // Wait for all background models to finish (success or fail)
  await Promise.allSettled(bgModels);

  setStatus('ready', '模型就绪！拖入公式图片或 Ctrl+V 粘贴', false);
}
