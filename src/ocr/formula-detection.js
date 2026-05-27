// Formula detection engine — based on MathCraft formula-det (mfd) model
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

export function isDetReady() { return detSession !== null; }

// Letterbox: pad image to 768x768 (matching desktop implementation)
function preprocessDet(img) {
  const targetSize = 768;
  const canvas = document.createElement('canvas');
  canvas.width = targetSize; canvas.height = targetSize;
  const ctx = canvas.getContext('2d');

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(targetSize / iw, targetSize / ih);
  const newW = Math.round(iw * scale);
  const newH = Math.round(ih * scale);
  const padX = Math.round((targetSize - newW) / 2 - 0.1);
  const padY = Math.round((targetSize - newH) / 2 - 0.1);

  ctx.fillStyle = '#72'; // gray 114
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.drawImage(img, padX, padY, newW, newH);

  const pixels = ctx.getImageData(0, 0, targetSize, targetSize).data;
  const floatData = new Float32Array(3 * targetSize * targetSize);
  const n = targetSize * targetSize;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    floatData[i] = pixels[p] / 255.0;
    floatData[n + i] = pixels[p + 1] / 255.0;
    floatData[2 * n + i] = pixels[p + 2] / 255.0;
  }
  return { data: floatData, scale, padX: padX, padY: padY, origW: iw, origH: ih };
}

// NMS (matching desktop implementation)
function nms(boxes, scores, iouThreshold) {
  if (boxes.length === 0) return [];
  const areas = boxes.map(b => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]));
  const order = scores.map((s, i) => s).map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
  const keep = [];
  while (order.length > 0) {
    const current = order[0];
    keep.push(current);
    if (order.length === 1) break;
    const rest = order.slice(1);
    const xx1 = rest.map(i => Math.max(boxes[current][0], boxes[i][0]));
    const yy1 = rest.map(i => Math.max(boxes[current][1], boxes[i][1]));
    const xx2 = rest.map(i => Math.min(boxes[current][2], boxes[i][2]));
    const yy2 = rest.map(i => Math.min(boxes[current][3], boxes[i][3]));
    const interW = xx2.map((v, i) => Math.max(0, v - xx1[i]));
    const interH = yy2.map((v, i) => Math.max(0, v - yy1[i]));
    const intersection = interW.map((v, i) => v * interH[i]);
    const union = rest.map(i => areas[current] + areas[i] - intersection[rest.indexOf(i)]);
    const iou = intersection.map((v, i) => union[i] > 0 ? v / union[i] : 0);
    order.length = 0;
    rest.forEach((idx, i) => { if (iou[i] <= 0.45) order.push(idx); });
  }
  return keep;
}

// Parse model output → bounding boxes (matching desktop implementation)
function parseDetections(output, origW, origH, scale, padX, padY) {
  // Desktop: preds = np.asarray(output[0]).T  → [8400, 6]
  // Our output is [1, 6, 8400] → transpose to [8400, 6]
  const raw = output.data; // [1, 6, 8400]
  const numAnchors = 8400;
  const channels = 6;

  // Transpose: raw[c * numAnchors + i] → transposed[i * channels + c]
  const preds = new Float32Array(numAnchors * channels);
  for (let i = 0; i < numAnchors; i++) {
    for (let c = 0; c < channels; c++) {
      preds[i * channels + c] = raw[c * numAnchors + i];
    }
  }

  const confThresh = 0.25;
  const boxes = [], scores = [], classIds = [];

  for (let i = 0; i < numAnchors; i++) {
    const classScores = [preds[i * channels + 4], preds[i * channels + 5]];
    const classId = classScores[0] >= classScores[1] ? 0 : 1;
    const score = Math.max(classScores[0], classScores[1]);
    if (score < confThresh) continue;

    const cx = preds[i * channels + 0];
    const cy = preds[i * channels + 1];
    const w = preds[i * channels + 2];
    const h = preds[i * channels + 3];

    const x1 = (cx - w / 2 - padX) / scale;
    const y1 = (cy - h / 2 - padY) / scale;
    const x2 = (cx + w / 2 - padX) / scale;
    const y2 = (cy + h / 2 - padY) / scale;

    boxes.push([Math.max(0, x1), Math.max(0, y1), Math.min(origW, x2), Math.min(origH, y2)]);
    scores.push(score);
    classIds.push(classId);
  }

  return { boxes, scores, classIds };
}

// Detect formula regions
export async function detectFormulas(img) {
  if (!isDetReady()) throw new Error('Detection model not ready');
  const { data, scale, padX, padY, origW, origH } = preprocessDet(img);
  const inputTensor = new ort.Tensor('float32', data, [1, 3, 768, 768]);
  const result = await detSession.run({ [detSession.inputNames[0]]: inputTensor });
  const output = result[detSession.outputNames[0]];

  const { boxes, scores, classIds } = parseDetections(output, origW, origH, scale, padX, padY);
  console.debug('[formula-det] boxes after threshold:', boxes.length);

  // NMS
  const keep = nms(boxes, scores, 0.45);
  console.debug('[formula-det] after NMS:', keep.length, 'boxes');

  const labels = ['embedding', 'isolated'];
  return keep.map(idx => ({
    x: Math.max(0, Math.round(boxes[idx][0])),
    y: Math.max(0, Math.round(boxes[idx][1])),
    w: Math.round(boxes[idx][2] - boxes[idx][0]),
    h: Math.round(boxes[idx][3] - boxes[idx][1]),
    confidence: scores[idx],
    label: classIds[idx] < labels.length ? labels[classIds[idx]] : String(classIds[idx]),
  }));
}

// Crop image region
export function cropRegion(img, box) {
  const canvas = document.createElement('canvas');
  canvas.width = box.w; canvas.height = box.h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return canvas;
}
