// Text recognition engine — PP-OCRv5 Mobile Rec (CRNN + CTC)
import { downloadWithProgress } from './ocr-engine.js';

const TEXT_REC_BASE = '/models/mathcraft-text-rec';
const TARGET_HEIGHT = 48; // PP-OCRv5 expects 48px height
let textRecSession = null;
let keys = [];

export async function loadTextRecModel(onProgress) {
  const buf = await downloadWithProgress(TEXT_REC_BASE + '/ppocrv5_mobile_rec.onnx', '文本识别模型', onProgress);
  textRecSession = await ort.InferenceSession.create(buf, {
    executionProviders: ['webgpu', 'wasm'],
    graphOptimizationLevel: 'all',
  });
  // Load character keys
  const resp = await fetch(TEXT_REC_BASE + '/ppocrv5_keys.txt');
  const text = await resp.text();
  keys = text.split('\n').filter(l => l.trim());
}

export function isTextRecReady() {
  return textRecSession !== null && keys.length > 0;
}

// Preprocess: resize to 48px height (PP-OCRv5 expects 48), keep aspect ratio, normalize
function preprocessText(img) {
  const targetH = 48;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const ratio = targetH / h;
  const targetW = Math.max(8, Math.round(w * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetW; canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const pixels = ctx.getImageData(0, 0, targetW, targetH).data;
  const floatData = new Float32Array(3 * targetH * targetW);
  const n = targetW * targetH;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    floatData[i] = (pixels[p] / 255.0 - 0.5) / 0.5;
    floatData[n + i] = (pixels[p + 1] / 255.0 - 0.5) / 0.5;
    floatData[2 * n + i] = (pixels[p + 2] / 255.0 - 0.5) / 0.5;
  }
  return { data: floatData, width: targetW };
}

// CTC greedy decode
function ctcDecode(logits, keyList) {
  let text = '';
  let prev = -1;
  const seqLen = logits.dims[1];
  const vocabSize = logits.dims[2];
  for (let t = 0; t < seqLen; t++) {
    const offset = t * vocabSize;
    let maxIdx = 0, maxVal = logits.data[offset];
    for (let i = 1; i < vocabSize; i++) {
      if (logits.data[offset + i] > maxVal) { maxVal = logits.data[offset + i]; maxIdx = i; }
    }
    if (maxIdx !== prev && maxIdx > 0 && maxIdx < keyList.length) {
      text += keyList[maxIdx];
    }
    prev = maxIdx;
  }
  return text;
}

export async function recognizeText(img) {
  if (!isTextRecReady()) throw new Error('Text rec model not ready');
  const { data, width } = preprocessText(img);
  const inputTensor = new ort.Tensor('float32', data, [1, 3, TARGET_HEIGHT, width]);
  const t0 = performance.now();
  const results = await textRecSession.run({ [textRecSession.inputNames[0]]: inputTensor });
  const output = results[textRecSession.outputNames[0]];
  console.debug('[text-rec] shape:', output.dims, 'time:', (performance.now()-t0).toFixed(0)+'ms', 'keys:', keys.length);
  // Show first 10 non-zero values for debugging
  const nonZero = [];
  for (let i = 0; i < output.dims[1] * output.dims[2]; i++) {
    if (output.data[i] > 0.01) nonZero.push({ idx: i, val: output.data[i].toFixed(4) });
  }
  console.debug('[text-rec] non-zero values:', nonZero.length, nonZero.slice(0, 20));
  // Check what the model actually decodes
  const decoded = ctcDecode(output, keys);
  console.debug('[text-rec] decoded:', JSON.stringify(decoded), 'len:', decoded.length);
  // Also check: what are the argmax tokens at each step?
  const seqLen = output.dims[1];
  const vocabSize = output.dims[2];
  const tokens = [];
  for (let t = 0; t < seqLen; t++) {
    const offset = t * vocabSize;
    let maxIdx = 0, maxVal = output.data[offset];
    for (let i = 1; i < vocabSize; i++) {
      if (output.data[offset + i] > maxVal) { maxVal = output.data[offset + i]; maxIdx = i; }
    }
    tokens.push(maxIdx);
  }
  console.debug('[text-rec] argmax tokens:', tokens, 'keyList length:', keys.length);
  return ctcDecode(output, keys);
}
