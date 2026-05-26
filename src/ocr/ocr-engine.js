// OCR Engine — ONNX model loading, image preprocessing, greedy decode, LaTeX repair

import { MODEL_BASE, MODEL_CACHE, IMG_SIZE, CONFIDENCE_MIN, DECODER_MAX_TOKENS } from '../constants.js';

let encoderSession = null;
let decoderSession = null;
let tokenizerVocab = null;
let decoderStartId = 2;
let eosId = 2;
let padId = 0;
let running = false;  // Prevent concurrent inference

// ── Model download with Cache API ──

export async function downloadWithProgress(url, label, onProgress) {
  const cache = await caches.open(MODEL_CACHE);
  const cached = await cache.match(url);
  if (cached) {
    const buf = await cached.arrayBuffer();
    if (onProgress) onProgress(label + ' (cached ' + (buf.byteLength / 1024 / 1024).toFixed(1) + ' MB)', -1);
    await new Promise(r => setTimeout(r, 300));
    return buf;
  }
  if (onProgress) onProgress(label, 0);
  const resp = await fetch(url, { cache: 'no-cache' });
  if (!resp.ok) throw new Error('Download failed: ' + url);
  const contentLength = parseInt(resp.headers.get('content-length') || '0', 10);
  const reader = resp.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    chunks.push(result.value);
    loaded += result.value.length;
    if (onProgress && contentLength > 0) {
      onProgress(label, Math.round(loaded / contentLength * 100));
    }
  }
  const arrayBuffer = await new Blob(chunks).arrayBuffer();
  try { await cache.put(url, new Response(arrayBuffer, { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'max-age=604800' } })); } catch (e) { /* quota exceeded, non-fatal */ }
  return arrayBuffer;
}

// ── Model loading ──

export async function loadModels(onProgress) {
  const encoderBuf = await downloadWithProgress(MODEL_BASE + '/encoder_model.onnx', 'Encoder model', onProgress);
  if (onProgress) onProgress('Loading encoder into memory…', -1);
  encoderSession = await ort.InferenceSession.create(encoderBuf, {
    executionProviders: ['webgpu', 'wasm'],
    graphOptimizationLevel: 'all',
  });

  const decoderBuf = await downloadWithProgress(MODEL_BASE + '/decoder_model.onnx', 'Decoder model', onProgress);
  if (onProgress) onProgress('Loading decoder into memory…', -1);
  decoderSession = await ort.InferenceSession.create(decoderBuf, {
    executionProviders: ['webgpu', 'wasm'],
    graphOptimizationLevel: 'all',
  });
}

export async function loadTokenizer() {
  const resp = await fetch(MODEL_BASE + '/tokenizer.json');
  const data = await resp.json();
  const vocab = data.model.vocab;
  tokenizerVocab = {};
  for (const [token, id] of Object.entries(vocab)) { tokenizerVocab[id] = token; }
  try {
    const genResp = await fetch(MODEL_BASE + '/generation_config.json');
    const genData = await genResp.json();
    decoderStartId = genData.decoder_start_token_id || 2;
    eosId = genData.eos_token_id || 2;
    padId = genData.pad_token_id || 0;
  } catch (e) { /* keep defaults */ }
}

export function isReady() {
  return encoderSession !== null && decoderSession !== null && tokenizerVocab !== null;
}

// ── Empty image check ──

export function isImageEmpty(img) {
  const canvas = document.createElement('canvas');
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const size = Math.max(128, Math.min(384, w, h));
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  const n = size * size;
  let sum = 0, min = 255, max = 0;
  for (let i = 0; i < n; i++) {
    const v = pixels[i * 4];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;
  const range = max - min;
  // Empty = nearly uniform (range <= 20) OR very low foreground density
  // Use range-based check instead of std — more robust for anti-aliased thin strokes
  let fg = 0;
  const threshold = Math.max(16, range * 0.3);
  for (let i = 0; i < n; i++) {
    if (Math.abs(pixels[i * 4] - mean) >= threshold) fg++;
  }
  const fgRatio = fg / n;
  return range <= 20 || fgRatio < 0.0003;
}

export function preprocessImage(img) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = IMG_SIZE; canvas.height = IMG_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, IMG_SIZE, IMG_SIZE);

  const pixels = ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE).data;
  const floatData = new Float32Array(3 * IMG_SIZE * IMG_SIZE);
  const hw = IMG_SIZE * IMG_SIZE;
  const scl = 2.0 / 255.0;
  for (let i = 0; i < hw; i++) {
    const p = i * 4;
    floatData[i] = pixels[p] * scl - 1.0;
    floatData[hw + i] = pixels[p + 1] * scl - 1.0;
    floatData[2 * hw + i] = pixels[p + 2] * scl - 1.0;
  }
  return floatData;
}

// ── Softmax & greedy decode ──

function softmax(arr) {
  const max = Math.max.apply(null, arr);
  const exp = arr.map(x => Math.exp(x - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(x => x / sum);
}

function greedyDecode(logits) {
  const probs = softmax(logits);
  let maxIdx = 0, maxVal = probs[0];
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > maxVal) { maxVal = probs[i]; maxIdx = i; }
  }
  return { tokenId: maxIdx, prob: maxVal };
}

function decodeTokens(tokenIds) {
  if (!tokenizerVocab) return tokenIds.join(', ');
  let text = '';
  for (let i = 0; i < tokenIds.length; i++) {
    const token = tokenizerVocab[tokenIds[i]];
    if (!token) continue;
    if (token.startsWith('<') && token.endsWith('>')) continue;
    if (token.startsWith('Ġ')) { text += ' ' + token.slice(1); }
    else if (token.startsWith('▁')) { text += ' ' + token.slice(1); }
    else { text += token; }
  }
  return text.trim();
}

// ── LaTeX repair ──

export function repairLatex(tex) {
  let s = tex.replace(/\r\n/g, '\n').trim();
  if (!s) return s;

  // Strip trailing isolated backslashes
  s = s.replace(/(?:\\\\\s*)+$/g, '').trim();
  while (s.endsWith('\\') && !s.endsWith('\\\\')) s = s.slice(0, -1).trim();

  // Remove excess closing braces
  let depth = 0, cleaned = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') { depth++; cleaned += ch; }
    else if (ch === '}') { if (depth > 0) { depth--; cleaned += ch; } }
    else { cleaned += ch; }
  }
  s = cleaned;

  // Complete \frac, \binom, \dfrac, \tfrac missing args
  const cmdRe = /\\(?:dfrac|tfrac|frac|binom)\b/g;
  let m, edits = [];
  while ((m = cmdRe.exec(s)) !== null) {
    let pos = m.index + m[0].length;
    while (pos < s.length && s[pos] === ' ') pos++;
    if (pos >= s.length || s[pos] !== '{') { edits.push({ p: pos, t: ' {} {}' }); continue; }
    let d = 0, end = -1;
    for (let j = pos; j < s.length; j++) {
      if (s[j] === '{') d++;
      else if (s[j] === '}') { d--; if (d === 0) { end = j + 1; break; } }
    }
    if (end < 0) { edits.push({ p: pos, t: ' {}' }); continue; }
    pos = end;
    while (pos < s.length && s[pos] === ' ') pos++;
    if (pos >= s.length || s[pos] !== '{') edits.push({ p: end, t: ' {}' });
  }
  for (let ei = edits.length - 1; ei >= 0; ei--) {
    s = s.slice(0, edits[ei].p) + edits[ei].t + s.slice(edits[ei].p);
  }

  // Complete \left / \begin environments
  const leftStack = [], beginStack = [];
  const re2 = /\\(left|right)\b|\\(begin|end)\s*\{([A-Za-z*]+)\s*\}/g;
  let m2;
  while ((m2 = re2.exec(s)) !== null) {
    if (m2[1] === 'left') leftStack.push(m2.index);
    else if (m2[1] === 'right' && leftStack.length) leftStack.pop();
    else if (m2[2] === 'begin') beginStack.push(m2[3]);
    else if (m2[2] === 'end' && beginStack.length) {
      for (let bi = beginStack.length - 1; bi >= 0; bi--) {
        if (beginStack[bi] === m2[3]) { beginStack.length = bi; break; }
      }
    }
  }
  let suffix = '';
  while (leftStack.length) { suffix += ' \\right.'; leftStack.pop(); }
  for (let bi = beginStack.length - 1; bi >= 0; bi--) {
    suffix += '\n\\end{' + beginStack[bi] + '}';
  }
  while (depth > 0) { s += '}'; depth--; }
  return (s + suffix).trim();
}

// ── Main recognition pipeline ──

export async function recognize(img) {
  if (!isReady()) throw new Error('Model not ready');
  if (running) { log('recognize skip — already running'); return { latex: '', confidence: 0, busy: true }; }
  running = true;

  try {

  if (isImageEmpty(img)) {
    log('recognize skip — image empty');
    return { latex: '', confidence: 0 };
  }

  const t0 = performance.now();
  const pixelValues = preprocessImage(img);
  const inputTensor = new ort.Tensor('float32', pixelValues, [1, 3, 384, 384]);

  // Yield to UI thread before heavy WASM inference (prevents UI freeze)
  await new Promise(r => setTimeout(r, 50));

  const encName = encoderSession.inputNames[0];
  const encOut = await encoderSession.run({ [encName]: inputTensor });
  const hiddenStates = encOut[encoderSession.outputNames[0]];

  const decName0 = decoderSession.inputNames[0];
  const decName1 = decoderSession.inputNames[1];
  const maxTokens = 256; // Cap to limit UI freeze duration
  let inputIds = new ort.Tensor('int64', BigInt64Array.from([BigInt(decoderStartId)]), [1, 1]);
  const tokenIds = [], tokenProbs = [];

  for (let step = 0; step < maxTokens; step++) {
    const decOut = await decoderSession.run({
      [decName0]: inputIds,
      [decName1]: hiddenStates,
    });
    const logits = decOut[decoderSession.outputNames[0]];
    const seqLen = logits.dims[1];
    const vocabSize = logits.dims[2];
    const offset = (seqLen - 1) * vocabSize;
    const lastLogits = Array.from(logits.data.slice(offset, offset + vocabSize));
    const res = greedyDecode(lastLogits);

    if (res.tokenId === eosId || res.tokenId === padId) break;
    tokenIds.push(res.tokenId);
    tokenProbs.push(res.prob);

    const newIds = Array.from(inputIds.data);
    newIds.push(BigInt(res.tokenId));
    inputIds = new ort.Tensor('int64', BigInt64Array.from(newIds), [1, seqLen + 1]);
  }

  const rawLatex = decodeTokens(tokenIds);
  let latex = repairLatex(rawLatex);

  const avgConf = tokenProbs.length > 0
    ? tokenProbs.reduce((a, b) => a + b, 0) / tokenProbs.length
    : 0;

  if (avgConf < CONFIDENCE_MIN) latex = '';
  return { latex, confidence: avgConf };
  } finally { running = false; }
}
