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

const WASM_FILENAME = 'pandoc.wasm';
const WASM_DIR = 'pandoc-cache';
const WASM_URL = 'https://github.com/jgm/pandoc/releases/download/3.6.4/pandoc-3.6.4-linux-amd64.tar.xz';

// Minimal pandoc WASM URL — use the official release binary
// For production, host the .wasm file on your own CDN or GitHub Release
const PANDOC_WASM_URLS = [
  'https://cdn.jsdelivr.net/gh/nicholasgasior/pandoc-wasm@master/pandoc.wasm',
];

function hasCapacitorFilesystem() {
  return window.Capacitor?.Plugins?.Filesystem;
}

/**
 * Check if pandoc.wasm is cached in filesystem.
 */
async function loadFromCache() {
  if (!hasCapacitorFilesystem()) return null;
  try {
    const { Filesystem } = window.Capacitor.Plugins;
    // Ensure directory exists
    try { await Filesystem.mkdir({ path: WASM_DIR, directory: 'DATA', recursive: true }); } catch {}
    const result = await Filesystem.readFile({ path: `${WASM_DIR}/${WASM_FILENAME}`, directory: 'DATA' });
    // result.data is base64-encoded
    const binaryString = atob(result.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch {
    return null;
  }
}

/**
 * Save pandoc.wasm to filesystem cache.
 */
async function saveToCache(arrayBuffer) {
  if (!hasCapacitorFilesystem()) return;
  try {
    const { Filesystem } = window.Capacitor.Plugins;
    try { await Filesystem.mkdir({ path: WASM_DIR, directory: 'DATA', recursive: true }); } catch {}
    // Convert ArrayBuffer to base64
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    await Filesystem.writeFile({
      path: `${WASM_DIR}/${WASM_FILENAME}`,
      data: base64,
      directory: 'DATA',
    });
    console.log(`[pandoc] Cached ${WASM_FILENAME} (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  } catch (e) {
    console.warn('[pandoc] Failed to cache WASM:', e.message);
  }
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
 */
export async function isPandocAvailable() {
  // Check filesystem cache
  const cached = await loadFromCache();
  if (cached) return true;

  // Check static asset (dev mode fallback)
  try {
    const resp = await fetch('/pandoc.wasm', { method: 'HEAD' });
    return resp.ok;
  } catch {
    return false;
  }
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
