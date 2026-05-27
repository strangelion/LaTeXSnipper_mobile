// Text recognition engine — PP-OCRv5 Mobile Rec (CRNN + CTC)
import { downloadWithProgress } from './ocr-engine.js';

const TEXT_REC_BASE = '/models/mathcraft-text-rec';
let textRecSession = null;
let keys = [];

export async function loadTextRecModel(onProgress) {
  console.debug('[text-rec] Starting model load...');
  let modelUrl = TEXT_REC_BASE + '/ppocrv5_official_rec.onnx';
  let keysUrl = TEXT_REC_BASE + '/ppocrv5_keys.txt';

  // Step 1: download
  try {
    console.debug('[text-rec] Step 1: download');
    await downloadWithProgress(modelUrl, '文字识别模型 (PP-OCRv5)', onProgress);
    console.debug('[text-rec] Step 1 done');
  } catch (e) {
    console.debug('[text-rec] Official failed:', e.message);
    modelUrl = TEXT_REC_BASE + '/ppocrv5_mobile_rec.onnx';
    await downloadWithProgress(modelUrl, '文字识别模型', onProgress);
  }

  // Step 2: fetch ArrayBuffer
  console.debug('[text-rec] Step 2: fetch ArrayBuffer');
  try {
    const modelResp = await fetch(modelUrl);
    console.debug('[text-rec] Step 2a: status', modelResp.status);
    const modelBuf = await modelResp.arrayBuffer();
    console.debug('[text-rec] Step 2b: size', modelBuf.byteLength);

    // Step 3: ORT session
    console.debug('[text-rec] Step 3: ORT session');
    textRecSession = await ort.InferenceSession.create(modelBuf, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    console.debug('[text-rec] Step 3 done');
  } catch (e) {
    console.error('[text-rec] Step 2-3 FAILED:', e.message);
    return;
  }

  // Step 4: keys
  try {
    console.debug('[text-rec] Step 4: keys');
    const resp = await fetch(keysUrl);
    const text = await resp.text();
    keys = text.split('\n').filter(l => l.trim());
    console.debug('[text-rec] Step 4 done, keys:', keys.length);
  } catch (e) {
    console.error('[text-rec] Step 4 FAILED:', e.message);
  }

  console.debug('[text-rec] READY');
}

export function isTextRecReady() {
  return textRecSession !== null && keys.length > 0;
}

// Preprocess: match rapidocr ch_ppocr_rec exactly
// Resize to height 48, width = min(ceil(48 * aspect_ratio), 320)
// Pad with zeros (black) to [3, 48, 320]
function preprocessText(img) {
  const targetH = 48;
  const maxW = 320;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const ratio = w / h;
  let targetW = Math.ceil(targetH * ratio);
  if (targetW > maxW) targetW = maxW;
  if (targetW < 4) targetW = 4;

  const canvas = document.createElement('canvas');
  canvas.width = maxW; canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  // Black background (matches rapidocr np.zeros padding)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, maxW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const pixels = ctx.getImageData(0, 0, maxW, targetH).data;
  const floatData = new Float32Array(3 * targetH * maxW);
  const n = maxW * targetH;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    floatData[i] = (pixels[p] / 255.0 - 0.5) / 0.5;
    floatData[n + i] = (pixels[p + 1] / 255.0 - 0.5) / 0.5;
    floatData[2 * n + i] = (pixels[p + 2] / 255.0 - 0.5) / 0.5;
  }
  return { data: floatData, width: maxW };
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
  return text.replace(/\r/g, '').replace(/\n/g, '').trim();
}

export async function recognizeText(img) {
  if (!isTextRecReady()) throw new Error('Text rec model not ready');
  const { data, width } = preprocessText(img);
  const inputTensor = new ort.Tensor('float32', data, [1, 3, 48, 320]);
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
