/**
 * WASI shim for pandoc.wasm — provides a full wasi_snapshot_preview1
 * namespace as individual named exports.
 *
 * Vite-plugin-wasm transforms pandoc.wasm to something like:
 *   import * as __vite__wasmImport_0 from "wasi_snapshot_preview1"
 *
 * Vite resolve alias maps "wasi_snapshot_preview1" → this file.
 * This file re-exports each WASI function individually so the
 * generated import namespace has all required bindings.
 */

import {
  ConsoleStdout,
  File,
  OpenFile,
  PreopenDirectory,
  WASI,
} from '@bjorn3/browser_wasi_shim';

const _args = ['pandoc.wasm', '+RTS', '-H64m', '-RTS'];
const _fds = [
  new OpenFile(new File(new Uint8Array(), { readonly: true })),
  ConsoleStdout.lineBuffered(() => {}),
  ConsoleStdout.lineBuffered(() => {}),
  new PreopenDirectory('/', new Map()),
];
const _wasi = new WASI(_args, [], _fds, { debug: false });
const _wi = _wasi.wasiImport;

function _w(fn) {
  return function (...a) { return fn.call(_wi, ...a); };
}

export default _wi;
export const args_get             = _w(_wi.args_get);
export const args_sizes_get      = _w(_wi.args_sizes_get);
export const environ_get         = _w(_wi.environ_get);
export const environ_sizes_get   = _w(_wi.environ_sizes_get);
export const clock_res_get       = _w(_wi.clock_res_get);
export const clock_time_get      = _w(_wi.clock_time_get);
export const fd_close            = _w(_wi.fd_close);
export const fd_fdstat_get       = _w(_wi.fd_fdstat_get);
export const fd_fdstat_set_flags = _w(_wi.fd_fdstat_set_flags);
export const fd_filestat_get     = _w(_wi.fd_filestat_get);
export const fd_filestat_set_size = _w(_wi.fd_filestat_set_size);
export const fd_prestat_get      = _w(_wi.fd_prestat_get);
export const fd_prestat_dir_name = _w(_wi.fd_prestat_dir_name);
export const fd_read             = _w(_wi.fd_read);
export const fd_readdir          = _w(_wi.fd_readdir);
export const fd_renumber         = _w(_wi.fd_renumber);
export const fd_seek             = _w(_wi.fd_seek);
export const fd_write            = _w(_wi.fd_write);
export const path_create_directory  = _w(_wi.path_create_directory);
export const path_filestat_get      = _w(_wi.path_filestat_get);
export const path_filestat_set_times = _w(_wi.path_filestat_set_times);
export const path_open           = _w(_wi.path_open);
export const path_readlink       = _w(_wi.path_readlink);
export const path_remove_directory = _w(_wi.path_remove_directory);
export const path_rename         = _w(_wi.path_rename);
export const path_symlink        = _w(_wi.path_symlink);
export const path_unlink_file    = _w(_wi.path_unlink_file);
export const poll_oneoff         = _w(_wi.poll_oneoff);
export const proc_exit           = _w(_wi.proc_exit);
export const random_get          = _w(_wi.random_get);
