// Text recognition engine — PP-OCRv5 Mobile Rec (CRNN + CTC)
// Supports Chinese (PP-OCRv5) and English (PP-OCRv3) with auto language detection
import { downloadWithProgress } from './ocr-engine.js';
import { simplifyText } from './simplify.js';

const TEXT_REC_BASE = '/models/mathcraft-text-rec';
let textRecSession = null;
let keys = [];
let enRecSession = null;
let enKeys = [];

export async function loadTextRecModel(onProgress) {
  console.debug('[text-rec] Starting CN model load...');
  const modelUrl = TEXT_REC_BASE + '/ppocrv5_mobile_rec.onnx';
  const keysUrl = TEXT_REC_BASE + '/ppocrv5_keys.txt';

  console.debug('[text-rec] Step 1: download');
  await downloadWithProgress(modelUrl, '文字识别模型 (PP-OCRv5)', onProgress);

  try {
    console.debug('[text-rec] Step 2: fetch ArrayBuffer');
    const modelResp = await fetch(modelUrl);
    const modelBuf = await modelResp.arrayBuffer();
    console.debug('[text-rec] Step 2b: size', modelBuf.byteLength);

    console.debug('[text-rec] Step 3: ORT session');
    textRecSession = await ort.InferenceSession.create(modelBuf, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    console.debug('[text-rec] Step 3 done');
  } catch (e) {
    console.error('[text-rec] CN model FAILED:', e.message);
    return;
  }

  try {
    console.debug('[text-rec] Step 4: keys');
    const resp = await fetch(keysUrl);
    const text = await resp.text();
    const lines = text.replace(/\r/g, '').split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    keys = lines;
    console.debug('[text-rec] CN keys:', keys.length, 'first:', JSON.stringify(keys[0]));
  } catch (e) {
    console.error('[text-rec] CN keys FAILED:', e.message);
  }

  console.debug('[text-rec] CN READY');
}

export async function loadEnRecModel(onProgress) {
  console.debug('[text-rec-en] Starting EN model load...');
  const modelUrl = TEXT_REC_BASE + '/en_PP-OCRv3_rec.onnx';
  const keysUrl = TEXT_REC_BASE + '/en_dict.txt';

  await downloadWithProgress(modelUrl, '英文识别模型 (PP-OCRv3)', onProgress);

  try {
    const modelResp = await fetch(modelUrl);
    const modelBuf = await modelResp.arrayBuffer();
    console.debug('[text-rec-en] model size:', modelBuf.byteLength);

    enRecSession = await ort.InferenceSession.create(modelBuf, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    console.debug('[text-rec-en] session created');
  } catch (e) {
    console.error('[text-rec-en] EN model FAILED:', e.message);
    return;
  }

  try {
    const resp = await fetch(keysUrl);
    const text = await resp.text();
    const lines = text.replace(/\r/g, '').split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    enKeys = lines;
    console.debug('[text-rec-en] EN keys:', enKeys.length);
  } catch (e) {
    console.error('[text-rec-en] EN keys FAILED:', e.message);
  }

  console.debug('[text-rec-en] EN READY');
}

export function isTextRecReady() {
  return textRecSession !== null && keys.length > 0;
}

export function isEnRecReady() {
  return enRecSession !== null && enKeys.length > 0;
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
    // BGR channel order (matches PaddlePaddle/OpenCV convention)
    floatData[i] = (pixels[p + 2] / 255.0 - 0.5) / 0.5; // B
    floatData[n + i] = (pixels[p + 1] / 255.0 - 0.5) / 0.5; // G
    floatData[2 * n + i] = (pixels[p] / 255.0 - 0.5) / 0.5; // R
  }
  return { data: floatData, width: maxW };
}

// CTC greedy decode, also returns average confidence (mean of max logits over output steps)
function ctcDecode(logits, keyList) {
  let text = '';
  let prev = -1;
  const seqLen = logits.dims[1];
  const vocabSize = logits.dims[2];
  const spaceId = keyList.length + 1;
  let confSum = 0, confCount = 0;
  for (let t = 0; t < seqLen; t++) {
    const offset = t * vocabSize;
    let maxIdx = 0, maxVal = logits.data[offset];
    for (let i = 1; i < vocabSize; i++) {
      if (logits.data[offset + i] > maxVal) { maxVal = logits.data[offset + i]; maxIdx = i; }
    }
    if (maxIdx !== prev && maxIdx > 0) {
      if (maxIdx === spaceId) {
        text += ' ';
      } else if (maxIdx <= keyList.length) {
        text += keyList[maxIdx - 1];
      }
      confSum += maxVal; confCount++;
    }
    prev = maxIdx;
  }
  const textOut = simplifyText(text.replace(/\r/g, '').replace(/\n/g, '').trim());
  const conf = confCount > 0 ? confSum / confCount : 0;
  return { text: textOut, conf };
}

export async function recognizeText(img) {
  if (!isTextRecReady()) throw new Error('Text rec model not ready');
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  console.log('[text-rec] input image:', w + 'x' + h);
  const { data } = preprocessText(img);
  const inputTensor = new ort.Tensor('float32', data, [1, 3, 48, 320]);
  const t0 = performance.now();
  try {
    const results = await textRecSession.run({ [textRecSession.inputNames[0]]: inputTensor });
    const output = results[textRecSession.outputNames[0]];
    console.log('[text-rec] shape:', output.dims, 'time:', (performance.now()-t0).toFixed(0)+'ms');
    const { text, conf } = ctcDecode(output, keys);
    console.log('[text-rec] decoded:', JSON.stringify(text), 'ctc-conf:', conf.toFixed(2));
    return { text, conf };
  } catch (e) {
    console.error('[text-rec] inference FAILED:', e.message || e);
    throw e;
  }
}

export async function recognizeTextEn(img) {
  if (!isEnRecReady()) throw new Error('EN text rec model not ready');
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  console.log('[text-rec-en] input image:', w + 'x' + h);
  const { data } = preprocessText(img);
  const inputTensor = new ort.Tensor('float32', data, [1, 3, 48, 320]);
  const t0 = performance.now();
  try {
    const results = await enRecSession.run({ [enRecSession.inputNames[0]]: inputTensor });
    const output = results[enRecSession.outputNames[0]];
    console.log('[text-rec-en] shape:', output.dims, 'time:', (performance.now()-t0).toFixed(0)+'ms');
    const { text, conf } = ctcDecode(output, enKeys);
    console.log('[text-rec-en] decoded:', JSON.stringify(text), 'ctc-conf:', conf.toFixed(2));
    return { text, conf };
  } catch (e) {
    console.error('[text-rec-en] inference FAILED:', e.message || e);
    throw e;
  }
}

function scoreEnText(text) {
  if (!text || text.length < 2) return 0;
  let ascii = 0, total = 0;
  for (const ch of text) {
    total++;
    const c = ch.codePointAt(0);
    if ((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) ascii++;
    else if (c === 0x20 || (c >= 0x2C && c <= 0x2E)) ascii += 0.5;
  }
  return total > 0 ? ascii / total : 0;
}

function cjkRatio(text) {
  if (!text || text.length === 0) return 0;
  let cjk = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c >= 0x4E00 && c <= 0x9FFF) cjk++;
  }
  return cjk / text.length;
}

// Auto-detect language: run CN model first; if CTC confidence is high and output
// is mostly CJK → Chinese. Otherwise try EN model and pick the better result.
export async function recognizeTextAuto(img) {
  const cnReady = isTextRecReady();
  const enReady = isEnRecReady();

  if (!cnReady && !enReady) throw new Error('No text rec model ready');
  if (!enReady) { const r = await recognizeText(img); return r.text; }
  if (!cnReady) { const r = await recognizeTextEn(img); return r.text; }

  // Step 1: Run Chinese model
  let cnText = '', cnConf = 0;
  try {
    const r = await recognizeText(img);
    cnText = r.text; cnConf = r.conf;
  } catch (e) { console.error('[text-rec-auto] CN failed:', e.message); }

  const cnCjk = cjkRatio(cnText);

  // High CTC confidence + mostly CJK → confident Chinese, skip EN model
  if (cnConf > 0.8 && cnCjk > 0.5) {
    console.log('[text-rec-auto] confident CN (ctc=' + cnConf.toFixed(2) + ' cjk=' + cnCjk.toFixed(2) + '):',
      JSON.stringify(cnText.substring(0, 40)));
    return cnText;
  }

  // Step 2: Not confident → also run English model
  let enText = '';
  try {
    const r = await recognizeTextEn(img);
    enText = r.text;
  } catch (e) { console.error('[text-rec-auto] EN failed:', e.message); }

  const enScore = scoreEnText(enText);

  console.log('[text-rec-auto] CN ctc=' + cnConf.toFixed(2) + ' cjk=' + cnCjk.toFixed(2),
    '| EN score=' + enScore.toFixed(2),
    'CN:', JSON.stringify(cnText.substring(0, 40)),
    'EN:', JSON.stringify(enText.substring(0, 40)));

  // English model produced valid ASCII, Chinese looks weak → English
  if (enScore > 0.6 && cnCjk < 0.5) return enText;
  // Chinese is clearly CJK → Chinese
  if (cnCjk > 0.4) return cnText;
  // Fallback
  if (cnText.length === 0) return enText;
  if (enText.length === 0) return cnText;
  return enText.length >= cnText.length ? enText : cnText;
}
