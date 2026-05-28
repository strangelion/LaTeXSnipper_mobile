// main.js — Application entry point, wires all modules together

import './styles/base.css';
import './styles/ocr.css';
import './styles/handwriting.css';
import './styles/editor.css';
import './styles/history.css';
import './styles/mobile.css';

import { MODEL_BASE } from './constants.js';
import { initTheme, getThemeIcon, getTheme } from './ui/theme.js';
import { initModels, initUI, processImage, setStatus, copyResult, showResult, shareResult, exportPNG, exportSVG, onFileProcessed, hideSplash } from './ui/ui.js';
import { initHandwrite, hwSetTool, hwUndo, hwRedo, hwClear, hwExportImage, updateHwTheme } from './handwriting/handwrite.js';
import { openCamera, closeCamera, capturePhoto, confirmCrop, retakePhoto, setCropMode, toggleFlash, rotateImage, initCamera } from './camera/camera.js';
import { addResult, getAllResults, toggleFavorite, deleteResult, clearHistory } from './history/history-db.js';
import { initEditor, setEditorContent } from './editor/mathlive-config.js';
import { autoCorrectOrientation, getExifOrientation, correctByExif, isDocOriReady } from './ocr/doc-preprocess.js';

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

async function renderHistoryList(filter = 'all') {
  const listEl = document.getElementById('historyList');
  if (!listEl) return;
  const results = await getAllResults({ filter });
  if (results.length === 0) {
    listEl.innerHTML = '<div class="history-empty">No recognition history yet.<br>Start by uploading a formula image!</div>';
    return;
  }
  listEl.innerHTML = results.map(r => `
    <div class="history-item" data-id="${r.id}">
      <div class="hi-latex">${escapeHtml(r.latex.substring(0, 120))}${r.latex.length > 120 ? '…' : ''}</div>
      <div class="hi-meta">
        <span class="hi-tag">${r.source}</span>
        <span>${new Date(r.createdAt).toLocaleString()}</span>
        <span>${(r.confidence * 100).toFixed(0)}%</span>
        <button class="hi-fav ${r.favorite ? 'active' : ''}" data-action="fav" data-id="${r.id}">★</button>
        <button class="hi-fav" data-action="del" data-id="${r.id}" style="color:#ef4444;">×</button>
      </div>
    </div>
  `).join('');

  // Click handlers
  listEl.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      const target = e.target;
      if (target.dataset.action === 'fav') {
        e.stopPropagation();
        const id = Number(target.dataset.id);
        const isFav = await toggleFavorite(id);
        target.classList.toggle('active', isFav);
        return;
      }
      if (target.dataset.action === 'del') {
        e.stopPropagation();
        await deleteResult(Number(target.dataset.id));
        renderHistoryList(filter);
        return;
      }
      // Load into editor
      const id = Number(item.dataset.id);
      const all = await getAllResults();
      const record = all.find(r => r.id === id);
      if (record) {
        setEditorContent(record.latex);
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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

/* ── Settings page ── */
(function initSettings() {
  const extDiv = document.getElementById('extSettings');
  const saveBtn = document.getElementById('settingsSave');
  const testBtn = document.getElementById('setTestConn');
  const testResult = document.getElementById('setTestResult');

  const PRESETS = {
    'paddle': { engine:'openai', baseUrl:'http://localhost:8080/v1', model:'paddleocr-vl' },
    'silicon': { engine:'openai', baseUrl:'https://api.siliconflow.cn/v1', model:'Qwen/Qwen2.5-VL-72B-Instruct' },
    'deepseek': { engine:'openai', baseUrl:'https://api.deepseek.com/v1', model:'deepseek-vl2' },
    'mineru-native': { engine:'mineru', baseUrl:'http://localhost:8888', model:'mineru' },
  };

  function getEngineVal() {
    return document.querySelector('input[name="engine"]:checked')?.value || 'builtin';
  }
  function getPresetVal() {
    return document.querySelector('input[name="preset"]:checked')?.value || '';
  }
  function setEngineVal(v) {
    document.querySelectorAll('input[name="engine"]').forEach(r => r.checked = r.value === v);
    document.querySelectorAll('.set-radio-group .set-radio').forEach(l => {
      l.classList.toggle('active', l.querySelector('input')?.checked);
    });
    if (extDiv) extDiv.style.display = v === 'builtin' ? 'none' : '';
  }
  function setPresetVal(v) {
    document.querySelectorAll('input[name="preset"]').forEach(r => r.checked = r.value === v);
    document.querySelectorAll('.set-radio-group .set-radio').forEach(l => {
      l.classList.toggle('active', l.querySelector('input')?.checked);
    });
  }

  // Engine radio click
  document.querySelectorAll('input[name="engine"]').forEach(r => {
    r.addEventListener('change', () => setEngineVal(r.value));
  });
  // Make labels clickable
  document.querySelectorAll('.set-radio').forEach(label => {
    label.addEventListener('pointerdown', (e) => {
      const radio = label.querySelector('input');
      if (radio) {
        radio.checked = true;
        if (radio.name === 'engine') setEngineVal(radio.value);
        if (radio.name === 'skin') applySkin(radio.value);
        if (radio.name === 'preset') {
          setPresetVal(radio.value);
          const p = PRESETS[radio.value];
          if (p) {
            setEngineVal(p.engine);
            document.getElementById('setBaseUrl').value = p.baseUrl || '';
            document.getElementById('setModel').value = p.model || '';
          }
        }
      }
    });
  });

  // Skin switching
  function applySkin(name) {
    document.documentElement.setAttribute('data-skin', name);
    document.querySelectorAll('input[name="skin"]').forEach(r => r.checked = r.value === name);
    document.querySelectorAll('#setSkinGroup .set-radio').forEach(l => {
      l.classList.toggle('active', l.querySelector('input')?.checked);
    });
    try { localStorage.setItem('ls_skin', name); } catch (_) {}
  }
  document.querySelectorAll('input[name="skin"]').forEach(r => {
    r.addEventListener('change', () => applySkin(r.value));
  });
  // Load saved skin
  try {
    const savedSkin = localStorage.getItem('ls_skin') || 'default';
    applySkin(savedSkin);
  } catch (_) {}

  // Load saved
  try {
    const saved = JSON.parse(localStorage.getItem('ls_settings') || '{}');
    if (saved.engine) setEngineVal(saved.engine);
    if (saved.preset) setPresetVal(saved.preset);
    if (saved.baseUrl) document.getElementById('setBaseUrl').value = saved.baseUrl;
    if (saved.model) document.getElementById('setModel').value = saved.model;
    if (saved.apiKey) document.getElementById('setApiKey').value = saved.apiKey;
  } catch (_) {}

  saveBtn?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const settings = {
      engine: getEngineVal(),
      baseUrl: document.getElementById('setBaseUrl')?.value || '',
      model: document.getElementById('setModel')?.value || '',
      apiKey: document.getElementById('setApiKey')?.value || '',
    };
    try { localStorage.setItem('ls_settings', JSON.stringify(settings)); } catch (_) {}
    saveBtn.textContent = '已保存 ✓';
    setTimeout(() => saveBtn.textContent = '保存设置', 1500);
  });

  testBtn?.addEventListener('pointerdown', async (e) => {
    e.preventDefault();
    if (!testResult) return;
    testResult.textContent = '测试中…';
    const baseUrl = document.getElementById('setBaseUrl')?.value || '';
    const apiKey = document.getElementById('setApiKey')?.value || '';
    if (!baseUrl) { testResult.textContent = '请填写 Base URL'; return; }
    try {
      const resp = await fetch(baseUrl.replace(/\/+$/, '') + (getEngineVal() === 'mineru' ? '/health' : '/models'), {
        headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {},
        signal: AbortSignal.timeout(10000),
      });
      testResult.textContent = resp.ok ? '✓ 连接成功' : '✗ HTTP ' + resp.status;
    } catch (err) {
      testResult.textContent = '✗ ' + (err.message || '连接失败');
    }
  });

  // Developer mode
  const devCheck = document.getElementById('setDevMode');
  const devOpts = document.getElementById('devOptions');
  const devLogs = document.getElementById('devShowLogs');
  const devClearLogs = document.getElementById('devClearLogs');
  const devOutput = document.getElementById('devLogOutput');
  const devClear = document.getElementById('devClearCache');

  // Load saved dev mode
  try {
    const devOn = localStorage.getItem('ls_devmode') === '1';
    if (devCheck) devCheck.checked = devOn;
    if (devOpts) devOpts.style.display = devOn ? '' : 'none';
  } catch (_) {}

  devCheck?.addEventListener('change', () => {
    const on = devCheck.checked;
    if (devOpts) devOpts.style.display = on ? '' : 'none';
    try { localStorage.setItem('ls_devmode', on ? '1' : '0'); } catch (_) {}
    // Toggle global debug flag
    window.__DEBUG__ = on;
  });

  devLogs?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!devOutput) return;
    if (devOutput.style.display !== 'none') { devOutput.style.display = 'none'; return; }
    devOutput.style.display = 'block';
    try {
      const logs = JSON.parse(localStorage.getItem('ls_ocr_logs') || '[]');
      devOutput.textContent = logs.join('\n') || '(无日志)';
    } catch (_) { devOutput.textContent = '(日志读取失败)'; }
  });

  devClearLogs?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { localStorage.removeItem('ls_ocr_logs'); } catch (_) {}
    if (devOutput) devOutput.textContent = '(日志已清空)';
  });

  devClear?.addEventListener('pointerdown', async (e) => {
    e.preventDefault();
    try { await caches.delete('ocr-models-v1'); devClear.textContent = '已清除 ✓'; }
    catch (_) { devClear.textContent = '清除失败'; }
    setTimeout(() => devClear.textContent = '清除模型缓存', 1500);
  });

  // Set initial debug flag
  try { window.__DEBUG__ = localStorage.getItem('ls_devmode') === '1'; } catch (_) {}
})();

/* ── Startup: load models ── */
async function boot() {
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
