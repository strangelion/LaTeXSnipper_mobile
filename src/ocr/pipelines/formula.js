// Formula pipeline — detects and recognizes mathematical formulas.
// Delegates entirely to Java's OcrEngine.recognizeFormula().

import { OcrNative } from '../../native/ocr-native.js';
import { OcrPipeline } from '../pipeline.js';

export const formulaPipeline = new OcrPipeline('formula', {
  checkModels: () => {
    const s = window.__nativeModelStatus;
    return s?.formulaDet && s?.formulaRec;
  },

  run: async (image) => {
    const result = await OcrNative.recognizeFormula({ image });
    return {
      latex: result.latex || '',
      text: result.latex || '',
      confidence: result.confidence || 0,
      regions: result.regions || [],
      error: result.error,
    };
  },
});
