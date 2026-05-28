// PDF processor — page-by-page rendering + text extraction + OCR
// Extracted from ocr_demo.html, logic preserved 100%

import { recognize } from './ocr-engine.js';

export async function processPDF(file, onProgress) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdf.numPages;

    // Generate page thumbnails (small, for navigator strip)
    const pages = [];
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (onProgress) {
        onProgress({
          page: pageNum,
          total: totalPages,
          pct: Math.round((pageNum - 1) / totalPages * 100),
        });
      }

      const page = await pdf.getPage(pageNum);

      // Render page at moderate resolution for OCR
      const baseVp = page.getViewport({ scale: 1.0 });
      const maxDim = Math.max(baseVp.width, baseVp.height);
      const renderScale = Math.max(1.0, Math.min(2.0, 768 / maxDim));
      const viewport = page.getViewport({ scale: renderScale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Render thumbnail (small, for navigator strip)
      const thumbScale = 0.2;
      const thumbViewport = page.getViewport({ scale: thumbScale });
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = thumbViewport.width;
      thumbCanvas.height = thumbViewport.height;

      const textPromise = page.getTextContent().catch(() => ({ items: [] }));
      const renderPromise = page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
      }).promise;
      const thumbPromise = page.render({
        canvasContext: thumbCanvas.getContext('2d'),
        viewport: thumbViewport,
      }).promise;
      const [textResult] = await Promise.all([textPromise, renderPromise, thumbPromise]);

      // Extract text
      let pageText = '';
      const items = textResult.items;
      if (items && items.length) {
        const lineMap = {};
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const y = Math.round(item.transform[5] * 10) / 10;
          let key = null;
          const keys = Object.keys(lineMap);
          for (let k = 0; k < keys.length; k++) {
            if (Math.abs(parseFloat(keys[k]) - y) < 4) { key = keys[k]; break; }
          }
          if (!key) key = String(y);
          if (!lineMap[key]) lineMap[key] = [];
          lineMap[key].push(item);
        }
        const sortedYs = Object.keys(lineMap).sort((a, b) => parseFloat(b) - parseFloat(a));
        const lines = [];
        for (let yi = 0; yi < sortedYs.length; yi++) {
          const ly = sortedYs[yi];
          lineMap[ly].sort((a, b) => a.transform[4] - b.transform[4]);
          const lineText = lineMap[ly].map(it => it.str).join(' ');
          if (lineText.trim()) lines.push(lineText.trim());
        }
        pageText = lines.join('\n');
      }

      // OCR
      let formulaLatex = '', formulaConf = 0;
      try {
        const recResult = await recognize(canvas);
        formulaLatex = recResult.latex;
        formulaConf = recResult.confidence;
      } catch (e) {
        formulaLatex = '% [Error] ' + (e.message || e);
      }

      pages.push({
        page: pageNum,
        text: pageText,
        latex: formulaLatex,
        confidence: formulaConf,
        thumb: thumbCanvas.toDataURL('image/jpeg', 0.6),
      });
    }

    if (pages.length === 0) {
      throw new Error('PDF recognition failed: no content extracted');
    }

    // Combined output (legacy)
    const combined = pages.map(r => {
      const parts = ['% === Page ' + r.page + ' ==='];
      if (r.text) { parts.push('% --- Text ---'); parts.push(r.text); }
      if (r.latex && r.latex.trim()) { parts.push('% --- Formulas ---'); parts.push(r.latex); }
      return parts.join('\n');
    }).join('\n\n');

    const avgConf = pages.reduce((s, r) => s + r.confidence, 0) / pages.length;

    return { latex: combined, confidence: avgConf, pageCount: totalPages, pages };
  } catch (e) {
    throw new Error('PDF processing failed: ' + (e.message || e));
  }
}
