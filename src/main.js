// main.js — Application entry point, wires all modules together

import './styles/base.css';
import './styles/ocr.css';
import './styles/handwriting.css';
import './styles/editor.css';
import './styles/history.css';
import './styles/mobile.css';

import { MODEL_BASE } from './constants.js';
import { initTheme, getThemeIcon, getTheme } from './ui/theme.js';
import { initModels, initUI, processImage, setStatus, copyResult, showResult, shareResult, exportPNG, exportSVG, onFileProcessed, hideSplash, polishResult } from './ui/ui.js';
import { initHandwrite, hwSetTool, hwUndo, hwRedo, hwClear, hwExportImage, updateHwTheme } from './handwriting/handwrite.js';
import { openCamera, closeCamera, capturePhoto, confirmCrop, retakePhoto, setCropMode, toggleFlash, rotateImage, initCamera } from './camera/camera.js';
import { addResult, clearHistory } from './history/history-db.js';
import { renderHistoryList } from './history/history-ui.js';
import { initEditor, setEditorContent } from './editor/mathlive-config.js';
import { autoCorrectOrientation, getExifOrientation, correctByExif, isDocOriReady } from './ocr/doc-preprocess.js';
import { initI18n, t, translateDOM } from './lang/i18n.js';
import { initSettings } from './settings/settings.js';

/* ── Service Worker registration ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

/* ── Tab navigation ── */
function setupTabs() {
  const tabs = document.querySelectorAll('.bottom-nav button');
  const pages = document.querySelectorAll('.page');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.page;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      pages.forEach(p => p.classList.remove('active'));
      const page = document.getElementById('page-' + target);
      if (page) page.classList.add('active');
    });
  });
}

/* ── Install prompt ── */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const banner = document.getElementById('installBanner');
  if (banner) banner.classList.add('show');
});

document.getElementById('installBtn')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('installBanner')?.classList.remove('show');
});

document.getElementById('dismissInstall')?.addEventListener('click', () => {
  document.getElementById('installBanner')?.classList.remove('show');
});

// Hide banner if already installed
if (window.matchMedia('(display-mode: standalone)').matches) {
  document.getElementById('installBanner')?.classList.remove('show');
}

/* ── Theme ── */
const theme = initTheme();
document.getElementById('themeToggle').innerHTML = getThemeIcon(theme);

window.addEventListener('themechange', (e) => {
  updateHwTheme(e.detail.theme);
});

/* ── DOM element map for UI module ── */
const els = {
  statusIcon: document.getElementById('statusIcon'),
  statusText: document.getElementById('statusText'),
  spinner: document.getElementById('spinner'),
  errorMsg: document.getElementById('errorMsg'),
  progressWrap: document.getElementById('progressWrap'),
  progressFill: document.getElementById('progressFill'),
  progressFile: document.getElementById('progressFile'),
  progressPercent: document.getElementById('progressPercent'),
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  preview: document.getElementById('preview'),
  dropContent: document.getElementById('dropContent'),
  resultCard: document.getElementById('resultCard'),
  resultCode: document.getElementById('resultCode'),
  confidence: document.getElementById('confidence'),
  copyBtn: document.getElementById('copyBtn'),
  mathPreview: document.getElementById('mathPreview'),
  camModal: document.getElementById('camModal'),
  camVideo: document.getElementById('camVideo'),
  camTrigger: document.getElementById('camTrigger'),
  tabImage: document.getElementById('tabImage'),
  tabHandwrite: document.getElementById('tabHandwrite'),
  hwPanel: document.getElementById('hwPanel'),
  themeToggle: document.getElementById('themeToggle'),
};

initUI(els);

/* ── Camera setup ── */
initCamera(
  document.getElementById('camVideo'),
  document.getElementById('camModal'),
  document.getElementById('camCropCanvas'),
  document.getElementById('camActions'),
  document.getElementById('camCropActions')
);

document.getElementById('camTrigger')?.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  openCamera();
});

document.getElementById('camCapture')?.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  capturePhoto();
});

document.getElementById('camCropConfirm')?.addEventListener('pointerdown', async (e) => {
  e.preventDefault(); e.stopPropagation();
  const file = await confirmCrop();
  if (file) {
    const corrected = await preprocessCameraFile(file);
    processImage(corrected || file);
  }
});

document.getElementById('camCropRetake')?.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  retakePhoto();
});

document.getElementById('camCropModeRect')?.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  setCropMode('rect');
});
document.getElementById('camCropModeLasso')?.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  setCropMode('lasso');
});

document.getElementById('camClose')?.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  closeCamera();
});

document.getElementById('camFlash')?.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  toggleFlash();
});

document.getElementById('camCropRotate')?.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  rotateImage();
});

document.getElementById('camModal')?.addEventListener('click', (e) => {
  // Only close on background click during live preview;
  // during crop mode, canvas + cropActions cover the modal so this shouldn't fire
  if (e.target === e.currentTarget) closeCamera();
});

window.addEventListener('closecamera', closeCamera);

/* ── Handwriting setup ── */
const hwCanvas = document.getElementById('hwCanvas');
const hwWrap = document.getElementById('hwWrap');
if (hwCanvas && hwWrap) {
  initHandwrite(hwCanvas, hwWrap);
  updateHwTheme(getTheme());

  document.getElementById('hwPen')?.addEventListener('click', () => hwSetTool('pen'));
  document.getElementById('hwEraser')?.addEventListener('click', () => hwSetTool('eraser'));
  document.getElementById('hwUndo')?.addEventListener('click', hwUndo);
  document.getElementById('hwRedo')?.addEventListener('click', hwRedo);
  document.getElementById('hwClear')?.addEventListener('click', hwClear);
  // Camera file preprocessing: auto-correct orientation before recognition
async function preprocessCameraFile(file) {
  // Step 1: Try EXIF-based correction (fast, no model needed)
  try {
    const exifOri = await getExifOrientation(file);
    if (exifOri !== 1) {
      console.debug('[preprocess] EXIF orientation:', exifOri);
      const img = await createImageBitmap(file);
      const corrected = correctByExif(img, exifOri);
      if (corrected) {
        return new Promise((resolve) => {
          corrected.toBlob((blob) => {
            resolve(new File([blob], file.name || 'camera.jpg', { type: 'image/jpeg' }));
          }, 'image/jpeg', 0.92);
        });
      }
    }
  } catch (e) { /* EXIF read failed, continue */ }

  // Step 2: Try ONNX model-based orientation detection
  if (isDocOriReady()) {
    try {
      const img = await createImageBitmap(file);
      const corrected = await autoCorrectOrientation(img);
      if (corrected) {
        return new Promise((resolve) => {
          corrected.toBlob((blob) => {
            resolve(new File([blob], file.name || 'camera.jpg', { type: 'image/jpeg' }));
          }, 'image/jpeg', 0.92);
        });
      }
    } catch (e) { console.debug('[preprocess] ONNX orientation failed:', e.message); }
  }

  return null; // No correction needed
}

document.getElementById('hwRecognize')?.addEventListener('click', async () => {
    const file = await hwExportImage();
    if (file) processImage(file);
  });
}

/* ── Recognition mode selector ── */
let recogMode = 'formula';
document.querySelectorAll('.recog-tabs .mode-tab').forEach(btn => {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    document.querySelectorAll('.recog-tabs .mode-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    recogMode = btn.dataset.mode;
  });
});
// When switching to handwriting, default to mixed mode
document.getElementById('tabHandwrite')?.addEventListener('pointerdown', () => {
  document.querySelectorAll('.recog-tabs .mode-tab').forEach(b => b.classList.remove('active'));
  const mixedBtn = document.querySelector('.recog-tabs [data-mode="mixed"]');
  if (mixedBtn) mixedBtn.classList.add('active');
  recogMode = 'mixed';
});
document.getElementById('tabImage')?.addEventListener('pointerdown', () => {
  document.querySelectorAll('.recog-tabs .mode-tab').forEach(b => b.classList.remove('active'));
  const formulaBtn = document.querySelector('.recog-tabs [data-mode="formula"]');
  if (formulaBtn) formulaBtn.classList.add('active');
  recogMode = 'formula';
});

// Export recogMode for ui.js to use
window.__recogMode = () => recogMode;

/* ── Back button / swipe-back ── */
(async () => {
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      // Camera modal open → close camera, don't exit
      if (document.getElementById('camModal')?.classList.contains('show')) {
        window.dispatchEvent(new CustomEvent('closecamera'));
        return;
      }
      const activeTab = document.querySelector('.bottom-nav button.active');
      const ocrTab = document.querySelector('.bottom-nav button[data-page="ocr"]');
      if (activeTab && activeTab !== ocrTab) {
        ocrTab?.click();
      } else {
        App.exitApp();
      }
    });
  } catch (_) { /* browser dev mode, Capacitor not available */ }
})();
document.getElementById('shareBtn')?.addEventListener('click', shareResult);
document.getElementById('aiPolishBtn')?.addEventListener('click', () => polishResult().catch(() => {}));
document.getElementById('exportPngBtn')?.addEventListener('click', exportPNG);
document.getElementById('exportSvgBtn')?.addEventListener('click', exportSVG);

document.getElementById('sendToEditorBtn')?.addEventListener('click', () => {
  const latex = document.getElementById('resultCode')?.textContent;
  if (latex) setEditorContent(latex);
});

/* ── Particle background (disabled — affects UX on mobile) ── */
// initParticles('mathBg');

/* ── Save OCR results to history ── */
onFileProcessed(async (result, file) => {
    if (result && result.latex) {
      const source = file.type === 'application/pdf' ? 'pdf'
        : file.name === 'camera.jpg' ? 'camera'
        : file.name === 'handwrite.png' ? 'handwrite'
        : 'file';
      await addResult({
        latex: result.latex,
        confidence: result.confidence,
        type: 'formula',
        source,
      });
      renderHistoryList();
    }
  });

// History toolbar
document.getElementById('clearHistory')?.addEventListener('click', async () => {
  await clearHistory();
  renderHistoryList();
});
document.querySelectorAll('.history-toolbar button[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.history-toolbar button[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderHistoryList(btn.dataset.filter);
  });
});

// Load history when tab is shown
document.querySelector('.bottom-nav button[data-page="history"]')?.addEventListener('click', () => {
  renderHistoryList();
});

/* ── Editor tab ── */
initEditor();


/* ── Startup: load models ── */
async function boot() {
  // Init i18n + translate static text
  await initI18n();
  translateDOM();

  // Init settings (dropdowns, save/load)
  initSettings();

  // Failsafe: hide splash after 30s regardless
  const failsafe = setTimeout(() => hideSplash(), 30000);
  try {
    renderHistoryList();
    await initModels();
  } catch (e) {
    if (!document.getElementById('errorMsg')?.style.display || document.getElementById('errorMsg')?.style.display === 'none') {
      const errEl = document.getElementById('errorMsg');
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Initialization failed: ' + (e.message || e); }
    }
  } finally {
    clearTimeout(failsafe);
    hideSplash();
  }
}

setupTabs();
boot();
