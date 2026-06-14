/**
 * Pandoc WASM loader with filesystem cache.
 *
 * Flow:
 * 1. Check Capacitor Filesystem for cached pandoc.wasm
 * 2. If not cached, download from CDN / GitHub Release
 * 3. Save to filesystem for future use
 * 4. Initialize pandoc with the cached binary
 *
 * Falls back to /pandoc.wasm static asset if filesystem unavailable (dev mode).
 */

let _instance = null;
let _loading = false;
let _waiters = [];
let _pandocAvailable = null; // cached: true/false/null (not checked yet)

const WASM_FILENAME = 'pandoc.wasm';
const WASM_DIR = 'pandoc-cache';

// Pandoc WASM download URLs — hosted on GitHub Release
const PANDOC_WASM_URLS = [
  'https://github.com/strangelion/LaTeXSnipper_mobile/releases/download/models-v1.3.0/pandoc.wasm',
  'https://gh.zwy.one/https://github.com/strangelion/LaTeXSnipper_mobile/releases/download/models-v1.3.0/pandoc.wasm',
  'https://gh.xxooo.cf/https://github.com/strangelion/LaTeXSnipper_mobile/releases/download/models-v1.3.0/pandoc.wasm',
];

function hasCapacitorFilesystem() {
  return window.Capacitor?.Plugins?.Filesystem;
}

/**
 * Check if pandoc.wasm is cached in IndexedDB.
 * Returns ArrayBuffer or null.
 */
async function loadFromCache() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('pandoc-cache', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('wasm');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('wasm', 'readonly');
        const get = tx.objectStore('wasm').get(WASM_FILENAME);
        get.onsuccess = () => { db.close(); resolve(get.result || null); };
        get.onerror = () => { db.close(); resolve(null); };
      };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

/**
 * Save pandoc.wasm to IndexedDB cache.
 */
async function saveToCache(arrayBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('pandoc-cache', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('wasm');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('wasm', 'readwrite');
        tx.objectStore('wasm').put(arrayBuffer, WASM_FILENAME);
        tx.oncomplete = () => { db.close(); console.log(`[pandoc] Cached ${WASM_FILENAME} (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB)`); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

/**
 * Download pandoc.wasm from URLs (with fallback).
 */
async function downloadWasm(onProgress) {
  for (const url of PANDOC_WASM_URLS) {
    try {
      console.log(`[pandoc] Downloading from ${url}...`);
      if (onProgress) onProgress({ phase: 'downloading', url });

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const contentLength = parseInt(resp.headers.get('content-length') || '0', 10);
      const reader = resp.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (onProgress && contentLength > 0) {
          onProgress({ phase: 'downloading', downloaded: received, total: contentLength });
        }
      }

      // Merge chunks
      const totalLen = chunks.reduce((s, c) => s + c.length, 0);
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      return merged.buffer;
    } catch (e) {
      console.warn(`[pandoc] Download failed from ${url}: ${e.message}`);
    }
  }
  throw new Error('Failed to download pandoc.wasm from all sources');
}

/**
 * Check if pandoc.wasm is available (cached or static).
 * Result is cached after first check to avoid repeated network requests.
 */
export async function isPandocAvailable() {
  if (_pandocAvailable !== null) return _pandocAvailable;

  // Check filesystem cache
  const cached = await loadFromCache();
  if (cached) { _pandocAvailable = true; return true; }

  // Check static asset (dev mode fallback)
  try {
    const resp = await fetch('/pandoc.wasm', { method: 'HEAD' });
    _pandocAvailable = resp.ok;
    return _pandocAvailable;
  } catch {
    _pandocAvailable = false;
    return false;
  }
}

/**
 * Invalidate pandoc availability cache (call after download).
 */
export function invalidatePandocCache() {
  _pandocAvailable = null;
  _instance = null;
}

/**
 * Download pandoc.wasm to cache.
 * @param {function} onProgress - callback({ phase, downloaded, total, url })
 */
export async function downloadPandocWasm(onProgress) {
  const binary = await downloadWasm(onProgress);
  await saveToCache(binary);
  if (onProgress) onProgress({ phase: 'cached', size: binary.byteLength });
  return binary;
}

/**
 * Initialize pandoc WASM instance (cached or static).
 */
export async function initPandocWasm() {
  if (_instance) return _instance;
  if (_loading) {
    return new Promise(resolve => { _waiters.push(resolve); });
  }
  _loading = true;

  try {
    // Import core.js from node_modules
    const { createPandocInstance } = await import(
      '../../node_modules/pandoc-wasm/src/core.js'
    );

    // Try filesystem cache first
    let wasmBinary = await loadFromCache();

    // Fallback to static asset (dev mode)
    if (!wasmBinary) {
      try {
        const resp = await fetch('/pandoc.wasm');
        if (resp.ok) wasmBinary = await resp.arrayBuffer();
      } catch {}
    }

    if (!wasmBinary) {
      throw new Error('pandoc.wasm not found. Please download it in Settings → Export.');
    }

    _instance = await createPandocInstance(wasmBinary);
    _waiters.forEach(r => r(_instance));
    _waiters = [];
    return _instance;
  } catch (e) {
    _loading = false;
    _waiters = [];
    throw e;
  }
}
