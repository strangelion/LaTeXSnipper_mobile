// Image recognition pipeline — routes all recognition through Native OcrPlugin (Android)
// In browser dev mode (no Capacitor), falls back to external API only.

import { els, getFileInputHandler } from './dom-refs.js';
import { setStatus, showError, showProgress, hideProgress } from './status.js';
import { showResult, hideResult, showPDFBrowser, hidePDFBrowser } from './result.js';
import { OcrNative, isNativeOcrAvailable } from '../native/ocr-native.js';
import Logger from '../shared/logger.js';
import { t } from '../lang/i18n.js';
import { MAX_PDF_PAGES } from '../constants.js';

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
 * Parse a user-supplied page range string into an array of 1-based page numbers.
 * Supports formats: "5" (single), "1-5" (range), "1,3,5-7" (mixed).
 * Invalid/non-numeric input is silently skipped. Returns null to signal "all pages".
 */
function parsePageRange(input, totalPages) {
  if (!input || !input.trim()) return null;
  const s = input.trim();
  // "all" or empty = all pages
  if (/^(all|全部|\*)$/i.test(s)) return null;

  const pages = new Set();
  const parts = s.split(/[,，、\s]+/);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (rangeMatch) {
      const start = Math.max(1, parseInt(rangeMatch[1], 10));
      const end = Math.min(totalPages, parseInt(rangeMatch[2], 10));
      for (let i = start; i <= end; i++) pages.add(i);
      continue;
    }
    const singleMatch = part.match(/^(\d+)$/);
    if (singleMatch) {
      const p = parseInt(singleMatch[1], 10);
      if (p >= 1 && p <= totalPages) pages.add(p);
    }
  }

  if (pages.size === 0) return null;
  return [...pages].sort((a, b) => a - b);
}

/**
 * Show the PDF page range selection dialog.
 * Returns a Promise that resolves to:
 *   - number[] of selected page numbers
 *   - null if user chose "all pages"
 *   - Rejects (throws) if user cancels
 */
function showPageRangeDialog(totalPages) {
  return new Promise((resolve, reject) => {
    const overlay = document.getElementById('pdfRangeOverlay');
    const input = document.getElementById('pdfRangeInput');
    const desc = document.getElementById('pdfRangeDesc');
    const allBtn = document.getElementById('pdfRangeAll');
    const confirmBtn = document.getElementById('pdfRangeConfirm');
    const cancelBtn = document.getElementById('pdfRangeCancel');

    if (!overlay || !input || !confirmBtn || !cancelBtn) {
      reject(new Error('PDF range dialog elements not found'));
      return;
    }

    // Update description with page count
    if (desc) desc.textContent = t('pdf.rangeDesc', { total: totalPages });

    // Default: suggest all pages
    input.value = '1-' + totalPages;
    input.placeholder = t('pdf.rangePlaceholder');

    // Quick select buttons
    const quickBtns = overlay.querySelectorAll('.pdf-range-quick[data-range]');
    quickBtns.forEach(btn => {
      btn.onclick = () => {
        const range = btn.dataset.range;
        if (range) {
          input.value = range;
          input.focus();
        }
      };
    });

    function cleanup() {
      overlay.style.display = 'none';
      quickBtns.forEach(btn => { btn.onclick = null; });
      allBtn.removeEventListener('click', onAll);
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      input.removeEventListener('keydown', onKeydown);
    }

    function onAll() {
      cleanup();
      resolve(null); // null = all pages
    }

    function onConfirm() {
      const parsed = parsePageRange(input.value, totalPages);
      if (parsed === null) {
        cleanup();
        resolve(null);
      } else if (parsed.length === 0) {
        input.style.borderColor = '#ef4444';
        setTimeout(() => { input.style.borderColor = ''; }, 600);
        input.focus();
        input.select();
      } else {
        cleanup();
        resolve(parsed);
      }
    }

    function onCancel() {
      cleanup();
      reject(new Error('PDF page selection cancelled'));
    }

    function onBackdrop(e) {
      if (e.target === overlay) onCancel();
    }

    function onKeydown(e) {
      if (e.key === 'Enter') onConfirm();
      if (e.key === 'Escape') onCancel();
    }

    allBtn.addEventListener('click', onAll);
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
    input.addEventListener('keydown', onKeydown);

    overlay.style.display = 'flex';
    input.focus();
    input.select();
  });
}

/**
 * Process PDF by rendering each page via pdfjs, then sending to native recognizer.
 * Keeps pdfjs for page rendering since that's a pure JS UI concern.
 *
 * @param {File} file - The PDF file
 * @param {number[]|null|undefined} pageRange - Array of 1-based page numbers to process,
 *        null for all pages (capped by MAX_PDF_PAGES), undefined to show dialog
 * @param {function} onProgress - Progress callback
 */
async function processPDFNative(file, pageRange, onProgress) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;

  // If pageRange was not pre-determined, show the selection dialog now
  if (pageRange === undefined) {
    try {
      pageRange = await showPageRangeDialog(totalPages);
    } catch (_) {
      throw new Error('PDF processing cancelled by user');
    }
  }

  // Determine which pages to process
  let pagesToProcess;
  if (pageRange) {
    // User-specified range, filter to valid pages
    pagesToProcess = pageRange.filter(p => p >= 1 && p <= totalPages);
  } else {
    // All pages, but cap at MAX_PDF_PAGES
    const count = Math.min(totalPages, MAX_PDF_PAGES);
    pagesToProcess = Array.from({ length: count }, (_, i) => i + 1);
    if (totalPages > MAX_PDF_PAGES) {
      Logger.warn('PDF', `Truncated to ${MAX_PDF_PAGES} pages (total ${totalPages})`);
    }
  }

  if (pagesToProcess.length === 0) {
    throw new Error('No valid pages selected');
  }

  const pages = [];
  const totalToProcess = pagesToProcess.length;

  for (let idx = 0; idx < totalToProcess; idx++) {
    const pageNum = pagesToProcess[idx];
    if (onProgress) onProgress({ page: idx + 1, total: totalToProcess, pct: Math.round((idx + 1) / totalToProcess * 100) });
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
    const mixedText = result.text || result.regions?.map(r => r.text).filter(Boolean).join('\n') || '';
    const latex = result.regions?.filter(r => r.type === 'formula').map(r => r.text).join(' \\\\ ') || '';
    pages.push({ latex: mixedText || latex, confidence: result.confidence || 0.5, page: pageNum });
  }

  return {
    latex: pages.map(p => p.latex).join('\n\n'),
    confidence: pages.reduce((s, p) => s + p.confidence, 0) / pages.length,
    pageCount: totalToProcess,
    totalPages,
    pages,
  };
}

// ── Main entry ──

export async function processImage(file) {
  // ── Check models are ready before processing ──
  if (isNative() && !window.__modelsReady) {
    setStatus('loading', t('status.loadingModel'), true);
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

  // ── Native mode — check if models are actually available ──
  if (isNative()) {
    const mode = window.__recogMode?.() || 'formula';
    const hasFormulaModels = window.__nativeModelStatus?.formulaDet && window.__nativeModelStatus?.formulaRec;
    const hasTextModels = window.__nativeModelStatus?.textDet && window.__nativeModelStatus?.textRec;
    Logger.info('recog', `Mode: ${mode}, formulaModels: ${hasFormulaModels}, textModels: ${hasTextModels}, nativeModelStatus: ${JSON.stringify(window.__nativeModelStatus)}`);

    if ((mode === 'formula' && !hasFormulaModels) || (mode === 'text' && !hasTextModels) || (mode === 'mixed' && !hasFormulaModels && !hasTextModels)) {
      const msg = t('status.noModels') || 'No local models installed. Download models in Settings or switch to External API.';
      showError(msg);
      setStatus('ready', msg, false);
      return null;
    }
    try {
      const base64 = await fileToBase64(file);
      const Ocr = OcrNative;

      const isPdf = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        setStatus('processing', t('status.recognizingPdf'), true);

        // processPDFNative reads the PDF once, shows page range dialog,
        // then renders and recognizes only selected pages
        let pdfResult;
        try {
          pdfResult = await processPDFNative(file, undefined, (info) => {
            showProgress('PDF ' + info.page + '/' + info.total, info.pct);
          });
        } catch (e) {
          // User cancelled or error — restore UI
          URL.revokeObjectURL(url);
          hideProgress();
          setStatus('ready', t('status.ready'), false);
          if (els.preview) els.preview.style.display = 'none';
          if (els.dropContent) els.dropContent.style.display = '';
          // Only show error if it wasn't user cancellation
          if (e.message !== 'PDF processing cancelled by user') {
            showError(t('recog.recognitionFailed', {msg: e.message || e}));
          }
          return null;
        }

        hideProgress();
        lastRecognitionTime = Date.now();
        if (pdfResult.pages && pdfResult.pages.length > 1) {
          showPDFBrowser(pdfResult.pages);
          showResult(pdfResult.pages[0].latex, pdfResult.pages[0].confidence, pdfResult.pageCount + ' 页');
        } else if (pdfResult.pages && pdfResult.pages.length === 1) {
          showResult(pdfResult.pages[0].latex, pdfResult.pages[0].confidence);
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
      Logger.info('recog', `Result: ${JSON.stringify({ error: result?.error, latex: result?.latex?.substring(0, 50), text: result?.text?.substring(0, 50), confidence: result?.confidence, regions: result?.regions?.length })}`);

      if (result && result.error) {
        showError(t('recog.recognitionFailed', {msg: result.error}));
        setStatus('ready', t('status.readyRetry'), false);
        return null;
      }

      // Extract text: formula/text modes use latex/text, mixed mode uses formattedText or regions
      let text = result.latex || result.text || '';
      let confidence = result.confidence || 0;
      Logger.info('recog', `Extracted text: "${text.substring(0, 100)}", confidence: ${confidence}`);

      // Mixed mode: if formattedText is empty, fall back to combining region texts
      if (!text && result.regions) {
        const parts = result.regions.map(r => r.text).filter(Boolean);
        text = parts.join('\n');
        confidence = result.regions.reduce((s, r) => s + (r.confidence || 0), 0) / Math.max(result.regions.length, 1);
      }

      if (!text) {
        Logger.warn('recog', `Empty result: confidence=${confidence}, result=${JSON.stringify(result).substring(0, 200)}`);
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
