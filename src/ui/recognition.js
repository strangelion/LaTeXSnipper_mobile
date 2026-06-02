// Image recognition pipeline — routes all recognition through Native OcrPlugin (Android)
// In browser dev mode (no Capacitor), falls back to external API only.

import { els, getFileInputHandler } from './dom-refs.js';
import { setStatus, showError, showProgress, hideProgress } from './status.js';
import { showResult, hideResult, showPDFBrowser, hidePDFBrowser } from './result.js';
import { OcrNative, isNativeOcrAvailable } from '../native/ocr-native.js';
import Logger from '../shared/logger.js';
import { t } from '../lang/i18n.js';

let lastRecognitionTime = 0;

/** Check if running in native mode */
function isNative() {
  return isNativeOcrAvailable();
}

/** Convert File/Blob to base64 data URI */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Process PDF by rendering each page via pdfjs, then sending to native recognizer.
 * Keeps pdfjs for page rendering since that's a pure JS UI concern.
 */
async function processPDFNative(file, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const pages = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (onProgress) onProgress({ page: pageNum, total: totalPages, pct: Math.round(pageNum / totalPages * 100) });
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
    const base64 = await fileToBase64(new File([blob], 'page.jpg'));

  const Ocr = OcrNative;
    const result = await Ocr.recognizeMixed({ image: base64 });
    // Mixed native now returns "text" (formattedText from Java layout engine).
    // Fall back to raw region texts only if formatted text is empty.
    const mixedText = result.text || result.regions?.map(r => r.text).filter(Boolean).join('\n') || '';
    const latex = result.regions?.filter(r => r.type === 'formula').map(r => r.text).join(' \\\\ ') || '';
    pages.push({ latex: mixedText || latex, confidence: result.confidence || 0.5 });
  }

  return {
    latex: pages.map(p => p.latex).join('\n\n'),
    confidence: pages.reduce((s, p) => s + p.confidence, 0) / pages.length,
    pageCount: totalPages,
    pages,
  };
}

// ── Main entry ──

export async function processImage(file) {
  // ── Check models are ready before processing ──
  // If native mode but models haven't finished loading, wait.
  if (isNative() && !window.__modelsReady) {
    setStatus('loading', t('status.loadingModel'), true);
    // Poll for models up to 3 minutes
    for (let i = 0; i < 180; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (window.__modelsReady) break;
    }
    if (!window.__modelsReady) {
      showError(t('status.modelTimeout'));
      setStatus('ready', t('status.modelTimeout'), false);
      return null;
    }
  }

  // Ensure clean state: reset progress BEFORE any recognition attempt
  hideProgress();
  hideResult();
  if (els.errorMsg) els.errorMsg.style.display = 'none';

  // Show preview immediately (before recognition starts)
  const url = URL.createObjectURL(file);
  if (els.preview) { els.preview.src = url; els.preview.style.display = 'block'; }
  if (els.dropContent) els.dropContent.style.display = 'none';

  let settings = {};
  try { settings = JSON.parse(localStorage.getItem('ls_settings') || '{}'); } catch (_) {}

  // External API path
  if (settings.engine && settings.engine !== 'builtin' && settings.baseUrl) {
    return processImageExternal(file, settings);
  }

  // ── Native mode (Android) ──
  if (isNative()) {
    try {
      // Pass original file to native — Java side handles all preprocessing/resize
      // (compressImage only runs for camera output > 500KB)
      const base64 = await fileToBase64(file);
      const mode = window.__recogMode?.() || 'formula';
      const Ocr = OcrNative;

      if (file.type === 'application/pdf') {
        setStatus('processing', t('status.recognizingPdf'), true);
        const pdfResult = await processPDFNative(file, (info) => {
          showProgress('PDF ' + info.page + '/' + info.total, info.pct);
        });
        hideProgress();
        lastRecognitionTime = Date.now();
        if (pdfResult.pages && pdfResult.pages.length > 1) {
          showPDFBrowser(pdfResult.pages);
          showResult(pdfResult.pages[0].latex, pdfResult.pages[0].confidence, pdfResult.pageCount + ' 页');
        } else {
          showResult(pdfResult.latex, pdfResult.confidence, pdfResult.pageCount + ' 页');
        }
        setStatus('done', t('status.donePages', {count: pdfResult.pageCount}), false);
        const fh = getFileInputHandler(); if (fh) fh(pdfResult, file);
        return pdfResult;
      }

      // ── Run recognition ──
      setStatus('processing', t('status.recognizing'), true);
      // Reset progress to 0% before starting new recognition
      showProgress(t('recog.processing'), 0);

      // Smooth progress (always increase, never decrease)
      let progressVal = 0;
      const progressTimer = setInterval(() => {
        // Steady increase: start fast, slow down as it approaches 85%
        const remaining = 85 - progressVal;
        const increment = Math.max(0.5, remaining * 0.12);
        progressVal = Math.min(85, progressVal + increment);
        showProgress(t('recog.processing'), Math.round(progressVal));
      }, 500);

      let result;
      if (mode === 'formula') {
        result = await Ocr.recognizeFormula({ image: base64 });
      } else if (mode === 'text') {
        result = await Ocr.recognizeText({ image: base64 });
      } else { // mixed
        result = await Ocr.recognizeMixed({ image: base64 });
      }

      clearInterval(progressTimer);
      hideProgress();

      URL.revokeObjectURL(url);
      lastRecognitionTime = Date.now();

      if (result && result.error) {
        showError(t('recog.recognitionFailed', {msg: result.error}));
        setStatus('ready', t('status.readyRetry'), false);
        return null;
      }

      // Extract text: formula/text modes use latex/text, mixed mode uses formattedText or regions
      let text = result.latex || result.text || '';
      let confidence = result.confidence || 0;

      // Mixed mode: if formattedText is empty, fall back to combining region texts
      if (!text && result.regions) {
        const parts = result.regions.map(r => r.text).filter(Boolean);
        text = parts.join('\n');
        confidence = result.regions.reduce((s, r) => s + (r.confidence || 0), 0) / Math.max(result.regions.length, 1);
      }

      if (!text) {
        showError((confidence ? t('recog.confidenceTooLow', {pct: (confidence*100).toFixed(1)}) : t('recog.emptyResult')));
        setStatus('ready', t('status.readyRetry'), false);
        return null;
      }

      showResult(text, confidence);
      setStatus('done', t('status.done'), false);
      const fh = getFileInputHandler(); if (fh) fh({ latex: text, confidence }, file);
      return { latex: text, confidence };
    } catch (e) {
      URL.revokeObjectURL(url);
      showError(t('recog.recognitionFailed', {msg: e.message || e}));
      setStatus('ready', t('status.readyRetry'), false);
      return null;
    }
  }

  // ── Browser dev mode: no local models available ──
  showError(t('error.initFailed', {msg: 'Browser mode'}));
  setStatus('ready', t('status.browserMode'), false);
  throw new Error('JS pipeline removed — use Native or External API');
}

// ── External API (preserved, works in both browser and native) ──

async function processImageExternal(file, settings) {
  hideResult();
  if (els.errorMsg) els.errorMsg.style.display = 'none';
  setStatus('processing', t('status.recognizingCloud'), true);
  try {
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    });
    const body = {
      model: settings.model || 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } },
          { type: 'text', text: 'Please convert the formula in this image to LaTeX code. Output ONLY the LaTeX code, no explanation.' },
        ],
      }],
      max_tokens: 1024,
    };
    const resp = await fetch(settings.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (settings.apiKey || '') },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) throw new Error('API error: HTTP ' + resp.status);
    const data = await resp.json();
    let latex = data.choices?.[0]?.message?.content || '';
    latex = latex.replace(/```latex\n?/g, '').replace(/```\n?/g, '').trim();
    lastRecognitionTime = Date.now();
    if (latex) { showResult(latex, 1.0); setStatus('done', t('status.cloudDone'), false); const fh = getFileInputHandler(); if (fh) fh({ latex, confidence: 1.0 }, file); }
    else { showError(t('recog.cloudEmpty')); setStatus('ready', t('status.ready'), false); }
  } catch (e) { showError(t('recog.cloudFailed', {msg: e.message || e})); setStatus('ready', t('status.ready'), false); }
}

/**
 * Compress/resize image to fit within maxDimension on the longest side.
 * Returns a compressed File/Blob suitable for OCR.
 */
async function compressImage(file, maxDimension = 1920) {
  // Only compress camera output (original > 500KB). Portrait files go via original path.
  if (file.size < 500 * 1024) return file;

  const img = await createImageBitmap(file);
  let w = img.width, h = img.height;
  if (w <= maxDimension && h <= maxDimension) {
    img.close();
    return file;
  }

  const scale = Math.min(1, maxDimension / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  img.close();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(new File([blob], file.name || 'photo.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  });
}
