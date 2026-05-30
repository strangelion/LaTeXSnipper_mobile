// Image recognition pipeline: processImage, mixed mode, external API
import { isReady, recognize } from '../ocr/ocr-engine.js';
import { isTextDetReady, detectText, cropTextRegion } from '../ocr/text-detection.js';
import { isDetReady, detectFormulas, cropRegion } from '../ocr/formula-detection.js';
import { isTesseractReady, recognizeText } from '../ocr/tesseract-recognition.js';
import { isTextRecReady, recognizeTextAuto } from '../ocr/text-recognition.js';
import { isRegionDetReady, detectRegions, cropRegion as cropRegionDetect, groupRegionsByLine } from '../ocr/region-detect.js';
import { enhanceHandwriting } from '../ocr/image-preprocess.js';
import { processPDF } from '../ocr/pdf-processor.js';
import { els, getFileInputHandler } from './dom-refs.js';
import { setStatus, showError, showProgress, hideProgress } from './status.js';
import { showResult, hideResult, showPDFBrowser, hidePDFBrowser } from './result.js';

let lastRecognitionTime = 0;

// ── Sanitize helpers ──

function sanitizeLatex(latex) {
  if (!latex) return latex;
  let out = latex;
  out = out.replace(/\\boldsymbol\{([^}]*)\}/g, (_, t) =>
    /[一-鿿]/.test(t) ? '\\textbf{' + t + '}' : _);
  out = out.replace(/\\mathbf\{([^}]*)\}/g, (_, t) =>
    /[一-鿿]/.test(t) ? '\\textbf{' + t + '}' : _);
  out = out.replace(/\\mathit\{([^}]*)\}/g, (_, t) =>
    /[一-鿿]/.test(t) ? '\\textbf{' + t + '}' : _);
  out = out.replace(/\\mathrm\{([^}]*)\}/g, (_, t) =>
    /[一-鿿]/.test(t) ? '\\textbf{' + t + '}' : _);
  out = out.replace(/\\boldsymbol\{[^}]*$/g, '');
  out = out.replace(/\\mathbf\{[^}]*$/g, '');
  out = out.replace(/\\mathit\{[^}]*$/g, '');
  out = out.replace(/\\mathrm\{[^}]*$/g, '');
  let open = 0;
  for (const ch of out) { if (ch === '{') open++; if (ch === '}') open--; }
  if (open > 0) out += '}'.repeat(open);
  return out;
}

function isGarbledFormula(latex) {
  if (!latex || latex.length < 3) return true;
  const stripped = latex.replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}]/g, '').trim();
  if (stripped.length > 10) {
    for (let len = 3; len <= Math.min(12, Math.floor(stripped.length / 3)); len++) {
      for (let i = 0; i <= stripped.length - len; i++) {
        const sub = stripped.substring(i, i + len);
        if (sub.trim().length < 2) continue;
        let count = 0, pos = 0;
        while ((pos = stripped.indexOf(sub, pos)) !== -1) { count++; pos += len; }
        if (count >= 5) { console.debug('[garbled] repeated:', JSON.stringify(sub), 'x'+count); return true; }
      }
    }
  }
  const textContent = (latex.match(/\\text\{[^}]+\}/g) || []).join('');
  if (textContent.length > latex.length * 0.7) {
    console.debug('[garbled] text-dominated formula:', latex.substring(0, 80));
    return true;
  }
  return false;
}

// ── Mixed mode processing ──

async function processMixedMode(img) {
  console.debug('[mixed] Starting region detection...');

  let regions = [];
  if (isRegionDetReady()) {
    try {
      const result = await detectRegions(img);
      regions = result.regions;
      console.debug(`[mixed] detected ${regions.length} regions:`,
        regions.map(r => `${r.label===0?'F':'T'}(${r.w}x${r.h})`).join(', '));
    } catch (e) {
      console.debug('[mixed] region-detect failed:', e.message);
    }
  }

  if (regions.length === 0) {
    console.debug('[mixed] falling back to formula-det...');
    if (isDetReady()) {
      try {
        const formulaBoxes = await detectFormulas(img);
        for (const box of formulaBoxes) {
          if (box.w >= 20 && box.h >= 15) {
            regions.push({ x: box.x, y: box.y, w: box.w, h: box.h, label: 0 });
          }
        }
      } catch (e) { /* ignore */ }
    }
    if (regions.length === 0) {
      if (isTesseractReady()) {
        const text = await recognizeText(img);
        if (text && text.trim().length > 1) {
          return { latex: text, confidence: 0.7 };
        }
      }
      return await recognize(img, 'formula');
    }
  }

  const lines = groupRegionsByLine(regions);
  console.debug(`[mixed] ${lines.length} lines from ${regions.length} regions`);

  const lineResults = [];
  for (const line of lines) {
    const parts = [];
    for (const region of line) {
      const crop = cropRegionDetect(img, region);
      try {
        if (region.label === 0) {
          const r = await recognize(crop, 'formula');
          if (r.latex && r.latex.trim().length > 0 && r.confidence >= 0.15 && !isGarbledFormula(r.latex)) {
            parts.push({ type: 'formula', text: sanitizeLatex(r.latex.trim()), conf: r.confidence });
          }
        } else {
          let textResult = null;
          if (isTextRecReady()) {
            try {
              const enhanced = enhanceHandwriting(crop);
              const raw = await recognizeTextAuto(enhanced);
              if (raw && raw.trim().length > 0) {
                textResult = '\\text{' + raw.trim().replace(/[\\{}&#%_$~^]/g, '\\$&') + '}';
              }
            } catch (e) { console.debug('[mixed] PP-OCRv5 failed:', e.message); }
          }
          if (!textResult && isTesseractReady()) {
            try {
              textResult = await recognizeText(crop);
            } catch (e) { /* ignore */ }
          }
          if (textResult && textResult.trim().length > 1) {
            parts.push({ type: 'text', text: textResult.trim(), conf: 0.8 });
          } else {
            const r = await recognize(crop, 'formula');
            if (r.latex && r.latex.trim().length > 0 && r.confidence >= 0.15 && !isGarbledFormula(r.latex)) {
              parts.push({ type: 'formula', text: sanitizeLatex(r.latex.trim()), conf: r.confidence });
            }
          }
        }
      } catch (e) {
        console.debug(`[mixed] rec failed for region:`, e.message);
      }
    }

    if (parts.length > 0) {
      lineResults.push({
        text: parts.map(p => p.text).join(' '),
        conf: parts.reduce((s, p) => s + p.conf, 0) / parts.length,
      });
    }
  }

  if (lineResults.length === 0) {
    return await recognize(img, 'formula');
  }

  const latex = lineResults.map(l => l.text).join('\n');
  const avgConf = lineResults.reduce((s, l) => s + l.conf, 0) / lineResults.length;
  let braceDepth = 0;
  for (const ch of latex) {
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
  }
  console.debug(`[mixed] result: ${lineResults.length} lines, braceBalance=${braceDepth}, conf=${avgConf.toFixed(2)}`);
  console.debug(`[mixed] full LaTeX:\n${latex.substring(0, 500)}`);
  return { latex, confidence: avgConf };
}

// ── External API recognition ──

async function processImageExternal(file, settings) {
  hideResult();
  if (els.errorMsg) els.errorMsg.style.display = 'none';
  setStatus('processing', '正在调用云端模型…', true);

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
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (settings.apiKey || ''),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) throw new Error('API error: HTTP ' + resp.status);
    const data = await resp.json();
    let latex = data.choices?.[0]?.message?.content || '';
    latex = latex.replace(/```latex\n?/g, '').replace(/```\n?/g, '').trim();
    lastRecognitionTime = Date.now();
    if (latex) {
      showResult(latex, 1.0);
      setStatus('done', '云端识别完成', false);
      const fh = getFileInputHandler();
      if (fh) fh({ latex, confidence: 1.0 }, file);
    } else {
      showError('云端未返回有效结果');
      setStatus('ready', '模型就绪！拖入公式图片开始识别', false);
    }
  } catch (e) {
    showError('云端识别失败: ' + (e.message || e));
    setStatus('ready', '模型就绪！拖入公式图片开始识别', false);
  }
}

// ── Main entry point ──

export async function processImage(file) {
  if (!isReady()) { showError('模型尚未加载完成，请稍等'); return; }

  let settings = {};
  try { settings = JSON.parse(localStorage.getItem('ls_settings') || '{}'); } catch (_) {}

  if (settings.engine && settings.engine !== 'builtin' && settings.baseUrl) {
    return processImageExternal(file, settings);
  }

  if (file.size < 1024) { showError('文件太小，至少 1KB'); return; }

  // PDF branch
  if (file.type === 'application/pdf') {
    hideResult();
    hidePDFBrowser();
    if (els.errorMsg) els.errorMsg.style.display = 'none';
    setStatus('processing', '正在解析 PDF…', true);
    try {
      const pdfResult = await processPDF(file, (info) => {
        showProgress('PDF 第 ' + info.page + '/' + info.total + ' 页', info.pct);
      });
      hideProgress();
      lastRecognitionTime = Date.now();
      if (pdfResult.pages && pdfResult.pages.length > 1) {
        showPDFBrowser(pdfResult.pages);
        showResult(pdfResult.pages[0].latex, pdfResult.pages[0].confidence, pdfResult.pageCount + ' 页');
      } else {
        showResult(pdfResult.latex, pdfResult.confidence, pdfResult.pageCount + ' 页');
      }
      setStatus('done', '识别完成（' + pdfResult.pageCount + ' 页）', false);
      const fh = getFileInputHandler();
      if (fh) fh(pdfResult, file);
      return pdfResult;
    } catch (e) { showError(e.message); setStatus('ready', '模型就绪！拖入公式图片开始识别', false); return null; }
  }

  // Image branch
  const url = URL.createObjectURL(file);
  if (els.preview) {
    els.preview.src = url;
    els.preview.style.display = 'block';
  }
  if (els.dropContent) els.dropContent.style.display = 'none';
  hideResult();
  if (els.errorMsg) els.errorMsg.style.display = 'none';
  setStatus('processing', '正在识别…', true);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const mode = window.__recogMode?.() || 'formula';
        let result;
        console.debug('[ocr] mode=' + mode);
        if (mode === 'text' && isTesseractReady()) {
          const text = await recognizeText(img);
          result = { latex: '\\text{' + text + '}', confidence: 0.8 };
        } else if (mode === 'mixed' && (isRegionDetReady() || isTesseractReady())) {
          result = await processMixedMode(img);
        } else if (mode === 'text' && isTextDetReady() && isTextRecReady()) {
          const boxes = await detectText(img);
          if (boxes.length === 0) {
            result = await recognize(img, 'formula');
          } else {
            const lines = [];
            let totalConf = 0;
            for (const box of boxes) {
              const crop = cropTextRegion(img, box);
              try {
                const enhanced = enhanceHandwriting(crop);
                const text = await recognizeTextAuto(enhanced);
                if (text && text.trim()) { lines.push(text.trim()); totalConf += 0.8; }
              } catch (e) {}
            }
            result = lines.length > 0
              ? { latex: lines.join('\n'), confidence: totalConf / boxes.length }
              : await recognize(img, 'formula');
          }
        } else {
          result = await recognize(img, mode);
        }
        lastRecognitionTime = Date.now();
        URL.revokeObjectURL(url);
        if (!result.latex) {
          showError('未识别到内容（置信度 ' + (result.confidence * 100).toFixed(1) + '% 过低），请重新尝试');
          setStatus('ready', '模型就绪！请重新上传图片', false);
          resolve(null);
          return;
        }
        showResult(result.latex, result.confidence);
        setStatus('done', '识别完成', false);
        const fh = getFileInputHandler();
        if (fh) fh(result, file);
        resolve(result);
      } catch (e) {
        URL.revokeObjectURL(url);
        showError('识别失败: ' + (e.message || e));
        setStatus('ready', '模型就绪！拖入公式图片开始识别', false);
        resolve(null);
      }
    };
    img.src = url;
  });
}
