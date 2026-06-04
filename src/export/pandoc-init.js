/**
 * Self-contained pandoc WASM loader.
 *
 * Core trick: import pandoc-wasm's core.js directly from node_modules
 * (it's a pure ES module with no .wasm imports — vite-plugin-wasm won't
 * touch it) and fetch pandoc.wasm as a static asset via fetch().
 *
 * This completely sidesteps the WASI import resolution issue that
 * broke the original pandoc-wasm integration under vite-plugin-wasm.
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
    // Import core.js from node_modules — this module is pure JS (no .wasm
    // import) so vite-plugin-wasm doesn't transform it. It exports
    // createPandocInstance(wasmBinary) which handles WASI init internally.
    const { createPandocInstance } = await import(
      /* @vite-ignore */
      new URL('../../node_modules/pandoc-wasm/src/core.js', import.meta.url).href
    );

    // Fetch pandoc.wasm as a static asset (served from /vendor/pandoc/ in
    // dev mode, or from the asset build in production). This avoids
    // vite-plugin-wasm's transform on the 56MB WASM binary.
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
