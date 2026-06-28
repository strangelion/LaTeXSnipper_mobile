// Settings module — engine, presets, skin, AI polish, update check
// Imported once in main.js. All DOM IDs are in index.html.

import { isNativeOcrAvailable, OcrNative } from '../ocr/ocr-native.js';
import { t, currentLang, setLang, onLangChange } from '../core/i18n.js';
import Logger from '../core/logger.js';
import { shareFile } from '../export/share.js';
import { initModelSettings } from '../model/model-settings.js';
import { isPandocAvailable, downloadPandocWasm, invalidatePandocCache } from '../export/pandoc-init.js';
import { showProgress, hideProgress } from '../ui/status.js';
import { ICONS } from '../constants.js';

export function initSettings() {
  const extDiv = document.getElementById('extSettings');
  const polishSection = document.getElementById('polishSection');

  // ═══ Settings sub-tabs ═══
  const settingsTabs = document.querySelectorAll('.settings-tab');
  const settingsPanels = document.querySelectorAll('.settings-panel');
  settingsTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.settingsTab;
      settingsTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      settingsPanels.forEach(p => {
        p.style.display = p.dataset.panel === target ? '' : 'none';
      });
    });
  });

  // ═══ Engine dropdown ═══
  const engineSelect = document.getElementById('setEngineSelect');
  const getEngine = () => engineSelect?.value || 'builtin';
  window.__getEngine = getEngine;

  if (engineSelect) {
    engineSelect.addEventListener('change', () => {
      const v = engineSelect.value;
      localStorage.setItem('ls_engine', v);
      if (extDiv) extDiv.style.display = v === 'external' ? '' : 'none';
      if (polishSection) polishSection.style.display = v === 'builtin' ? 'none' : '';
    });
    // Sync initial visibility
    engineSelect.dispatchEvent(new Event('change'));
  }

  // ═══ Preset dropdown ═══
  const PRESETS = {
    paddle:   { baseUrl: 'http://localhost:8080',       model: 'paddleocr-vl' },
    silicon:  { baseUrl: 'https://api.siliconflow.cn',  model: 'Qwen/Qwen2.5-VL-72B-Instruct' },
    gemini:   { baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash' },
    'mineru-native': { baseUrl: 'http://localhost:8888', model: 'mineru' },
  };

  const presetSelect = document.getElementById('setPresetSelect');
  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      const p = PRESETS[presetSelect.value];
      if (!p) return;
      engineSelect.value = 'external';
      engineSelect.dispatchEvent(new Event('change'));
      document.getElementById('setBaseUrl').value = p.baseUrl || '';
      document.getElementById('setModel').value = p.model || '';
    });
  }

  // ═══ Skin dropdown ═══
  const skinSelect = document.getElementById('setSkinSelect');
  function applySkin(name) {
    document.documentElement.setAttribute('data-skin', name);
    if (skinSelect) skinSelect.value = name;
    try { localStorage.setItem('ls_skin', name); } catch (_) {}
  }
  if (skinSelect) {
    skinSelect.addEventListener('change', () => applySkin(skinSelect.value));
  }
  try { applySkin(localStorage.getItem('ls_skin') || 'default'); } catch (_) {}

  // ═══ Acceleration dropdown (instant apply) ═══
  const accelSelect = document.getElementById('setAccelSelect');
  accelSelect?.addEventListener('change', () => {
    if (isNative() && OcrNative?.setAcceleration) {
      OcrNative.setAcceleration({ mode: accelSelect.value }).catch(() => {});
    }
  });

  // ═══ Render engine (KaTeX / MathJax) ═══
  const renderEngineSelect = document.getElementById('setRenderEngineSelect');
  if (renderEngineSelect) {
    renderEngineSelect.addEventListener('change', () => {
      const v = renderEngineSelect.value;
      try {
        const s = JSON.parse(localStorage.getItem('ls_settings') || '{}');
        s.renderEngine = v;
        localStorage.setItem('ls_settings', JSON.stringify(s));
      } catch (_) {}
      // Expose to result.js
      window.__renderEngine = v;
    });
  }

  // ═══ Native settings persistence (Android SharedPreferences) ═══
  function isNative() {
    return isNativeOcrAvailable();
  }

  async function saveSettingsNative(s) {
    try {
      await OcrNative.saveSettings({ settings: JSON.stringify(s) });
    } catch (_) { /* fallback below */ }
  }

  async function loadSettingsNative() {
    try {
      const ret = await OcrNative.loadSettings();
      const json = ret.settings || '{}';
      return JSON.parse(json);
    } catch (_) { return {}; }
  }

  // ═══ Save ═══
  async function saveSettings() {
    const s = {
      engine: getEngine(),
      accel: document.getElementById('setAccelSelect')?.value || 'gpu',
      devMode: document.getElementById('setDevMode')?.checked || false,
      baseUrl: document.getElementById('setBaseUrl')?.value || '',
      model: document.getElementById('setModel')?.value || '',
      apiKey: document.getElementById('setApiKey')?.value || '',
      polishBaseUrl: document.getElementById('setPolishBaseUrl')?.value || '',
      polishModel: document.getElementById('setPolishModel')?.value || '',
      polishApiKey: document.getElementById('setPolishApiKey')?.value || '',
      renderEngine: document.getElementById('setRenderEngineSelect')?.value || 'katex',
    };
    // Always write to localStorage (sync, fast)
    try { localStorage.setItem('ls_settings', JSON.stringify(s)); } catch (_) {}
    // Also persist via native plugin (survives app data clear)
    if (isNative()) {
      await saveSettingsNative(s);
    }
    const saveBtn = document.getElementById('settingsSave');
    if (saveBtn) {
      saveBtn.textContent = t('btn.saved');
      setTimeout(() => saveBtn.textContent = t('btn.saveSettings'), 1500);
    }
  }

  const saveBtn = document.getElementById('settingsSave');
  saveBtn?.addEventListener('pointerdown', e => { e.preventDefault(); saveSettings(); });
  saveBtn?.addEventListener('click', e => { e.preventDefault(); saveSettings(); });

  // ═══ Restore saved ═══
  async function restoreSettings() {
    let saved = {};
    if (isNative()) {
      saved = await loadSettingsNative();
      // Sync native settings to localStorage as fallback cache
      if (saved && Object.keys(saved).length > 0) {
        try { localStorage.setItem('ls_settings', JSON.stringify(saved)); } catch (_) {}
      }
    } else {
      try { saved = JSON.parse(localStorage.getItem('ls_settings') || '{}'); } catch (_) {}
    }
    if (saved.accel) {
      const accelSelect = document.getElementById('setAccelSelect');
      if (accelSelect) accelSelect.value = saved.accel;
      if (isNative() && OcrNative?.setAcceleration) {
        try { await OcrNative.setAcceleration({ mode: saved.accel }); } catch (_) {}
      }
    } else {
      // Default to GPU if not set
      const accelSelect = document.getElementById('setAccelSelect');
      if (accelSelect) accelSelect.value = 'gpu';
    }
    if (saved.devMode !== undefined) {
      const devCb = document.getElementById('setDevMode');
      if (devCb) {
        devCb.checked = saved.devMode;
        devCb.dispatchEvent(new Event('change'));
      }
    }
    if (saved.engine && engineSelect) { engineSelect.value = saved.engine; engineSelect.dispatchEvent(new Event('change')); }
    if (saved.baseUrl) document.getElementById('setBaseUrl').value = saved.baseUrl;
    if (saved.model) document.getElementById('setModel').value = saved.model;
    if (saved.apiKey) document.getElementById('setApiKey').value = saved.apiKey;
    if (saved.polishBaseUrl) document.getElementById('setPolishBaseUrl').value = saved.polishBaseUrl;
    if (saved.polishModel) document.getElementById('setPolishModel').value = saved.polishModel;
    if (saved.polishApiKey) document.getElementById('setPolishApiKey').value = saved.polishApiKey;
    if (saved.renderEngine) {
      const reSelect = document.getElementById('setRenderEngineSelect');
      if (reSelect) reSelect.value = saved.renderEngine;
    }
    window.__renderEngine = saved.renderEngine || 'katex';
  }
  restoreSettings();

  // ═══ Test connections ═══
  async function testConn(baseUrl, resultEl) {
    resultEl.textContent = t('settings.testing');
    if (!baseUrl) { resultEl.textContent = t('error.noBaseUrl'); return; }
    try {
      const resp = await fetch(baseUrl.replace(/\/+$/, '') + '/models', { signal: AbortSignal.timeout(10000) });
      resultEl.textContent = resp.ok ? t('settings.testSuccess') : '✗ HTTP ' + resp.status;
    } catch (err) { resultEl.textContent = '✗ ' + (err.message || t('settings.testFail')); }
  }

  document.getElementById('setTestConn')?.addEventListener('pointerdown', e => {
    e.preventDefault();
    testConn(document.getElementById('setBaseUrl')?.value || '', document.getElementById('setTestResult'));
  });
  document.getElementById('setPolishTest')?.addEventListener('pointerdown', e => {
    e.preventDefault();
    testConn(document.getElementById('setPolishBaseUrl')?.value || '', document.getElementById('setPolishTestResult'));
  });

  // ═══ Language ═══
  const langSelect = document.getElementById('setLangSelect');
  if (langSelect) {
    langSelect.value = currentLang();
    langSelect.addEventListener('change', async () => { await setLang(langSelect.value); });
  }

  async function refreshLogDisplay(devLogOutput) {
    // Pull Java native logs (synchronous, getLogs is @JavascriptInterface)
    let nativeLogs = '';
    try {
      if (isNative() && typeof window.NativeOcr !== 'undefined' && window.NativeOcr.getLogs) {
        nativeLogs = window.NativeOcr.getLogs() || '';
      }
    } catch (_) {
      nativeLogs = '[Failed to get native logs: ' + _.message + ']';
    }

    // Get JS logs — use more lines (500) when showing all, 200 for auto-refresh
    const jsLines = Logger.getLastLines(500);
    const combined = [];

    // System info header
    combined.push('=== LaTeXSnipper 诊断日志 ===');
    combined.push('时间: ' + new Date().toLocaleString('zh-CN'));
    combined.push('平台: ' + (isNative() ? 'Android' : '浏览器'));
    combined.push('硬件并发: ' + (navigator.hardwareConcurrency || 'unknown'));
    combined.push('内存: ' + (navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'unknown'));
    combined.push('');

    if (nativeLogs) {
      combined.push('── Java Native Logs ──');
      // Only show last 200 lines of native logs to avoid overflow
      const nativeLines = nativeLogs.split('\n').filter(Boolean);
      combined.push(nativeLines.slice(-200).join('\n'));
      combined.push('');
    }

    if (jsLines.length) {
      combined.push('── JS Logs (最新 ' + jsLines.length + ' 条) ──');
      combined.push(jsLines.join('\n'));
    } else {
      combined.push(t('dev.noLogs'));
    }

    devLogOutput.textContent = combined.join('\n');
    devLogOutput.style.display = '';
  }

  // ═══ Developer options ═══
  const devMode = document.getElementById('setDevMode');
  const devOptions = document.getElementById('devOptions');
  const devOptionsContent = document.getElementById('devOptionsContent');
  const devGroupTitle = document.getElementById('devGroupTitle');

  // Toggle dev options group on title click
  devGroupTitle?.addEventListener('click', () => {
    const visible = devOptions.style.display !== 'none';
    devOptions.style.display = visible ? 'none' : '';
    devGroupTitle.textContent = visible ? '开发者选项 ▸' : '开发者选项 ▾';
  });

  // Toggle dev mode checkbox
  devMode?.addEventListener('change', () => {
    if (devOptionsContent) devOptionsContent.style.display = devMode.checked ? '' : 'none';
  });

  const devMultiThread = document.getElementById('devMultiThread');
  devMultiThread?.addEventListener('change', () => {
    try { localStorage.setItem('ls_mt', devMultiThread.checked ? '1' : '0'); } catch (_) {}
  });
  try { if (devMultiThread) devMultiThread.checked = (localStorage.getItem('ls_mt') || '1') !== '0'; } catch (_) {}

  const devLogOutput = document.getElementById('devLogOutput');
  document.getElementById('devShowLogs')?.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!devLogOutput) return;
    // Pull Java logs first, then show combined
    refreshLogDisplay(devLogOutput);
  });
  document.getElementById('devClearLogs')?.addEventListener('pointerdown', e => {
    e.preventDefault();
    Logger.clear();
    try { if (isNative() && window.NativeOcr.getLogs) window.NativeOcr.getLogs(); } catch (_) {}
    if (devLogOutput) { devLogOutput.textContent = t('dev.cleared'); }
  });
  const devExportBtn = document.getElementById('devExportLogs');
  devExportBtn?.addEventListener('pointerdown', async e => {
    e.preventDefault();
    e.stopPropagation();
    if (devExportBtn.disabled) return;
    devExportBtn.disabled = true;
    try {
      // Export ALL diag info as ZIP via share
      await Logger.exportAndShare();
    } catch (err) {
      alert('导出失败: ' + (err.message || err));
    }
    setTimeout(() => { devExportBtn.disabled = false; }, 2000);
  });
  document.getElementById('devClearCache')?.addEventListener('pointerdown', async e => {
    e.preventDefault();
    const btn = e.currentTarget;
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      btn.textContent = t('btn.cacheCleared');
      setTimeout(() => btn.textContent = t('btn.clearCache'), 1500);
    } catch (_) {
      btn.textContent = t('btn.cacheClearFailed');
      setTimeout(() => btn.textContent = t('btn.clearCache'), 1500);
    }
  });

  // ═══ Pandoc WASM download ═══
  const pandocBtn = document.getElementById('btnDownloadPandoc');
  const pandocStatus = document.getElementById('pandocStatus');
  async function updatePandocStatus() {
    try {
      const available = await isPandocAvailable();
      if (pandocStatus) {
        pandocStatus.innerHTML = available
          ? `<span style="color:var(--accent);display:inline-flex;align-items:center;gap:0.3rem;">${ICONS.ready} 已下载</span>`
          : `<span style="color:var(--muted);display:inline-flex;align-items:center;gap:0.3rem;">${ICONS.error} 未下载</span>`;
      }
      if (pandocBtn) {
        pandocBtn.textContent = available ? '重新下载' : '下载 Pandoc WASM（~58 MB）';
        pandocBtn.disabled = false;
      }
    } catch {}
  }
  updatePandocStatus();

  pandocBtn?.addEventListener('pointerdown', async e => {
    e.preventDefault();
    if (pandocBtn.disabled) return;
    pandocBtn.disabled = true;
    pandocBtn.textContent = '下载中...';
    showProgress('下载 Pandoc WASM...', 0);

    if (isNativeOcrAvailable()) {
      OcrNative.showNotification('下载 Pandoc WASM', 0, 100);
    }

    try {
      await downloadPandocWasm((info) => {
        if (info.phase === 'downloading' && info.total > 0) {
          const pct = Math.round(info.downloaded / info.total * 100);
          pandocBtn.textContent = `${pct}%`;
          showProgress(`下载 Pandoc WASM (${(info.downloaded / 1024 / 1024).toFixed(1)}/${(info.total / 1024 / 1024).toFixed(1)} MB)`, pct);
          if (isNativeOcrAvailable()) {
            OcrNative.showNotification('下载 Pandoc WASM', pct, 100);
          }
        } else if (info.phase === 'cached') {
          pandocBtn.innerHTML = `${ICONS.ready} 已下载`;
          showProgress('缓存中...', 100);
        }
      });
      hideProgress();
      if (isNativeOcrAvailable()) OcrNative.hideNotification();
      invalidatePandocCache();
      await updatePandocStatus();
    } catch (err) {
      hideProgress();
      if (isNativeOcrAvailable()) OcrNative.hideNotification();
      pandocBtn.textContent = '下载失败';
      pandocBtn.disabled = false;
      Logger.error('SETTINGS', 'Pandoc download failed', err);
      setTimeout(() => { pandocBtn.textContent = '下载 Pandoc WASM（~58 MB）'; }, 2000);
    }
  });

  // ═══ Check for updates ═══
  const autoUpdateCheckbox = document.getElementById('setAutoUpdate');
  try { autoUpdateCheckbox.checked = localStorage.getItem('latexsnipper-autoUpdate') !== 'false'; } catch (_) {}
  autoUpdateCheckbox?.addEventListener('change', () => {
    try { localStorage.setItem('latexsnipper-autoUpdate', autoUpdateCheckbox.checked ? 'true' : 'false'); } catch (_) {}
  });

  import('../update-checker.js').then(({ initUpdateChecker, checkForUpdateNow }) => {
    // Version from index.html <meta name="version"> — always matches the build
    const appVersion = document.querySelector('meta[name="version"]')
      ?.getAttribute('content') || '1.0.0';
    initUpdateChecker(appVersion);
    const btn = document.getElementById('checkUpdateBtn');
    btn?.addEventListener('pointerdown', async e => {
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true; btn.textContent = t('update.checking');
      await checkForUpdateNow();
      btn.disabled = false; btn.textContent = t('update.checkUpdate');
    });
  });

  // Initialize model management UI
  initModelSettings();
}
