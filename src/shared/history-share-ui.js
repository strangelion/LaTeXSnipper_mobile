// History sharing UI: LAN pairing and encrypted WebDAV sync.

import { getAllResults, importResults } from '../history/history-db.js';
import { renderHistoryList } from '../history/history-ui.js';
import { t } from '../lang/i18n.js';
import { buildHistoryPackage, packageToRecords } from './history-share-package.js';
import { fetchLanHistory, pushLanHistory } from './lan-share-client.js';
import { showSaveToast } from './share.js';
import { downloadEncryptedWebdav, uploadEncryptedWebdav, loadWebdavCredentials, saveWebdavCredentials, hasSavedWebdavCredentials } from './webdav-sync.js';

let initialized = false;
let autoSyncTimer = null;

function $(id) { return document.getElementById(id); }

function setMessage(keyOrText, params, isError = false) {
  const el = $('shareMessage');
  if (!el) return;
  el.textContent = keyOrText.includes('.') ? t(keyOrText, params) : keyOrText;
  el.classList.toggle('error', isError);
}

function setBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle('loading', busy);
}

function readLanSettings() {
  return {
    baseUrl: $('lanShareUrl')?.value || '',
    pin: $('lanSharePin')?.value || '',
  };
}

function readWebdavSettings() {
  return {
    url: $('webdavUrl')?.value || '',
    username: $('webdavUser')?.value || '',
    password: $('webdavPassword')?.value || '',
    encryptionPassword: $('webdavEncryptPassword')?.value || '',
  };
}

async function currentPackage() {
  return buildHistoryPackage(await getAllResults(), 'mobile');
}

async function mergePackage(pkg) {
  const records = packageToRecords(pkg);
  const result = await importResults(records);
  await renderHistoryList(document.querySelector('.history-toolbar button.active')?.dataset?.filter || 'all');
  return result;
}

async function run(button, fn) {
  setBusy(button, true);
  try {
    await fn();
  } catch (err) {
    setMessage(err?.message || String(err), null, true);
  } finally {
    setBusy(button, false);
  }
}

export function initHistorySharing() {
  if (initialized) return;
  initialized = true;

  const modal = $('shareDialog');
  function openModal() {
    modal?.classList.add('show');
    modal?.setAttribute('aria-hidden', 'false');
    setMessage('share.ready');
    _loadSavedCredentials();
  }
  function closeModal() {
    modal?.classList.remove('show');
    modal?.setAttribute('aria-hidden', 'true');
  }

  async function _loadSavedCredentials() {
    try {
      const creds = await loadWebdavCredentials();
      if (creds) {
        if (creds.url) $('webdavUrl').value = creds.url;
        if (creds.username) $('webdavUser').value = creds.username;
        if (creds.password) $('webdavPassword').value = creds.password;
        if (creds.encryptionPassword) $('webdavEncryptPassword').value = creds.encryptionPassword;
      }
    } catch (_) {}
  }

  async function _saveCurrentCredentials() {
    try {
      await saveWebdavCredentials(readWebdavSettings());
    } catch (_) {}
  }
  $('historyShare')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    openModal();
  });
  $('shareClose')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    closeModal();
  });
  modal?.addEventListener('pointerdown', (e) => {
    if (e.target === modal) closeModal();
  });

  $('lanPull')?.addEventListener('pointerdown', (e) => run(e.currentTarget, async () => {
    const pkg = await fetchLanHistory(readLanSettings().baseUrl, readLanSettings().pin);
    const { added, updated } = await mergePackage(pkg);
    setMessage('share.imported', { added, updated });
    showSaveToast(t('share.imported', { added, updated }));
  }));

  $('lanPush')?.addEventListener('pointerdown', (e) => run(e.currentTarget, async () => {
    const settings = readLanSettings();
    const result = await pushLanHistory(settings.baseUrl, settings.pin, await currentPackage());
    setMessage('share.pushed', { added: result.added || 0, updated: result.updated || 0 });
  }));

  $('webdavUpload')?.addEventListener('pointerdown', (e) => run(e.currentTarget, async () => {
    await uploadEncryptedWebdav(readWebdavSettings(), await currentPackage());
    await _saveCurrentCredentials();
    setMessage('share.uploaded');
  }));

  $('webdavDownload')?.addEventListener('pointerdown', (e) => run(e.currentTarget, async () => {
    const pkg = await downloadEncryptedWebdav(readWebdavSettings());
    const { added, updated } = await mergePackage(pkg);
    await _saveCurrentCredentials();
    setMessage('share.imported', { added, updated });
  }));

  const autoSyncToggle = $('autoSyncToggle');
  const autoSyncInterval = $('autoSyncInterval');
  const autoSyncStatus = $('autoSyncStatus');

  async function doAutoSync() {
    if (!autoSyncToggle?.checked) return;
    const settings = readWebdavSettings();
    if (!settings.url || !settings.encryptionPassword) {
      if (autoSyncStatus) autoSyncStatus.textContent = t('share.autoSyncSkip');
      scheduleNext();
      return;
    }
    if (autoSyncStatus) autoSyncStatus.textContent = t('share.autoSyncRunning');
    try {
      const pkg = await downloadEncryptedWebdav(settings);
      const { added, updated } = await mergePackage(pkg);
      const now = new Date().toLocaleTimeString();
      if (autoSyncStatus) autoSyncStatus.textContent = `${t('share.autoSyncDone', { added, updated })} (${now})`;
    } catch (err) {
      if (autoSyncStatus) autoSyncStatus.textContent = `${t('share.autoSyncError')}: ${err.message}`;
    }
    scheduleNext();
  }

  function scheduleNext() {
    stopAutoSync();
    if (!autoSyncToggle?.checked) return;
    const ms = parseInt(autoSyncInterval?.value || '900000', 10);
    autoSyncTimer = setTimeout(doAutoSync, ms);
  }

  function stopAutoSync() {
    if (autoSyncTimer) {
      clearTimeout(autoSyncTimer);
      autoSyncTimer = null;
    }
  }

  autoSyncToggle?.addEventListener('change', () => {
    if (autoSyncToggle.checked) {
      scheduleNext();
    } else {
      stopAutoSync();
      if (autoSyncStatus) autoSyncStatus.textContent = '';
    }
  });

  autoSyncInterval?.addEventListener('change', () => {
    if (autoSyncToggle?.checked) scheduleNext();
  });
}
