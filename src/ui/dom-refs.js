// Shared DOM refs and file handler state for UI submodules
export const els = {};

let _fileInputHandler = null;
export function getFileInputHandler() { return _fileInputHandler; }
export function setFileInputHandler(cb) { _fileInputHandler = cb; }
