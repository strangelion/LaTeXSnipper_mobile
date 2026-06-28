// app.js — Module initialization, event wiring, business logic.
// Runs after bootstrap(); loads feature modules and binds events.

import { initModels, initUI, processImage, onFileProcessed, hideSplash } from '../ui/ui.js';
import { initHandwrite, updateHwTheme } from '../handwriting/handwrite.js';
import { initCamera } from '../camera/camera.js';
import { addResult } from '../history/history-db.js';
import { renderHistoryList } from '../history/history-ui.js';
import { initEditor } from '../editor/mathlive-config.js';
import { initI18n, t, translateDOM, onLangChange } from './i18n.js';
import { initSettings } from '../settings/settings.js';
import { initCustomSelects, syncCustomSelects } from '../ui/custom-select.js';
import { registerBinding, bindAll } from './event-registry.js';
import { bindEvents as bindCameraEvents } from '../camera/camera.js';
import { bindUiEvents as bindHandwriteEvents } from '../handwriting/handwrite.js';
import { bindEvents as bindHistoryEvents } from '../history/history-ui.js';
import { bindEvents as bindResultEvents } from '../ui/result.js';
import { bindEvents as bindEditorEvents } from '../editor/mathlive-config.js';
import { getTheme } from '../ui/theme.js';

let _els = null;

export function createApp() {
  // DOM refs
  _els = {
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
  initUI(_els);

  // Camera
  initCamera(
    document.getElementById('camVideo'),
    document.getElementById('camModal'),
    document.getElementById('camCropCanvas'),
    document.getElementById('camActions'),
    document.getElementById('camCropActions')
  );

  // Handwriting
  const hwCanvas = document.getElementById('hwCanvas');
  const hwWrap = document.getElementById('hwWrap');
  if (hwCanvas && hwWrap) {
    initHandwrite(hwCanvas, hwWrap);
    updateHwTheme(getTheme());
  }

  // Recognition mode selector
  setupRecogMode();

  // Android back button
  setupBackButton();

  // Event bindings
  registerBinding(() => bindCameraEvents({ onRecognize: processImage }));
  registerBinding(() => bindHandwriteEvents({ onRecognize: processImage }));
  registerBinding(() => bindHistoryEvents());
  registerBinding(() => bindResultEvents());
  registerBinding(() => bindEditorEvents());

  // Save OCR results to history
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
}

export async function start() {
  const { default: Logger } = await import('./logger.js');
  Logger.logSystemInfo();

  await initI18n();
  translateDOM();

  initCustomSelects();
  initSettings();
  syncCustomSelects();
  onLangChange(() => syncCustomSelects());

  bindAll(_els);

  initEditor();
  renderHistoryList();

  import('../export/pandoc-export.js').then(({ createExportDropdown }) => {
    const ocrContainer = document.getElementById('exportDropdownContainer');
    if (ocrContainer) {
      createExportDropdown(ocrContainer, {
        getText: () => document.getElementById('resultCode')?.textContent || '',
        t,
      });
    }
    const editorExportContainer = document.getElementById('editorExportContainer');
    if (editorExportContainer) {
      createExportDropdown(editorExportContainer, {
        getText: () => document.getElementById('mathField')?.value?.trim() || '',
        t,
      });
    }
  }).catch(() => {});

  try {
    const saved = JSON.parse(localStorage.getItem('ls_settings') || '{}');
    if (saved.renderEngine === 'mathjax') {
      window.__renderEngine = 'mathjax';
      const mod = await import('../editor/mathjax-renderer.js');
      mod.ensureMathjax();
      Logger.info('init', mod.isMathjaxReady() ? 'MathJax loaded' : 'MathJax loading...');
    } else {
      window.__renderEngine = 'katex';
    }
  } catch (_) {
    window.__renderEngine = 'katex';
  }

  hideSplash();
  initModels();

  import('../ui/welcome-dialog.js').then(m => m.checkFirstLaunch()).catch(() => {});
}

function setupRecogMode() {
  let recogMode = 'formula';
  document.querySelectorAll('.recog-tabs .mode-tab').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      document.querySelectorAll('.recog-tabs .mode-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      recogMode = btn.dataset.mode;
    });
  });
  document.getElementById('tabHandwrite')?.addEventListener('pointerdown', () => {
    document.querySelectorAll('.recog-tabs .mode-tab').forEach(b => b.classList.remove('active'));
    document.querySelector('.recog-tabs [data-mode="mixed"]')?.classList.add('active');
    recogMode = 'mixed';
  });
  document.getElementById('tabImage')?.addEventListener('pointerdown', () => {
    document.querySelectorAll('.recog-tabs .mode-tab').forEach(b => b.classList.remove('active'));
    document.querySelector('.recog-tabs [data-mode="formula"]')?.classList.add('active');
    recogMode = 'formula';
  });
  window.__recogMode = () => recogMode;
}

function setupBackButton() {
  (async () => {
    try {
      const { App } = await import('@capacitor/app');
      App.addListener('backButton', ({ canGoBack }) => {
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
    } catch (_) {}
  })();
}
