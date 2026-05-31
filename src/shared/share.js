/**
 * Share utility — unified interface for text, images, and files.
 * Always tries Capacitor Share FIRST since WebView Web Share API is unreliable.
 *
 * For file sharing (PNG/SVG/ZIP), if all native share methods fail,
 * we trigger a download instead of falling back to text — users expect
 * a file, not LaTeX content in the share sheet.
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
 * Falls back to Web Share API, then triggers a download.
 * NEVER falls back to text share — users expect a file, not text.
 *
 * IMPORTANT: In WebView (Capacitor Android), the system "no apps can perform
 * this action" dialog appears when Capacitor Share throws AND Web Share API
 * throws with a File object. In that case, we silently fall through to a
 * direct file download — no system app picker needed.
 */
export async function shareFile(blob, filename, fallbackText = '', opts = {}) {
  const title = opts.title || 'LaTeXSnipper';
  const dialogTitle = opts.dialogTitle || '分享文件';
  const mimeType = blob.type || 'application/octet-stream';

  // 1. Capacitor Share — try base64 file sharing
  if (CapacitorShare) {
    try {
      const base64 = await blobToBase64String(blob);
      await CapacitorShare.share({
        title,
        dialogTitle,
        files: [{ name: filename, format: mimeType, data: base64 }],
      });
      return;
    } catch (_) {
      // Capacitor Share base64 failed. Continue to download fallback directly
      // instead of trying Web Share API with a File — that would trigger
      // "no apps can perform this action" on older Android versions.
    }
  }

  // 2. Direct download — no system share sheet needed.
  // This is the most reliable path on Android WebView and avoids the
  // "no apps can perform this action" error.
  downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function blobToBase64String(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
