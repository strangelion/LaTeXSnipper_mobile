// Text pipeline — detects and recognizes printed/handwritten text.
// Delegates entirely to Java's OcrEngine.recognizeText().

import { OcrNative } from '../ocr-native.js';
import { OcrPipeline } from '../pipeline.js';
import { createResult, createBlock } from '../ocr-result.js';

export const textPipeline = new OcrPipeline({
  id: 'text',
  name: 'Text Recognition',
  description: 'Detect and recognize printed or handwritten text',
  icon: '📝',
  requiredModels: ['text-det', 'text-rec'],
  supportsPDF: true,
  supportsBatch: false,
}, {
  run: async (image) => {
    const result = await OcrNative.recognizeText({ image });
    if (result.error) {
      return { blocks: [], confidence: 0, raw: '', meta: {}, error: result.error };
    }
    const text = result.text || '';
    const confidence = result.confidence || 0;
    const regions = result.regions || [];

    if (regions.length > 0) {
      const blocks = regions.map(r =>
        createBlock('text', r.text || text, {
          confidence: r.confidence || confidence,
          geometry: r.bbox,
        })
      );
      return createResult(blocks, { confidence, raw: text });
    }

    return createResult(
      text ? [createBlock('text', text, { confidence })] : [],
      { confidence, raw: text }
    );
  },
});
