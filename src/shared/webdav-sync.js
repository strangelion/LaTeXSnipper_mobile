// Minimal WebDAV file sync client. The server must allow CORS in browser/PWA mode.

import { decryptJson, encryptJson } from './share-crypto.js';

const CRED_STORAGE_KEY = 'latexsnipper-webdav-creds';
const WEBDAV_SUBFOLDER = 'latexsnipper';
const WEBDAV_FILENAME = 'history.json';

function normalizeFileUrl(url) {
  const value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) throw new Error('WebDAV URL must start with http:// or https://');
  return value;
}

export function normalizeWebdavUrl(url) {
  let value = String(url || '').trim().replace(/\/+$/, '');
  if (!value) return value;
  const parsed = new URL(value);
  let path = parsed.pathname.replace(/\/+$/, '');
  if (path.endsWith('.json')) return value;
  if (!path || !path.split('/').pop().includes('.')) {
    return `${parsed.origin}/${path}/${WEBDAV_SUBFOLDER}/${WEBDAV_FILENAME}`.replace(/\/+/g, '/').replace(':///', '://');
  }
  return value;
}

function authHeaders(username, password) {
  if (!username && !password) return {};
  return { Authorization: 'Basic ' + btoa(`${username || ''}:${password || ''}`) };
}

async function _deviceKey() {
  const raw = `latexsnipper:${navigator.userAgent}:${location.hostname}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return crypto.subtle.importKey('raw', buf.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function saveWebdavCredentials({ url, username, password, encryptionPassword }) {
  const key = await _deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify({ url, username, password, encryptionPassword }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  let binary = '';
  for (const b of ct) binary += String.fromCharCode(b);
  let ivBin = '';
  for (const b of iv) ivBin += String.fromCharCode(b);
  localStorage.setItem(CRED_STORAGE_KEY, btoa(ivBin + binary));
}

export async function loadWebdavCredentials() {
  const blob = localStorage.getItem(CRED_STORAGE_KEY);
  if (!blob) return null;
  try {
    const raw = atob(blob);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    const iv = arr.slice(0, 12);
    const ct = arr.slice(12);
    const key = await _deviceKey();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

export function hasSavedWebdavCredentials() {
  return !!localStorage.getItem(CRED_STORAGE_KEY);
}

export async function uploadEncryptedWebdav({ url, username, password, encryptionPassword }, historyPackage) {
  const encrypted = await encryptJson(historyPackage, encryptionPassword);
  const resp = await fetch(normalizeWebdavUrl(url), {
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
  const resp = await fetch(normalizeWebdavUrl(url), {
    method: 'GET',
    headers: authHeaders(username, password),
    cache: 'no-store',
  });
  if (!resp.ok) throw new Error(`WebDAV download failed: HTTP ${resp.status}`);
  const encrypted = await resp.json();
  return decryptJson(encrypted, encryptionPassword);
}
