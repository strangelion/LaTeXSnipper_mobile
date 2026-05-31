/**
 * Share utility — tries native Android share, falls back to Web Share API, then clipboard.
 */

// Static import so Vite bundles @capacitor/share at build time
import { Share as CapacitorShare } from '@capacitor/share';

/**
 * Share text content via Android native share dialog (or Web Share API, or clipboard fallback).
 */
export async function shareText(text, opts = {}) {
  if (!text) return;

  const title = opts.title || 'LaTeXSnipper';
  const dialogTitle = opts.dialogTitle || '分享';

  // 1. Native Capacitor Share (Android)
  if (CapacitorShare) {
    try {
      await CapacitorShare.share({ title, text, dialogTitle });
      return;
    } catch (_) { /* user cancelled */ }
  }

  // 2. Web Share API (browser fallback)
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (_) { /* user cancelled */ }
  }

  // 3. Clipboard fallback
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    console.warn('[share] No share method available');
  }
}
