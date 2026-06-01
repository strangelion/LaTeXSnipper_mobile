/**
 * Share utility — unified interface for text, images, and files.
 *
 * For text sharing: Capacitor Share → Web Share → Clipboard.
 * For file sharing (PNG/SVG/TXT): uses native Android saveFile bridge
 * to write to Downloads via MediaStore (Android 10+) or legacy storage,
 * then triggers a download fallback if native bridge unavailable.
 */

import { Share as CapacitorShare } from '@capacitor/share';
import Logger from './logger.js';

/**
 * Share text content.
 */
export async function shareText(text, opts = {}) {
  if (!text) return;
  const title = opts.title || 'LaTeXSnipper';
  const dialogTitle = opts.dialogTitle || '分享';

  if (CapacitorShare) {
    try {
      await CapacitorShare.share({ title, text, dialogTitle });
      return;
    } catch (_) {}
  }

  if (navigator.share) {
    try { await navigator.share({ title, text }); return; } catch (_) {}
  }

  try { await navigator.clipboard.writeText(text); } catch (_) {}
}

/**
 * Save a file to Downloads folder using native Android bridge.
 * Falls back to <a download> if native bridge unavailable.
 */
export async function saveFile(blob, filename, opts = {}) {
  Logger.info('SAVE', 'Saving file: ' + filename + ' (' + blob.size + ' bytes)');
  // 1. Native Android bridge (writes to Downloads via MediaStore)
  const native = window.NativeOcr;
  if (native && native.saveFile) {
    try {
      const base64 = await blobToBase64String(blob);
      const result = native.saveFile(base64, filename);
      if (result === 'ok') {
        Logger.info('SAVE', 'Saved successfully via native bridge: ' + filename);
        return;
      }
      Logger.warn('SAVE', 'Native saveFile returned: ' + result);
    } catch (e) {
      Logger.error('SAVE', 'Native saveFile threw', e);
    }
  } else {
    Logger.warn('SAVE', 'Native saveFile not available, fallback to download');
  }

  // 2. Download fallback
  Logger.info('SAVE', 'Falling back to download link for: ' + filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** @deprecated Use saveFile() instead. */
export async function shareFile(blob, filename, fallbackText = '', opts = {}) {
  await saveFile(blob, filename, opts);
}

async function blobToBase64String(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
