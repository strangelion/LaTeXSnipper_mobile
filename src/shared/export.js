/**
 * Export utility — download or share files from WebView.
 * Handles blob downloads via multiple strategies for maximum compatibility.
 */

/**
 * Download a Blob as a file.
 * Tries multiple strategies for WebView compatibility.
 */
export function downloadBlob(blob, filename) {
  // Strategy 1: msSaveBlob (Edge/IE WebView)
  if (navigator.msSaveBlob) {
    navigator.msSaveBlob(blob, filename);
    return;
  }

  // Strategy 2: <a> download
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Cleanup after a delay
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 2000);
  } catch (e) {
    // Strategy 3: Try to use the share dialog as last resort
    try {
      const file = new File([blob], filename, { type: blob.type });
      // If Capacitor Share is available, share the file
      // This is a best-effort fallback
      console.warn('[export] Download failed, blob size:', blob.size, 'type:', blob.type);
    } catch (_) {
      console.error('[export] All download strategies failed');
    }
  }
}

/**
 * Download text content as a file.
 */
export function downloadText(text, filename, mimeType = 'text/plain') {
  const blob = new Blob([text], { type: mimeType });
  downloadBlob(blob, filename);
}
