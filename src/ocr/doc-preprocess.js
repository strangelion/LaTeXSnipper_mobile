// Document preprocessing — orientation detection and auto-correction
// Uses PP-LCNet ONNX model exported from PaddleOCR pipeline
//
// PP-LCNet_x1_0_doc_ori: detects 0°/90°/180°/270° rotation
// PP-LCNet_x0_25_textline_ori: detects 0°/180° textline flip (not yet integrated)

import { downloadWithProgress } from './ocr-engine.js';

const PREPROC_BASE = '/models/mathcraft-text-rec';
let docOriSession = null;
let textlineOriSession = null;

// ImageNet normalization (matches PP-LCNet training)
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

// ── Model loading ──

export async function loadDocOriModel(onProgress) {
  const url = PREPROC_BASE + '/pplcnet_doc_ori.onnx';
  const buf = await downloadWithProgress(url, '文档方向检测模型', onProgress);
  docOriSession = await ort.InferenceSession.create(buf, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  console.debug('[doc-ori] Model loaded, input:', docOriSession.inputNames[0]);
}

export async function loadTextlineOriModel(onProgress) {
  const url = PREPROC_BASE + '/pplcnet_textline_ori.onnx';
  const buf = await downloadWithProgress(url, '文本行方向模型', onProgress);
  textlineOriSession = await ort.InferenceSession.create(buf, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  console.debug('[textline-ori] Model loaded');
}

export function isDocOriReady() {
  return docOriSession !== null;
}

export function isTextlineOriReady() {
  return textlineOriSession !== null;
}

// ── Image preprocessing for orientation model ──

function preprocessDocOri(canvas) {
  const w = canvas.width;
  const h = canvas.height;

  // Step 1: Resize short side to 256, maintaining aspect ratio
  let newW, newH;
  if (w < h) {
    newW = 256;
    newH = Math.round(h * (256 / w));
  } else {
    newH = 256;
    newW = Math.round(w * (256 / h));
  }

  const resized = document.createElement('canvas');
  resized.width = newW;
  resized.height = newH;
  const rctx = resized.getContext('2d');
  rctx.drawImage(canvas, 0, 0, newW, newH);

  // Step 2: Center crop to 224×224
  const cropX = Math.floor((newW - 224) / 2);
  const cropY = Math.floor((newH - 224) / 2);

  const cropped = document.createElement('canvas');
  cropped.width = 224;
  cropped.height = 224;
  const cctx = cropped.getContext('2d');
  cctx.drawImage(resized, cropX, cropY, 224, 224, 0, 0, 224, 224);

  // Step 3: Normalize with ImageNet stats (CHW order)
  const pixels = cctx.getImageData(0, 0, 224, 224).data;
  const n = 224 * 224;
  const floatData = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    floatData[i]         = ((pixels[p]     / 255.0) - MEAN[0]) / STD[0];
    floatData[n + i]     = ((pixels[p + 1] / 255.0) - MEAN[1]) / STD[1];
    floatData[2 * n + i] = ((pixels[p + 2] / 255.0) - MEAN[2]) / STD[2];
  }
  return floatData;
}

// Preprocess for textline orientation (80×160)
function preprocessTextlineOri(canvas) {
  const targetW = 160;
  const targetH = 80;

  const resized = document.createElement('canvas');
  resized.width = targetW;
  resized.height = targetH;
  const rctx = resized.getContext('2d');
  rctx.drawImage(canvas, 0, 0, targetW, targetH);

  const pixels = rctx.getImageData(0, 0, targetW, targetH).data;
  const n = targetW * targetH;
  const floatData = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    floatData[i]         = ((pixels[p]     / 255.0) - MEAN[0]) / STD[0];
    floatData[n + i]     = ((pixels[p + 1] / 255.0) - MEAN[1]) / STD[1];
    floatData[2 * n + i] = ((pixels[p + 2] / 255.0) - MEAN[2]) / STD[2];
  }
  return floatData;
}

// ── Softmax ──

function softmax(arr) {
  const max = Math.max(...arr);
  const exp = arr.map(x => Math.exp(x - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(x => x / sum);
}

// ── Orientation detection ──

// Detect document rotation angle: returns { angle: 0|90|180|270, confidence: 0..1 }
export async function detectDocOrientation(img) {
  if (!isDocOriReady()) throw new Error('Doc orientation model not ready');

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const ctx = srcCanvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const data = preprocessDocOri(srcCanvas);
  const inputTensor = new ort.Tensor('float32', data, [1, 3, 224, 224]);
  const t0 = performance.now();
  const results = await docOriSession.run({ [docOriSession.inputNames[0]]: inputTensor });
  const output = results[docOriSession.outputNames[0]]; // [1, 4]
  const probs = softmax(Array.from(output.data.slice(0, 4)));

  const angles = [0, 90, 180, 270];
  let maxIdx = 0;
  for (let i = 1; i < 4; i++) {
    if (probs[i] > probs[maxIdx]) maxIdx = i;
  }

  console.debug(`[doc-ori] angles: ${angles.map((a, i) => `${a}°=${(probs[i]*100).toFixed(1)}%`).join(', ')}, time: ${(performance.now()-t0).toFixed(0)}ms`);

  return { angle: angles[maxIdx], confidence: probs[maxIdx] };
}

// Detect textline orientation (0° or 180°)
export async function detectTextlineOrientation(cropCanvas) {
  if (!isTextlineOriReady()) throw new Error('Textline orientation model not ready');

  const data = preprocessTextlineOri(cropCanvas);
  const inputTensor = new ort.Tensor('float32', data, [1, 3, 80, 160]);
  const results = await textlineOriSession.run({ [textlineOriSession.inputNames[0]]: inputTensor });
  const output = results[textlineOriSession.outputNames[0]]; // [1, 2]
  const probs = softmax(Array.from(output.data.slice(0, 2)));

  const angles = [0, 180];
  const idx = probs[0] >= probs[1] ? 0 : 1;
  return { angle: angles[idx], confidence: probs[idx] };
}

// ── Auto-correction ──

// Auto-rotate image to correct orientation. Returns a new canvas (or same if no rotation needed).
export async function autoCorrectOrientation(img) {
  try {
    const { angle, confidence } = await detectDocOrientation(img);
    if (angle === 0 || confidence < 0.6) {
      // No rotation needed, or confidence too low
      return null; // null = no correction needed
    }

    console.debug(`[doc-ori] Auto-correcting: rotating ${angle}° (conf=${(confidence*100).toFixed(1)}%)`);

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const canvas = document.createElement('canvas');
    if (angle === 90 || angle === 270) {
      canvas.width = h;
      canvas.height = w;
    } else {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    return canvas;
  } catch (e) {
    console.debug('[doc-ori] detect failed:', e.message);
    return null;
  }
}

// EXIF-based orientation detection (lightweight, no model needed)
// Reads JPEG EXIF data for orientation tag (1-8)
export function getExifOrientation(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) { resolve(1); return; }

    const reader = new FileReader();
    reader.onload = function(e) {
      const view = new DataView(e.target.result);
      if (view.getUint16(0, false) !== 0xFFD8) { resolve(1); return; }

      let offset = 2;
      while (offset < view.byteLength) {
        if (view.getUint16(offset, false) !== 0xFFE1) {
          offset += 2 + view.getUint16(offset + 2, false);
          continue;
        }

        // APP1 marker found, look for EXIF
        const exifOffset = offset + 4;
        const exifString = String.fromCharCode(
          view.getUint8(exifOffset),
          view.getUint8(exifOffset + 1),
          view.getUint8(exifOffset + 2),
          view.getUint8(exifOffset + 3)
        );
        if (exifString !== 'Exif') { resolve(1); return; }

        // Walk IFD to find Orientation tag (0x0112)
        let ifdOffset = exifOffset + 6;
        const littleEndian = view.getUint16(exifOffset + 4, false) === 0x4949;
        const entries = view.getUint16(ifdOffset, littleEndian);
        ifdOffset += 2;

        for (let i = 0; i < entries; i++) {
          const tag = view.getUint16(ifdOffset + i * 12, littleEndian);
          if (tag === 0x0112) {
            const orientation = view.getUint16(ifdOffset + i * 12 + 8, littleEndian);
            console.debug('[exif] Orientation:', orientation);
            resolve(orientation);
            return;
          }
        }
        resolve(1);
        return;
      }
      resolve(1);
    };

    // Read first 64KB (EXIF is typically in first few KB)
    const blob = file.slice(0, 65536);
    reader.readAsArrayBuffer(blob);
  });
}

// Map EXIF orientation to rotation degrees
// 1=normal, 3=180°, 6=90°CW, 8=90°CCW
export function exifToDegrees(orientation) {
  switch (orientation) {
    case 3: return 180;
    case 6: return 90;
    case 8: return 270;
    default: return 0;
  }
}

// Auto-correct using EXIF data (fast, no model needed)
export function correctByExif(img, orientation) {
  const degrees = exifToDegrees(orientation);
  if (degrees === 0) return null;

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const canvas = document.createElement('canvas');
  if (degrees === 90 || degrees === 270) {
    canvas.width = h;
    canvas.height = w;
  } else {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  return canvas;
}
