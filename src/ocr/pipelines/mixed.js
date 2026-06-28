// Mixed pipeline — detects both formulas and text in a single image.
// Delegates entirely to Java's OcrEngine.recognizeMixed().

import { OcrNative } from '../ocr-native.js';
import { OcrPipeline } from '../pipeline.js';
import { createResult, createBlock } from '../ocr-result.js';

export const mixedPipeline = new OcrPipeline('mixed', {
  checkModels: () => {
    const s = window.__nativeModelStatus;
    return (s?.formulaDet && s?.formulaRec) || (s?.textDet && s?.textRec);
  },

  run: async (image) => {
    const result = await OcrNative.recognizeMixed({ image });
    if (result.error) {
      return { blocks: [], confidence: 0, raw: '', meta: {}, error: result.error };
    }

    const regions = result.regions || [];
    let text = result.formattedText || result.latex || result.text || '';
    let confidence = result.confidence || 0;

    // Build blocks from regions if available
    if (regions.length > 0) {
      const blocks = regions.map(r => {
        const type = r.type === 'formula' ? 'formula' : 'text';
        const block = createBlock(type, r.text || '', {
          confidence: r.confidence || confidence,
          geometry: r.bbox,
        });
        if (type === 'formula') {
          block.mathStyle = r.isolated ? 'display' : 'inline';
        }
        return block;
      });
      return createResult(blocks, { confidence, raw: text });
    }

    // Fallback: single text block
    if (!text && regions.length === 0) {
      return createResult([], { confidence, raw: '' });
    }

    return createResult(
      text ? [createBlock('text', text, { confidence })] : [],
      { confidence, raw: text }
    );
  },
});
