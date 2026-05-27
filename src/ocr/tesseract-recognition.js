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
  const text = result.data.text.trim();
  // Wrap text in LaTeX format: \text{...}
  if (text) {
    return '\\text{' + text.replace(/[{}]/g, '\\$&') + '}';
  }
  return text;
}
