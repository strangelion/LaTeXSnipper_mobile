// Shim for wasi_snapshot_preview1 — provides a properly initialized
// WASI import object. Needed by vite-plugin-wasm which wraps WASM
// imports with auto-instantiation.
//
// browser_wasi_shim's WASI constructor requires args, env, fds.
// We provide minimal values; pandoc-wasm's core.js creates its own
// WASI instance for the real work, but this shim satisfies Vite's
// bundler-level resolution of the WASM's wasi_snapshot_preview1 import.

import {
  WASI,
  ConsoleStdout,
  File,
  OpenFile,
  PreopenDirectory,
} from '@bjorn3/browser_wasi_shim';

const fds = [
  new OpenFile(new File(new Uint8Array(), { readonly: true })),
  ConsoleStdout.lineBuffered(() => {}),
  ConsoleStdout.lineBuffered(() => {}),
  new PreopenDirectory('/', new Map()),
];

const wasi = new WASI(
  ['pandoc.wasm', '+RTS', '-H64m', '-RTS'],
  [],
  fds,
  { debug: false },
);

export default wasi;
