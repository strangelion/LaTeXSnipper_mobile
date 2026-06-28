// Formula pipeline — detects and recognizes mathematical formulas.
// Delegates entirely to Java's OcrEngine.recognizeFormula().

import { OcrNative } from '../ocr-native.js';
import { OcrPipeline } from '../pipeline.js';
import { createResult, createBlock } from '../ocr-result.js';

export const formulaPipeline = new OcrPipeline({
  id: 'formula',
  name: 'Formula Recognition',
  description: 'Detect and recognize mathematical formulas',
  icon: '📐',
  requiredModels: ['formula-det', 'formula-rec'],
  supportsPDF: true,
  supportsBatch: false,
}, {
  run: async (image) => {
    const result = await OcrNative.recognizeFormula({ image });
    if (result.error) {
      return { blocks: [], confidence: 0, raw: '', meta: {}, error: result.error };
    }
    const text = result.latex || '';
    const confidence = result.confidence || 0;
    const regions = result.regions || [];

    if (regions.length > 0) {
      const blocks = regions.map(r =>
        createBlock('formula', r.text || text, {
          confidence: r.confidence || confidence,
          geometry: r.bbox,
          mathStyle: 'display',
        })
      );
      return createResult(blocks, { confidence, raw: text });
    }

    return createResult(
      text ? [createBlock('formula', text, { confidence, mathStyle: 'display' })] : [],
      { confidence, raw: text }
    );
  },
});
