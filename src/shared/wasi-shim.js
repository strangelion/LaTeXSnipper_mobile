// Shim for wasi_snapshot_preview1 — provides the import object that
// pandoc-wasm's WASM binary needs at instantiation time.
//
// pandoc-wasm's core.js creates its own WASI instance with proper FDs.
// This shim just needs to provide *something* callable so that
// WebAssembly.instantiate() can resolve the import names.
//
// browser_wasi_shim's WASI constructor requires at least args, env, fds.

import { WASI, ConsoleStdout, File, OpenFile, PreopenDirectory } from '@bjorn3/browser_wasi_shim';

const fds = [
  new OpenFile(new File(new Uint8Array(), { readonly: true })),
  ConsoleStdout.lineBuffered(() => {}),
  ConsoleStdout.lineBuffered(() => {}),
  new PreopenDirectory('/', new Map()),
];

const wasi = new WASI(['pandoc.wasm', '+RTS', '-H64m', '-RTS'], [], fds, { debug: false });
export default wasi.wasiImport;
