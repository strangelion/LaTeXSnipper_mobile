// Formula detection engine — YOLO-style math formula detector
import { downloadWithProgress } from './ocr-engine.js';

const DET_BASE = '/models/mathcraft-formula-det';
let detSession = null;

export async function loadFormulaDetModel(onProgress) {
  const buf = await downloadWithProgress(DET_BASE + '/mathcraft-mfd.onnx', '公式检测模型', onProgress);
  detSession = await ort.InferenceSession.create(buf, {
    executionProviders: ['webgpu', 'wasm'],
    graphOptimizationLevel: 'all',
  });
}

export function isDetReady() {
  return detSession !== null;
}

// Preprocess image for detection (640x640 letterbox)
function preprocessDet(img) {
  const targetSize = 640;
  const canvas = document.createElement('canvas');
  canvas.width = targetSize; canvas.height = targetSize;
  const ctx = canvas.getContext('2d');

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(targetSize / iw, targetSize / ih);
  const dw = Math.round(iw * scale);
  const dh = Math.round(ih * scale);
  const dx = (targetSize - dw) >> 1;
  const dy = (targetSize - dh) >> 1;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.drawImage(img, dx, dy, dw, dh);

  const pixels = ctx.getImageData(0, 0, targetSize, targetSize).data;
  const floatData = new Float32Array(3 * targetSize * targetSize);
  const n = targetSize * targetSize;
  const scl = 2.0 / 255.0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    floatData[i] = pixels[p] * scl - 1.0;
    floatData[n + i] = pixels[p + 1] * scl - 1.0;
    floatData[2 * n + i] = pixels[p + 2] * scl - 1.0;
  }
  return { data: floatData, scale, padX: dx, padY: dy, origW: iw, origH: ih };
}

// Parse YOLO output → bounding boxes in original image coordinates
function parseDetections(output, origW, origH, scale, padX, padY, confThresh = 0.6) {
  const data = output.data; // [1, 6, 8400]
  const numAnchors = 8400;
  const boxes = [];

  for (let i = 0; i < numAnchors; i++) {
    // Channels: [cx, cy, w, h, obj1, obj2] — apply sigmoid to confidence
    const obj1 = 1 / (1 + Math.exp(-data[4 * numAnchors + i]));
    const obj2 = 1 / (1 + Math.exp(-data[5 * numAnchors + i]));
    const conf = Math.max(obj1, obj2);
    if (conf < confThresh) continue;

    const cx = data[0 * numAnchors + i];
    const cy = data[1 * numAnchors + i];
    const w = data[2 * numAnchors + i];
    const h = data[3 * numAnchors + i];

    // Denormalize from 640x640 letterbox space
    const x1 = ((cx - w / 2) - padX) / scale;
    const y1 = ((cy - h / 2) - padY) / scale;
    const x2 = ((cx + w / 2) - padX) / scale;
    const y2 = ((cy + h / 2) - padY) / scale;

    const bw = Math.min(origW, x2) - Math.max(0, x1);
    const bh = Math.min(origH, y2) - Math.max(0, y1);
    // Skip tiny boxes
    if (bw < 10 || bh < 10) continue;

    boxes.push({
      x: Math.max(0, x1), y: Math.max(0, y1),
      w: bw, h: bh,
      confidence: conf,
    });
  }
  return boxes;
}

// Detect formula regions in an image
export async function detectFormulas(img) {
  if (!isDetReady()) throw new Error('Detection model not ready');
  const { data, scale, padX, padY, origW, origH } = preprocessDet(img);
  console.debug('[formula-det] input shape:', [1, 3, 640, 640], 'origSize:', origW, 'x', origH);
  const inputTensor = new ort.Tensor('float32', data, [1, 3, 640, 640]);
  const result = await detSession.run({ [detSession.inputNames[0]]: inputTensor });
  const output = result[detSession.outputNames[0]];
  console.debug('[formula-det] output shape:', output.dims);

  // Check probability distribution
  let max = 0, min = 1, sum = 0, above05 = 0;
  for (let i = 0; i < output.data.length; i++) {
    const v = output.data[i];
    if (v > max) max = v;
    if (v < min) min = v;
    sum += v;
    if (v > 0.5) above05++;
  }
  console.debug('[formula-det] prob stats:', { min: min.toFixed(4), max: max.toFixed(4), avg: (sum / output.data.length).toFixed(4), above05 });

  const boxes = parseDetections(output, origW, origH, scale, padX, padY);
  console.debug('[formula-det] raw boxes:', boxes.length);

  // Sort by reading order (top to bottom, left to right)
  boxes.sort((a, b) => {
    const rowDiff = a.y - b.y;
    if (Math.abs(rowDiff) < a.h * 0.5) return a.x - b.x;
    return rowDiff;
  });

  // NMS: remove overlapping boxes
  const nms = [];
  for (const box of boxes) {
    let keep = true;
    for (const kept of nms) {
      const ix = Math.max(0, Math.min(box.x + box.w, kept.x + kept.w) - Math.max(box.x, kept.x));
      const iy = Math.max(0, Math.min(box.y + box.h, kept.y + kept.h) - Math.max(box.y, kept.y));
      const iou = (ix * iy) / Math.min(box.w * box.h, kept.w * kept.h);
      if (iou > 0.5) { keep = false; break; }
    }
    if (keep) nms.push(box);
  }
  console.debug('[formula-det] after NMS:', nms.length, 'boxes', nms.slice(0, 5));
  return nms;
}

// Crop image region to a canvas
export function cropRegion(img, box) {
  const canvas = document.createElement('canvas');
  canvas.width = box.w; canvas.height = box.h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return canvas;
}
