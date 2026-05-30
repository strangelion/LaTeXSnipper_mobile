// Settings module — engine, presets, skin, AI polish, update check
// Imported once in main.js. All DOM IDs are in index.html.

import { t, currentLang, setLang, onLangChange } from '../lang/i18n.js';

export function initSettings() {
  const extDiv = document.getElementById('extSettings');
  const polishSection = document.getElementById('polishSection');

  // ═══ Engine dropdown ═══
  const engineSelect = document.getElementById('setEngineSelect');
  const getEngine = () => engineSelect?.value || 'hybrid';
  window.__getEngine = getEngine;

  if (engineSelect) {
    engineSelect.addEventListener('change', () => {
      const v = engineSelect.value;
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

  // ═══ Save / Load ═══
  const saveBtn = document.getElementById('settingsSave');
  saveBtn?.addEventListener('pointerdown', e => {
    e.preventDefault();
    const s = {
      engine: getEngine(),
      baseUrl: document.getElementById('setBaseUrl')?.value || '',
      model: document.getElementById('setModel')?.value || '',
      apiKey: document.getElementById('setApiKey')?.value || '',
      polishBaseUrl: document.getElementById('setPolishBaseUrl')?.value || '',
      polishModel: document.getElementById('setPolishModel')?.value || '',
      polishApiKey: document.getElementById('setPolishApiKey')?.value || '',
    };
    try { localStorage.setItem('ls_settings', JSON.stringify(s)); } catch (_) {}
    saveBtn.textContent = t('btn.saved');
    setTimeout(() => saveBtn.textContent = t('btn.saveSettings'), 1500);
  });

  // Restore saved
  try {
    const saved = JSON.parse(localStorage.getItem('ls_settings') || '{}');
    if (saved.engine && engineSelect) { engineSelect.value = saved.engine; engineSelect.dispatchEvent(new Event('change')); }
    if (saved.baseUrl) document.getElementById('setBaseUrl').value = saved.baseUrl;
    if (saved.model) document.getElementById('setModel').value = saved.model;
    if (saved.apiKey) document.getElementById('setApiKey').value = saved.apiKey;
    if (saved.polishBaseUrl) document.getElementById('setPolishBaseUrl').value = saved.polishBaseUrl;
    if (saved.polishModel) document.getElementById('setPolishModel').value = saved.polishModel;
    if (saved.polishApiKey) document.getElementById('setPolishApiKey').value = saved.polishApiKey;
  } catch (_) {}

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

  // ═══ Developer options ═══
  const devMode = document.getElementById('setDevMode');
  const devOptions = document.getElementById('devOptions');
  devMode?.addEventListener('change', () => {
    if (devOptions) devOptions.style.display = devMode.checked ? '' : 'none';
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
    const logs = (localStorage.getItem('ls_log') || '').split('\n').filter(Boolean).slice(-100);
    devLogOutput.textContent = logs.length ? logs.join('\n') : t('dev.noLogs');
    devLogOutput.style.display = '';
  });
  document.getElementById('devClearLogs')?.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { localStorage.setItem('ls_log', ''); } catch (_) {}
    if (devLogOutput) { devLogOutput.textContent = t('dev.cleared'); }
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

  // ═══ Check for updates ═══
  const autoUpdateCheckbox = document.getElementById('setAutoUpdate');
  try { autoUpdateCheckbox.checked = localStorage.getItem('latexsnipper-autoUpdate') !== 'false'; } catch (_) {}
  autoUpdateCheckbox?.addEventListener('change', () => {
    try { localStorage.setItem('latexsnipper-autoUpdate', autoUpdateCheckbox.checked ? 'true' : 'false'); } catch (_) {}
  });

  import('../update-checker.js').then(({ initUpdateChecker, checkForUpdateNow }) => {
    initUpdateChecker('1.0.0');
    const btn = document.getElementById('checkUpdateBtn');
    btn?.addEventListener('pointerdown', async e => {
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true; btn.textContent = t('update.checking');
      await checkForUpdateNow();
      btn.disabled = false; btn.textContent = t('update.checkUpdate');
    });
  });
}
