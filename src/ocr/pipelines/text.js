// Text pipeline — detects and recognizes printed/handwritten text.
// Delegates entirely to Java's OcrEngine.recognizeText().

import { OcrNative } from '../../native/ocr-native.js';
import { OcrPipeline } from '../pipeline.js';

export const textPipeline = new OcrPipeline('text', {
  checkModels: () => {
    const s = window.__nativeModelStatus;
    return s?.textDet && s?.textRec;
  },

  run: async (image) => {
    const result = await OcrNative.recognizeText({ image });
    return {
      latex: result.text || '',
      text: result.text || '',
      confidence: result.confidence || 0,
      regions: result.regions || [],
      error: result.error,
    };
  },
});
