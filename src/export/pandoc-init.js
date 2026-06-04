/**
 * Self-contained pandoc WASM loader.
 *
 * Loads pandoc-wasm's core logic (from Vite-bundled node_modules) and
 * fetches pandoc.wasm as a static asset via fetch(), completely bypassing
 * vite-plugin-wasm's transform on the 56MB WASM binary.
 *
 * Note: This file does NOT use @vite-ignore on the core.js import — Vite
 * must resolve core.js and its @bjorn3/browser_wasi_shim dependency.
 * The WASM binary is loaded at runtime via fetch(), not via import.
 *
 * @returns {{ convert, query }} pandoc API
 */

let _instance = null;
let _loading = false;
let _waiters = [];

export async function initPandocWasm() {
  if (_instance) return _instance;
  if (_loading) {
    return new Promise(resolve => { _waiters.push(resolve); });
  }
  _loading = true;

  try {
    // Import core.js from node_modules — Vite resolves this and its
    // @bjorn3/browser_wasi_shim dependency normally. No @vite-ignore
    // here (that would break the dependency chain at runtime).
    const { createPandocInstance } = await import(
      '../../node_modules/pandoc-wasm/src/core.js'
    );

    // Fetch pandoc.wasm as a static asset from /vendor/pandoc/ directory.
    // The copy-pandoc-wasm build plugin places it there.
    const wasmResp = await fetch('/vendor/pandoc/pandoc.wasm');
    if (!wasmResp.ok) {
      throw new Error(`Failed to fetch pandoc.wasm: ${wasmResp.status}`);
    }
    const wasmBinary = await wasmResp.arrayBuffer();

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
