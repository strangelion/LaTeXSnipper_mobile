/**
 * Share utility — unified interface for text, images, and files.
 *
 * Strategy chain (ordered by priority):
 *   1. Web Share API with files (picks native Android share sheet)
 *   2. @capacitor/share as fallback
 *   3. Clipboard for text-only
 */

import { Share as CapacitorShare } from '@capacitor/share';

/**
 * Share text content.
 */
export async function shareText(text, opts = {}) {
  if (!text) return;
  const title = opts.title || 'LaTeXSnipper';
  const dialogTitle = opts.dialogTitle || '分享';

  // Try Web Share API first (best integration on Android)
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (_) {}
  }

  // Capacitor Share fallback
  if (CapacitorShare) {
    try {
      await CapacitorShare.share({ title, text, dialogTitle });
      return;
    } catch (_) {}
  }

  // Clipboard fallback
  try { await navigator.clipboard.writeText(text); } catch (_) {}
}

/**
 * Share a file (Blob) as image/zip/etc.
 * Uses Web Share API with files when available.
 * Falls back to Capacitor Share.
 * Final fallback: share text instead.
 *
 * @param {Blob} blob - The file blob to share
 * @param {string} filename - Suggested filename with extension (e.g. 'formula.png', 'diagnostic.zip')
 * @param {string} [fallbackText] - Text to share if file sharing fails
 * @param {object} [opts] - Options
 */
export async function shareFile(blob, filename, fallbackText = '', opts = {}) {
  const title = opts.title || 'LaTeXSnipper';
  const dialogTitle = opts.dialogTitle || '分享文件';

  const mimeType = blob.type || 'application/octet-stream';
  const file = new File([blob], filename, { type: mimeType });

  // 1. Web Share API with files
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (_) {}
  }

  // 2. Try web share with just text as precursor (some browsers need this)
  if (navigator.share) {
    try {
      await navigator.share({ title, text: fallbackText || filename });
      return;
    } catch (_) {}
  }

  // 3. Capacitor Share
  if (CapacitorShare) {
    try {
      const base64 = await blobToBase64String(blob);
      await CapacitorShare.share({
        title,
        text: fallbackText || filename,
        dialogTitle,
        files: [{ name: filename, format: mimeType, data: base64 }],
      });
      return;
    } catch (_) {}
  }

  // 4. Fallback: share text
  if (fallbackText) {
    await shareText(fallbackText, opts);
  }
}

async function blobToBase64String(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
