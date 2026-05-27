// Text detection engine — PP-OCRv5 DB model (probability map → bounding boxes)
import { downloadWithProgress } from './ocr-engine.js';

const DET_BASE = '/models/mathcraft-text-det';
let detSession = null;

export async function loadTextDetModel(onProgress) {
  const buf = await downloadWithProgress(DET_BASE + '/ppocrv5_mobile_det.onnx', '文字检测模型', onProgress);
  detSession = await ort.InferenceSession.create(buf, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
}

export function isTextDetReady() { return detSession !== null; }

// Preprocess: resize to 640 height, keep aspect ratio, normalize to [-1,1]
function preprocessDetText(img) {
  const targetH = 640;
  const MAX_W = 960;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const ratio = targetH / h;
  const targetW = Math.max(32, Math.round(w * ratio));

  const finalH = targetH;
  const finalW = Math.min(targetW, MAX_W);

  const canvas = document.createElement('canvas');
  canvas.width = finalW; canvas.height = finalH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, finalW, finalH);
  // Scale to fill height=640, center-crop if wider than 960
  const scale = Math.max(finalW / w, finalH / h);
  const sw = Math.round(w * scale);
  const sh = Math.round(h * scale);
  ctx.drawImage(img, (finalW - sw) / 2, (finalH - sh) / 2, sw, sh);

  const pixels = ctx.getImageData(0, 0, finalW, finalH).data;
  const floatData = new Float32Array(3 * finalH * finalW);
  const n = finalW * finalH;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    floatData[i] = (pixels[p] / 255.0 - 0.5) / 0.5;
    floatData[n + i] = (pixels[p + 1] / 255.0 - 0.5) / 0.5;
    floatData[2 * n + i] = (pixels[p + 2] / 255.0 - 0.5) / 0.5;
  }
  return { data: floatData, width: finalW, scaleX: finalW / w, scaleY: finalH / h };
}

// Simple contour-based text detection from DB probability map
function detectTextBoxes(probMap, thresh, origW, origH, scaleX, scaleY) {
  const w = probMap.dims[2]; // e.g. 640
  const h = probMap.dims[1]; // e.g. 640
  const data = probMap.data;

  // Binary threshold
  const binary = new Uint8Array(h * w);
  for (let i = 0; i < h * w; i++) {
    binary[i] = data[i] > thresh ? 1 : 0;
  }

  // Find horizontal runs of foreground, merge into text lines
  const boxes = [];
  const visited = new Uint8Array(h * w);

  for (let y = 0; y < h; y++) {
    let runStart = -1;
    for (let x = 0; x < w; x++) {
      if (binary[y * w + x] && runStart < 0) runStart = x;
      if (!binary[y * w + x] && runStart >= 0) {
        if (x - runStart > 3) { // minimum width
          boxes.push({ x1: runStart, y1: y, x2: x, y2: y });
        }
        runStart = -1;
      }
    }
    if (runStart >= 0) boxes.push({ x1: runStart, y1: y, x2: w, y2: y });
  }

  // Merge overlapping horizontal runs into larger boxes
  const merged = [];
  for (const box of boxes) {
    let found = false;
    for (const m of merged) {
      // Merge if vertically overlapping
      if (box.y1 <= m.y2 + 8 && box.y2 >= m.y1 - 8 && box.x1 <= m.x2 + 20 && box.x2 >= m.x1 - 20) {
        m.x1 = Math.min(m.x1, box.x1);
        m.y1 = Math.min(m.y1, box.y1);
        m.x2 = Math.max(m.x2, box.x2);
        m.y2 = Math.max(m.y2, box.y2);
        found = true;
        break;
      }
    }
    if (!found) merged.push({ ...box });
  }

  // Convert to original coordinates and add padding
  const pad = 4;
  const result = merged.map(m => ({
    x: Math.max(0, Math.round(m.x1 / scaleX) - pad),
    y: Math.max(0, Math.round(m.y1 / scaleY) - pad),
    w: Math.round((m.x2 - m.x1) / scaleX) + pad * 2,
    h: Math.max(16, Math.round((m.y2 - m.y1) / scaleY) + pad * 2),
  })).filter(b => b.w > 8 && b.h > 4);

  // Sort by reading order (top to bottom)
  result.sort((a, b) => {
    const rowDiff = a.y - b.y;
    if (Math.abs(rowDiff) < a.h * 0.5) return a.x - b.x;
    return rowDiff;
  });

  return result;
}

// Full text detection pipeline
export async function detectText(img) {
  if (!isTextDetReady()) throw new Error('Text det model not ready');
  const { data, width, scaleX, scaleY } = preprocessDetText(img);
  console.debug('[text-det] input shape:', [1, 3, finalH, finalW]);
  const inputTensor = new ort.Tensor('float32', data, [1, 3, finalH, finalW]);
  const t0 = performance.now();
  let results;
  try {
    results = await detSession.run({ [detSession.inputNames[0]]: inputTensor });
  } catch (e) {
    console.error('[text-det] inference failed:', e.message);
    throw new Error('文字检测推理失败: ' + e.message);
  }
  console.debug('[text-det] inference done:', (performance.now() - t0).toFixed(0) + 'ms');
  const probMap = results[detSession.outputNames[0]];
  console.debug('[text-det] output shape:', probMap.dims);
  const boxes = detectTextBoxes(probMap, 0.3, img.naturalWidth || img.width, img.naturalHeight || img.height, scaleX, scaleY);
  return boxes;
}

export function cropTextRegion(img, box) {
  const canvas = document.createElement('canvas');
  canvas.width = box.w; canvas.height = box.h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return canvas;
}
