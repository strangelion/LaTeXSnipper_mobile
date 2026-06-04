// Shim for wasi_snapshot_preview1 — re-exports the WASI import
// from @bjorn3/browser_wasi_shim. This allows pandoc-wasm's WASM
// binary to resolve its wasi_snapshot_preview1 import in browser/WebView.
import { WASI } from '@bjorn3/browser_wasi_shim';

// WASI.wasiImport contains all the wasi_snapshot_preview1 functions
// (fd_write, fd_read, proc_exit, etc.) needed by pandoc's WASM module.
const wasi = new WASI([], [], []);
export default wasi.wasiImport;
