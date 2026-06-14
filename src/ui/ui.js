// UI orchestrator — re-exports submodules, wires event bindings, model init
import { els, setFileInputHandler } from './dom-refs.js';
import { updateSplash, hideSplash } from './splash.js';
import { setStatus, showError, showProgress, hideProgress } from './status.js';
import { showResult, hideResult, copyResult, initPDFNav } from './result.js';
import { processImage } from './recognition.js';
import { toggleTheme, getThemeIcon, getTheme } from './theme.js';
import { OcrNative, isNativeOcrAvailable, waitForNativeOcr, loadModelsAndWait } from '../native/ocr-native.js';
import Logger from '../shared/logger.js';

// ── Re-exports (main.js imports via ui.js) ──
export { hideSplash, updateSplash } from './splash.js';
export { setStatus, showError, showProgress, hideProgress } from './status.js';
export { showResult, hideResult, copyResult, shareResult, showPDFBrowser, hidePDFBrowser, gotoPDFPage } from './result.js';
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

// ── Model initialization (Native OcrPlugin on Android) ──

export async function initModels(onProgress) {
  // Check if external API mode — skip native model loading entirely
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem('ls_settings') || '{}'); } catch (_) {}
  if (settings.engine && settings.engine !== 'builtin' && settings.baseUrl) {
    Logger.info('init', 'External API mode, skipping native model loading');
    window.__modelsReady = true;
    window.__nativeModelStatus = { formulaDet: false, formulaRec: false, textDet: false, textRec: false, docOri: false };
    setStatusSafe('ready', 'status.ready', false);
    return;
  }

  // Wait up to 8s for the Android native bridge to be injected
  const bridgeReady = await waitForNativeOcr(8000);
  if (!bridgeReady) {
    Logger.warn('init', 'NativeOcr bridge not found after 8s, browser mode');
    setStatusSafe('ready', 'status.browserMode', false);
    return;
  }

  Logger.info('init', 'NativeOcr bridge detected');
  try {
    try {
      const saved = JSON.parse(localStorage.getItem('ls_settings') || '{}');
      await OcrNative.setAcceleration({ mode: saved.accel || 'gpu' });
    } catch (_) {}

    setStatusSafe('loading', 'status.loadingModel', true);
    OcrNative._loadProgress = 5;

    const t0 = performance.now();
    const loaded = await loadModelsAndWait(180000);

    if (!loaded) {
      Logger.error('init', 'Model loading timed out after 3 minutes');
      setStatusSafe('ready', 'status.modelTimeout', false);
      return;
    }

    // Query which models actually loaded
    try {
      const statusRaw = await window.NativeOcr.getModelStatus();
      window.__nativeModelStatus = typeof statusRaw === 'string' ? JSON.parse(statusRaw) : statusRaw;
    } catch (_) {
      window.__nativeModelStatus = { formulaDet: false, formulaRec: false, textDet: false, textRec: false, docOri: false };
    }

    const avail = Object.values(window.__nativeModelStatus).filter(Boolean).length;
    Logger.info('init', 'Models loaded in ' + ((performance.now() - t0) / 1000).toFixed(1) + 's (' + avail + '/5 available)');
    window.__modelsReady = true;
    if (updateSplash) updateSplash('就绪', 100);
    await new Promise(r => setTimeout(r, 300));
    setStatusSafe('ready', 'status.ready', false);
  } catch (e) {
    Logger.error('init', 'Native OCR init failed', e);
    setStatusSafe('ready', 'status.browserMode', false);
  }
}

// Safe setStatus that falls back to raw text if t() not ready
function setStatusSafe(type, key, showSpin) {
  try {
    setStatus(type, t(key), showSpin);
  } catch (_) {
    // i18n not loaded yet — show bare message
    const fallbacks = {
      'status.ready': 'Ready',
      'status.loadingModel': 'Loading models...',
      'status.modelTimeout': 'Model loading timed out',
      'status.browserMode': 'Browser mode — configure external API',
    };
    setStatus(type, fallbacks[key] || key, showSpin);
  }
}
