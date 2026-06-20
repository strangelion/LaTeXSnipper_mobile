// Minimal WebDAV file sync client. The server must allow CORS in browser/PWA mode.

import { decryptJson, encryptJson } from './share-crypto.js';

function normalizeFileUrl(url) {
  const value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) throw new Error('WebDAV URL must start with http:// or https://');
  return value;
}

function authHeaders(username, password) {
  if (!username && !password) return {};
  return { Authorization: 'Basic ' + btoa(`${username || ''}:${password || ''}`) };
}

export async function uploadEncryptedWebdav({ url, username, password, encryptionPassword }, historyPackage) {
  const encrypted = await encryptJson(historyPackage, encryptionPassword);
  const resp = await fetch(normalizeFileUrl(url), {
    method: 'PUT',
    headers: {
      ...authHeaders(username, password),
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(encrypted),
  });
  if (!resp.ok) throw new Error(`WebDAV upload failed: HTTP ${resp.status}`);
}

export async function downloadEncryptedWebdav({ url, username, password, encryptionPassword }) {
  const resp = await fetch(normalizeFileUrl(url), {
    method: 'GET',
    headers: authHeaders(username, password),
    cache: 'no-store',
  });
  if (!resp.ok) throw new Error(`WebDAV download failed: HTTP ${resp.status}`);
  const encrypted = await resp.json();
  return decryptJson(encrypted, encryptionPassword);
}
