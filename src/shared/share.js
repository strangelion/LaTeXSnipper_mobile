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
 */
export async function shareFile(blob, filename, fallbackText = '', opts = {}) {
  const title = opts.title || 'LaTeXSnipper';
  const dialogTitle = opts.dialogTitle || '分享文件';
  const mimeType = blob.type || 'application/octet-stream';

  // 1. Capacitor Share — try direct file sharing via base64
  // IMPORTANT: Do NOT pass `text` alongside `files`. On some Android versions
  // (especially via Capacitor bridge), the share sheet shows only `text` and
  // ignores the file attachment entirely. We pass a minimal description instead.
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
      // Capacitor Share does not support base64 file sharing on all
      // Android versions. Continue to Web Share API.
    }
  }

  // 2. Web Share API with File object
  try {
    const file = new File([blob], filename, { type: mimeType });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
  } catch (_) {}

  // 3. Fallback: download the file.
  // We do NOT fall back to text sharing — sharing a file and getting
  // LaTeX text in the share sheet is a confusing user experience.
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
