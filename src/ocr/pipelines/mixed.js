// Mixed pipeline — detects both formulas and text in a single image.
// Delegates entirely to Java's OcrEngine.recognizeMixed().

import { OcrNative } from '../../native/ocr-native.js';
import { OcrPipeline } from '../pipeline.js';

export const mixedPipeline = new OcrPipeline('mixed', {
  checkModels: () => {
    const s = window.__nativeModelStatus;
    return (s?.formulaDet && s?.formulaRec) || (s?.textDet && s?.textRec);
  },

  run: async (image) => {
    const result = await OcrNative.recognizeMixed({ image });
    // Mixed mode may return formattedText, text, or regions
    let text = result.formattedText || result.latex || result.text || '';
    let confidence = result.confidence || 0;

    // Fallback: combine region texts if primary text is empty
    if (!text && result.regions) {
      const parts = result.regions.map(r => r.text).filter(Boolean);
      text = parts.join('\n');
      confidence = result.regions.reduce((s, r) => s + (r.confidence || 0), 0)
        / Math.max(result.regions.length, 1);
    }

    return {
      latex: text,
      text,
      confidence,
      regions: result.regions || [],
      error: result.error,
    };
  },
});
