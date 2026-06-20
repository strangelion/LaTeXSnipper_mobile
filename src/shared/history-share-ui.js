// History sharing UI: LAN pairing and encrypted WebDAV sync.

import { getAllResults, importResults } from '../history/history-db.js';
import { renderHistoryList } from '../history/history-ui.js';
import { t } from '../lang/i18n.js';
import { buildHistoryPackage, packageToRecords } from './history-share-package.js';
import { fetchLanHistory, pushLanHistory } from './lan-share-client.js';
import { showSaveToast } from './share.js';
import { downloadEncryptedWebdav, uploadEncryptedWebdav } from './webdav-sync.js';

let initialized = false;

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
  $('historyShare')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    modal?.classList.add('show');
    setMessage('share.ready');
  });
  $('shareClose')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    modal?.classList.remove('show');
  });
  modal?.addEventListener('pointerdown', (e) => {
    if (e.target === modal) modal.classList.remove('show');
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
    setMessage('share.uploaded');
  }));

  $('webdavDownload')?.addEventListener('pointerdown', (e) => run(e.currentTarget, async () => {
    const pkg = await downloadEncryptedWebdav(readWebdavSettings());
    const { added, updated } = await mergePackage(pkg);
    setMessage('share.imported', { added, updated });
  }));
}
