// Text recognition engine — Tesseract.js (pure JS, no ONNX needed)
let worker = null;
let ready = false;

export async function loadTesseract(lang = 'chi_sim+eng') {
  try {
    const { createWorker } = await import('tesseract.js');
    worker = await createWorker(lang, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.debug(`[tesseract] ${Math.round(m.progress * 100)}%`);
        }
      },
    });
    ready = true;
    console.debug('[tesseract] Ready, language:', lang);
  } catch (e) {
    console.error('[tesseract] Load failed:', e.message);
  }
}

export function isTesseractReady() { return ready; }

export async function recognizeText(img) {
  if (!ready || !worker) throw new Error('Tesseract not ready');

  const canvas = document.createElement('canvas');
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const result = await worker.recognize(canvas);
  const rawText = result.data.text.trim();
  // Compact output: remove extra spaces, keep only meaningful spaces
  const compactText = rawText
    .replace(/\s+/g, ' ') // Collapse multiple spaces to single
    .replace(/\s([,，。！？;；:：、])/g, '$1') // Remove space before punctuation
    .replace(/([,，。！？;；:：、])\s+/g, '$1') // Remove space after punctuation
    .replace(/(\p{scx=Han})\s+(\p{scx=Han})/gu, '$1$2') // Remove space between CJK chars
    .replace(/(\p{scx=Han})\s+([,，。！？;；:：、])/gu, '$1$2') // No space CJK->punct
    .replace(/([a-zA-Z0-9])\s+(\p{scx=Han})/gu, '$1 $2') // Keep space ASCII->CJK
    .replace(/(\p{scx=Han})\s+([a-zA-Z0-9])/gu, '$1 $2') // Keep space CJK->ASCII
    .trim();
  if (compactText) {
    return '\\text{' + compactText.replace(/[\\{}&#%_$~^]/g, '\\$&') + '}';
  }
  return compactText;
}
