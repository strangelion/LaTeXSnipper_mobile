/**
 * Share utility — unified interface for text, images, and files.
 * Always tries Capacitor Share FIRST since WebView Web Share API is unreliable.
 */

import { Share as CapacitorShare } from '@capacitor/share';

/**
 * Share text content.
 */
export async function shareText(text, opts = {}) {
  if (!text) return;
  const title = opts.title || 'LaTeXSnipper';
  const dialogTitle = opts.dialogTitle || '分享';

  // 1. Capacitor Share (native Android — most reliable in WebView)
  if (CapacitorShare) {
    try {
      await CapacitorShare.share({ title, text, dialogTitle });
      return;
    } catch (_) {}
  }

  // 2. Web Share API
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; } catch (_) {}
  }

  // 3. Clipboard
  try { await navigator.clipboard.writeText(text); } catch (_) {}
}

/**
 * Share a file (Blob) using Capacitor Share + base64 file attachment.
 * Falls back to Web Share API, then text share.
 */
export async function shareFile(blob, filename, fallbackText = '', opts = {}) {
  const title = opts.title || 'LaTeXSnipper';
  const dialogTitle = opts.dialogTitle || '分享文件';
  const mimeType = blob.type || 'application/octet-stream';

  // 1. Capacitor Share with file attachment
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

  // 2. Web Share API with File
  const file = new File([blob], filename, { type: mimeType });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; } catch (_) {}
  }

  // 3. Fallback text share
  if (navigator.share) {
    try { await navigator.share({ title, text: fallbackText || filename }); return; } catch (_) {}
  }

  if (fallbackText) {
    if (CapacitorShare) {
      try { await CapacitorShare.share({ title, text: fallbackText, dialogTitle }); return; } catch (_) {}
    }
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
