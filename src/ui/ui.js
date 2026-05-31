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

// ── Model initialization (Native OcrPlugin on Android) ──

export async function initModels(onProgress) {
  // Wait up to 8s for the Android native bridge to be injected
  const bridgeReady = await waitForNativeOcr(8000);
  if (!bridgeReady) {
    Logger.warn('init', 'NativeOcr bridge not found after 8s, browser mode');
    setStatus('ready', '浏览器模式 — 请在设置中配置外部 API', false);
    return;
  }

  Logger.info('init', 'NativeOcr bridge detected');
  try {
    setStatus('loading', '正在加载本地模型…', true);
    if (updateSplash) updateSplash('原生引擎', 0);
    await new Promise(r => setTimeout(r, 50));

    // Apply saved acceleration mode before loading
    try {
      const saved = JSON.parse(localStorage.getItem('ls_settings') || '{}');
      await OcrNative.setAcceleration({ mode: saved.accel || 'gpu' });
    } catch (_) {}

    // Load models (background thread on Java, poll until ready)
    setStatus('loading', '正在加载模型，请耐心等待…', true);
    if (updateSplash) updateSplash('加载模型', 5);

    // Show progress while loading (estimate based on time)
    const progressInterval = setInterval(() => {
      if (updateSplash) updateSplash('加载模型', Math.min(90, OcrNative._loadProgress || 5));
    }, 500);

    const t0 = performance.now();
    const loaded = await loadModelsAndWait(180000);
    clearInterval(progressInterval);

    if (!loaded) {
      Logger.error('init', 'Model loading timed out after 3 minutes');
      setStatus('ready', '模型加载超时，请重启应用', false);
      return;
    }

    Logger.info('init', 'Models loaded in ' + ((performance.now() - t0) / 1000).toFixed(1) + 's');
    if (updateSplash) updateSplash('就绪', 100);
    await new Promise(r => setTimeout(r, 300));
    setStatus('ready', '模型就绪！拖入公式图片或 Ctrl+V 粘贴', false);
  } catch (e) {
    Logger.error('init', 'Native OCR init failed', e);
    setStatus('ready', '浏览器模式 — 请在设置中配置外部 API', false);
  }
}
