/**
 * Self-contained pandoc WASM loader.
 *
 * Bypasses vite-plugin-wasm entirely by:
 * 1. Importing core.js directly (pure JS module, no .wasm import → vite-plugin-wasm ignores it)
 * 2. Fetching pandoc.wasm as a static asset from /public/ known path
 *
 * The WASM binary is copied to public/ by a Vite buildStart plugin,
 * ensuring Capacitor can serve it at runtime via the web root.
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
    // Import core.js from node_modules — pure JS, vite-plugin-wasm won't touch it.
    // Vite resolves its @bjorn3/browser_wasi_shim dependency normally.
    // (No @vite-ignore — let Vite resolve through its module graph)
    const { createPandocInstance } = await import(
      '../../node_modules/pandoc-wasm/src/core.js'
    );

    // Fetch pandoc.wasm from /public/ — it's placed there by the buildStart
    // Vite plugin in vite.config.js, and is relibaly accessible at this path
    // in both Vite dev server and Capacitor production builds.
    const wasmResp = await fetch('/pandoc.wasm');
    if (!wasmResp.ok) {
      throw new Error(`Failed to fetch pandoc.wasm: ${wasmResp.status} ${wasmResp.statusText}`);
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
