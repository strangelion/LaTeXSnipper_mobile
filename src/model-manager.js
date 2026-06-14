// Model Manager — manages model manifests, downloads, and local storage.
// Models are downloaded from GitHub Releases or imported by user.
// Storage structure:
//   models/                  — downloaded model files
//   manifests/               — cached manifest JSON per source
//   sources.json             — registered manifest sources
//   active.json              — current active model selections

import Logger from './shared/logger.js';

const STORAGE_KEYS = {
  SOURCES: 'ls_model_sources',
  ACTIVE: 'ls_model_active',
  MANIFESTS: 'ls_model_manifests',
  INSTALLED: 'ls_model_installed',
};

const DEFAULT_SOURCES = [
  {
    id: 'official',
    label: 'Official',
    url: 'https://github.com/strangelion/LaTeXSnipper_mobile/tree/main/dist-models',
    mirrors: [], // Add mirror URLs here (e.g., Gitee releases)
    builtin: true,
  }
];

const MODEL_CATEGORIES = [
  'formula-det',
  'formula-rec',
  'text-det',
  'text-rec',
];

// ── Local storage helpers ──

function getLocal(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function setLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ── Manifest validation ──

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest.sourceId) errors.push('Missing sourceId');
  if (!manifest.sourceLabel) errors.push('Missing sourceLabel');
  if (!manifest.version) errors.push('Missing version');
  if (!manifest.categories || typeof manifest.categories !== 'object') {
    errors.push('Missing or invalid categories');
  } else {
    for (const [cat, info] of Object.entries(manifest.categories)) {
      if (!MODEL_CATEGORIES.includes(cat)) {
        errors.push(`Unknown category: ${cat}`);
      }
      if (!info.variants || !Array.isArray(info.variants)) {
        errors.push(`${cat}: missing variants array`);
      } else {
        for (const v of info.variants) {
          if (!v.id) errors.push(`${cat}: variant missing id`);
          if (!v.files || !Array.isArray(v.files)) {
            errors.push(`${cat}.${v.id}: missing files array`);
          }
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function parseManifest(json) {
  const result = validateManifest(json);
  if (!result.valid) {
    throw new Error(`Invalid manifest: ${result.errors.join('; ')}`);
  }
  return {
    sourceId: json.sourceId,
    sourceLabel: json.sourceLabel,
    version: json.version,
    baseUrl: json.baseUrl || '',
    mirrors: json.mirrors || [],
    categories: json.categories || {},
  };
}

// ── Source management ──

export function getSources() {
  const custom = getLocal(STORAGE_KEYS.SOURCES, []);
  return [...DEFAULT_SOURCES, ...custom];
}

export function addSource(source) {
  const custom = getLocal(STORAGE_KEYS.SOURCES, []);
  if (custom.some(s => s.id === source.id)) {
    throw new Error(`Source ${source.id} already exists`);
  }
  custom.push({ id: source.id, label: source.label, url: source.url, builtin: false });
  setLocal(STORAGE_KEYS.SOURCES, custom);
}

export function removeSource(sourceId) {
  if (DEFAULT_SOURCES.some(s => s.id === sourceId)) {
    throw new Error('Cannot remove built-in source');
  }
  const custom = getLocal(STORAGE_KEYS.SOURCES, []);
  setLocal(STORAGE_KEYS.SOURCES, custom.filter(s => s.id !== sourceId));
}

// ── Active model management ──

export function getActiveModels() {
  return getLocal(STORAGE_KEYS.ACTIVE, {});
}

export function setActiveModel(category, sourceId, variantId) {
  const active = getActiveModels();
  active[category] = { sourceId, variantId };
  setLocal(STORAGE_KEYS.ACTIVE, active);
}

// ── Installed model tracking ──

export function getInstalledModels() {
  return getLocal(STORAGE_KEYS.INSTALLED, {});
}

export function markInstalled(category, variantId, sourceId, files) {
  const installed = getInstalledModels();
  if (!installed[category]) installed[category] = {};
  installed[category][variantId] = { sourceId, files, installedAt: Date.now() };
  setLocal(STORAGE_KEYS.INSTALLED, installed);
}

export function markUninstalled(category, variantId) {
  const installed = getInstalledModels();
  if (installed[category]) {
    delete installed[category][variantId];
  }
  setLocal(STORAGE_KEYS.INSTALLED, installed);
}

// ── Manifest fetching ──

const GITHUB_API_BASE = 'https://api.github.com';

export async function fetchManifest(source) {
  let url = source.url;

  // If URL points to a GitHub repo, resolve to raw content URL for model-manifest.json
  if (url.includes('github.com') && !url.includes('raw.githubusercontent.com')) {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\/tree\/([^/]+)\/(.*))?$/);
    if (match) {
      const [, owner, repo, branch, path] = match;
      const b = branch || 'main';
      const p = path ? path.replace(/\/$/, '') : '';
      url = `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${p ? p + '/' : ''}model-manifest.json`;
    }
  }

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch manifest: HTTP ${resp.status}`);
  const json = await resp.json();
  return parseManifest(json);
}

export async function refreshManifests() {
  const sources = getSources();
  const manifests = [];

  for (const source of sources) {
    try {
      const manifest = await fetchManifest(source);
      manifests.push(manifest);
    } catch (err) {
      console.warn(`Failed to fetch manifest from ${source.id}:`, err);
    }
  }

  setLocal(STORAGE_KEYS.MANIFESTS, manifests);
  return manifests;
}

// ── Variant merging (across sources) ──

export function getAllVariants(manifests) {
  const merged = {};
  for (const cat of MODEL_CATEGORIES) {
    merged[cat] = { variants: [], default: null };
  }
  for (const manifest of manifests) {
    for (const [cat, info] of Object.entries(manifest.categories)) {
      if (!merged[cat]) continue;
      for (const v of info.variants) {
        const idx = merged[cat].variants.findIndex(x => x.id === v.id);
        if (idx < 0) {
          merged[cat].variants.push({ ...v, sourceId: manifest.sourceId });
        }
        // Duplicate: keep first occurrence (skip)
      }
      if (info.default) merged[cat].default = info.default;
    }
  }
  return merged;
}

// ── Model file I/O ──

async function writeModelFile(category, variantId, filename, data) {
  // Use native bridge chunked writing to avoid OOM on large files
  if (window.NativeOcr?.startModelWrite) {
    const CHUNK_SIZE = 512 * 1024; // 512KB chunks
    const bytes = new Uint8Array(data);
    const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);

    const startResult = await window.NativeOcr.startModelWrite(category, variantId, filename);
    if (startResult !== 'ok') throw new Error('startModelWrite failed: ' + startResult);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, bytes.length);
      const chunk = bytes.slice(start, end);
      const base64 = arrayBufferToBase64(chunk.buffer);
      const result = await window.NativeOcr.writeModelChunk(base64);
      if (result !== 'ok') throw new Error('writeModelChunk failed: ' + result);
    }

    const finishResult = await window.NativeOcr.finishModelWrite();
    if (finishResult !== 'ok') throw new Error('finishModelWrite failed: ' + finishResult);
    Logger.info('model', `Wrote ${category}/${variantId}/${filename} (${(data.byteLength / 1024 / 1024).toFixed(1)} MB, ${totalChunks} chunks)`);
    return;
  }

  // Fallback: Capacitor Filesystem (small files only)
  if (window.Capacitor?.Plugins?.Filesystem) {
    const { Filesystem } = window.Capacitor.Plugins;
    const dirPath = `models/${category}/${variantId}`;

    try {
      await Filesystem.mkdir({ path: `models/${category}`, directory: 'DATA', recursive: true });
    } catch (_) {}
    try {
      await Filesystem.mkdir({ path: dirPath, directory: 'DATA', recursive: true });
    } catch (_) {}

    const base64 = arrayBufferToBase64(data);
    try {
      await Filesystem.writeFile({
        path: `${dirPath}/${filename}`,
        data: base64,
        directory: 'DATA',
        encoding: 'base64',
      });
      Logger.info('model', `Wrote ${category}/${variantId}/${filename} (${(data.byteLength / 1024 / 1024).toFixed(1)} MB)`);
    } catch (e) {
      Logger.error('model', `Failed to write ${filename}: ${e.message}`);
      throw e;
    }
  } else {
    const key = `model:${category}:${variantId}:${filename}`;
    const db = await openModelDB();
    const tx = db.transaction('models', 'readwrite');
    tx.objectStore('models').put({ key, data });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function openModelDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('LatexSnipperModels', 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('models', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Import from ZIP ──

export async function importFromZip(zipFile, onProgress) {
  const JSZip = (await import('jszip')).default || window.JSZip;
  if (!JSZip) throw new Error('JSZip not available');

  const zip = await JSZip.loadAsync(zipFile);

  // Backup current state for rollback on failure
  const backupInstalled = JSON.parse(JSON.stringify(getInstalledModels()));
  const backupManifests = JSON.parse(JSON.stringify(getLocal(STORAGE_KEYS.MANIFESTS, [])));

  // Read manifest — skip unknown categories gracefully
  let manifest = null;
  const manifestFile = zip.file('model-manifest.json');
  if (manifestFile) {
    try {
      const text = await manifestFile.async('string');
      const raw = JSON.parse(text);
      // Filter out unknown categories before validation
      if (raw.categories) {
        for (const cat of Object.keys(raw.categories)) {
          if (!MODEL_CATEGORIES.includes(cat)) delete raw.categories[cat];
        }
      }
      manifest = parseManifest(raw);
    } catch (e) {
      console.warn('Manifest parse error (non-fatal):', e.message);
    }
  }

  const files = Object.keys(zip.files).filter(f => !zip.files[f].dir && f !== 'model-manifest.json');
  let processed = 0;

  try {
    for (const filePath of files) {
      if (onProgress) onProgress({ file: filePath, processed: processed++, total: files.length });

      const parts = filePath.split('/');
      if (parts.length < 2) continue;

      const category = parts[0];
      if (!MODEL_CATEGORIES.includes(category)) continue;

      const variantId = parts.length >= 3 ? parts[1] : category;
      const filename = parts[parts.length - 1];

      const data = await zip.file(filePath).async('arraybuffer');
      await writeModelFile(category, variantId, filename, data);

      const installed = getInstalledModels();
      if (!installed[category]) installed[category] = {};
      if (!installed[category][variantId]) {
        installed[category][variantId] = { sourceId: 'import', files: [] };
      }
      if (!installed[category][variantId].files.includes(filename)) {
        installed[category][variantId].files.push(filename);
      }
      setLocal(STORAGE_KEYS.INSTALLED, installed);
    }

    // Save manifest
    if (manifest) {
      const manifests = getLocal(STORAGE_KEYS.MANIFESTS, []);
      const idx = manifests.findIndex(m => m.sourceId === manifest.sourceId);
      if (idx >= 0) manifests[idx] = manifest;
      else manifests.push(manifest);
      setLocal(STORAGE_KEYS.MANIFESTS, manifests);

      // Auto-set active variant for each category if not already set
      const active = getActiveModels();
      for (const [cat, info] of Object.entries(manifest.categories)) {
        if (!active[cat] && info.default) {
          setActiveModel(cat, manifest.sourceId, info.default);
        }
      }
    }

    return { success: true, manifest, fileCount: files.length };
  } catch (e) {
    // Rollback on failure
    setLocal(STORAGE_KEYS.INSTALLED, backupInstalled);
    setLocal(STORAGE_KEYS.MANIFESTS, backupManifests);
    throw e;
  }
}

// ── Import single .onnx file ──

export async function importSingleFile(file, category, variantId) {
  const data = await file.arrayBuffer();
  const filename = file.name;

  await writeModelFile(category, variantId, filename, data);

  const { analyzeOnnx } = await import('./model-analyzer.js');
  const analysis = analyzeOnnx(data);

  const installed = getInstalledModels();
  if (!installed[category]) installed[category] = {};
  if (!installed[category][variantId]) {
    installed[category][variantId] = { sourceId: 'import', files: [] };
  }
  if (!installed[category][variantId].files.includes(filename)) {
    installed[category][variantId].files.push(filename);
  }
  setLocal(STORAGE_KEYS.INSTALLED, installed);

  return { success: true, analysis };
}

// ── Download progress (for resume support) ──

const STORAGE_KEYS_DOWNLOAD_PROGRESS = 'ls_download_progress';

function getDownloadProgress() {
  return getLocal(STORAGE_KEYS_DOWNLOAD_PROGRESS, {});
}

function setDownloadProgress(key, data) {
  const progress = getDownloadProgress();
  if (data) {
    progress[key] = data;
  } else {
    delete progress[key];
  }
  setLocal(STORAGE_KEYS_DOWNLOAD_PROGRESS, progress);
}

function clearAllDownloadProgress() {
  setLocal(STORAGE_KEYS_DOWNLOAD_PROGRESS, {});
}

// ── Mirror + resume download ──

/**
 * Try fetching a URL with resume support (Range header).
 * Returns { resp, resumable } — resumable=true if server supports Range.
 */
async function fetchWithResume(url, onProgress, existingBytes = 0) {
  const headers = {};
  if (existingBytes > 0) {
    headers['Range'] = `bytes=${existingBytes}-`;
  }

  const resp = await fetch(url, { headers });
  const totalBytes = parseInt(resp.headers.get('content-length') || '0', 10);
  const contentRange = resp.headers.get('content-range');
  const acceptsRange = resp.headers.get('accept-ranges') === 'bytes' || !!contentRange;

  if (existingBytes > 0 && resp.status === 206) {
    // Server supports resume — append to existing data
    const reader = resp.body.getReader();
    const chunks = [];
    let received = existingBytes;
    const fullTotal = contentRange ? parseInt(contentRange.split('/')[1], 10) : totalBytes + existingBytes;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (onProgress) onProgress({ downloaded: received, total: fullTotal });
    }

    return { data: chunks, total: fullTotal, resumable: true };
  }

  if (existingBytes > 0 && resp.status === 200) {
    // Server doesn't support resume — restart from beginning
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (onProgress) onProgress({ downloaded: received, total: totalBytes });
    }

    return { data: chunks, total: totalBytes, resumable: false };
  }

  // Fresh download (no resume)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress) onProgress({ downloaded: received, total: totalBytes });
  }

  return { data: chunks, total: totalBytes, resumable: acceptsRange };
}

/**
 * Download a single file with mirror fallback + resume support.
 * Returns ArrayBuffer of the complete file content.
 */
async function downloadFileWithMirrors(urls, progressKey, onProgress) {
  const progress = getDownloadProgress();
  const saved = progress[progressKey] || {};
  const existingBytes = saved.bytes || 0;
  const partialData = saved.chunks || [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const { data, total, resumable } = await fetchWithResume(url, onProgress, existingBytes);

      // Merge partial data with new data
      const allChunks = [...partialData, ...data];

      // Save progress for resume
      setDownloadProgress(progressKey, {
        bytes: allChunks.reduce((s, c) => s + c.length, 0),
        chunks: resumable ? allChunks : data, // only save partial if server supports resume
        url: url,
        total: total,
      });

      return { data: allChunks, total, mirrorIndex: i };
    } catch (err) {
      console.warn(`Mirror ${i} failed (${url}): ${err.message}, trying next...`);
      // Clear partial progress when switching mirrors
      if (i < urls.length - 1) {
        setDownloadProgress(progressKey, null);
      }
    }
  }

  throw new Error(`All mirrors failed for ${progressKey}`);
}

/**
 * Build download URL list: primary baseUrl + mirrors, sorted by speed.
 */
async function buildMirrorUrls(baseUrl, mirrorUrls, filename) {
  const urls = [`${baseUrl}/${filename}`];
  if (mirrorUrls && Array.isArray(mirrorUrls)) {
    for (const mirror of mirrorUrls) {
      urls.push(`${mirror}/${filename}`);
    }
  }
  return sortUrlsBySpeed(urls);
}

/**
 * Test download speed of each URL by requesting a small range.
 * Returns URLs sorted by latency (fastest first).
 */
async function sortUrlsBySpeed(urls) {
  if (urls.length <= 1) return urls;

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const t0 = performance.now();
      try {
        const resp = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        const latency = performance.now() - t0;
        return { url, latency, ok: resp.ok };
      } catch {
        return { url, latency: Infinity, ok: false };
      }
    })
  );

  const sorted = results
    .map(r => r.status === 'fulfilled' ? r.value : { url: '', latency: Infinity, ok: false })
    .filter(r => r.ok)
    .sort((a, b) => a.latency - b.latency);

  if (sorted.length === 0) return urls;
  const fastest = sorted.map(r => r.url);
  const rest = urls.filter(u => !fastest.includes(u));
  return [...fastest, ...rest];
}

// ── Download from manifest source ──

export async function downloadVariant(sourceId, category, variantId, variant, onProgress) {
  const sources = getSources();
  const source = sources.find(s => s.id === sourceId);
  if (!source) throw new Error(`Source ${sourceId} not found`);

  const manifests = getLocal(STORAGE_KEYS.MANIFESTS, []);
  const manifest = manifests.find(m => m.sourceId === sourceId);
  if (!manifest) throw new Error(`Manifest for ${sourceId} not loaded`);

  const baseUrl = manifest.baseUrl || source.url.replace(/\/[^/]+$/, '');
  const mirrorUrls = manifest.mirrors || source.mirrors || [];

  try {
    // If variant has zipFile, download the complete ZIP and import it
    if (variant.zipFile) {
      if (onProgress) onProgress({ file: variant.zipFile, downloaded: 0, total: 1 });

      const progressKey = `${sourceId}/${category}/${variantId}/${variant.zipFile}`;
      const urls = buildMirrorUrls(baseUrl, mirrorUrls, variant.zipFile);

      const { data, total, mirrorIndex } = await downloadFileWithMirrors(
        urls, progressKey,
        (p) => onProgress({ file: variant.zipFile, downloaded: p.downloaded, total: p.total, downloading: true })
      );

      // Merge chunks into blob
      const blob = new Blob(data, { type: 'application/zip' });

      // SHA256 checksum verification
      const expectedHash = (manifest.checksums || {})[variant.zipFile];
      if (expectedHash) {
        if (onProgress) onProgress({ file: variant.zipFile, downloaded: blob.size, total: blob.size, verifying: true });
        const arrayBuf = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuf);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        if (hashHex !== expectedHash) {
          throw new Error(`Checksum mismatch for ${variant.zipFile}: expected ${expectedHash.substring(0, 16)}..., got ${hashHex.substring(0, 16)}...`);
        }
        if (onProgress) onProgress({ file: variant.zipFile, downloaded: blob.size, total: blob.size, verified: true });
        const zipFile = new File([arrayBuf], variant.zipFile, { type: 'application/zip' });
        await importFromZip(zipFile, (info) => {
          if (onProgress) onProgress({ file: info.file, downloaded: info.processed, total: info.total });
        });
      } else {
        // No checksum available — import directly
        const zipFile = new File([blob], variant.zipFile, { type: 'application/zip' });
        await importFromZip(zipFile, (info) => {
          if (onProgress) onProgress({ file: info.file, downloaded: info.processed, total: info.total });
        });
      }

      // Clear download progress on success
      setDownloadProgress(progressKey, null);
      markInstalled(category, variantId, sourceId, variant.files);
      return { success: true, mirrorIndex };
    }

    // Fallback: download individual files
    let downloaded = 0;
    const total = variant.files.length;

    for (const filename of variant.files) {
      if (onProgress) onProgress({ file: filename, downloaded, total });

      const progressKey = `${sourceId}/${category}/${variantId}/${filename}`;
      const urls = buildMirrorUrls(baseUrl, mirrorUrls, `${category}/${variantId}/${filename}`);

      const { data } = await downloadFileWithMirrors(
        urls, progressKey,
        (p) => onProgress({ file: filename, downloaded: p.downloaded, total: p.total })
      );

      // Merge all chunks into single ArrayBuffer
      const totalLen = data.reduce((s, c) => s + c.length, 0);
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of data) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      await writeModelFile(category, variantId, filename, merged.buffer);

      // Clear progress on success
      setDownloadProgress(progressKey, null);
      downloaded++;
      if (onProgress) onProgress({ file: filename, downloaded, total });
    }

    markInstalled(category, variantId, sourceId, variant.files);
    return { success: true };
  } catch (err) {
    // Don't clear progress on failure — allows resume on retry
    throw err;
  }
}

// ── Readiness check ──

export function isReady(manifests) {
  const allVars = getAllVariants(manifests);
  const installed = getInstalledModels();
  for (const cat of MODEL_CATEGORIES) {
    const catInfo = allVars[cat];
    if (!catInfo) continue;
    const required = manifests.some(m => m.categories[cat]?.required);
    if (!required) continue;
    if (!installed[cat] || Object.keys(installed[cat]).length === 0) {
      return false;
    }
  }
  return true;
}

export { STORAGE_KEYS, DEFAULT_SOURCES, MODEL_CATEGORIES, getLocal };
