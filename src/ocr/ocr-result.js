// OcrResult — structured data model for OCR output.
// All export formats (LaTeX, Markdown, Typst, OMML) derive from this.

/**
 * @typedef {Object} OcrBlock
 * @property {'formula'|'text'|'table'|'image'} type
 * @property {string} content - LaTeX/Text content
 * @property {number} confidence
 * @property {Object} [geometry] - Bounding box {x, y, w, h}
 * @property {'display'|'inline'} [mathStyle] - For formula blocks
 * @property {OcrBlock[]} [children] - Nested blocks (e.g., table cells)
 */

/**
 * @typedef {Object} OcrResult
 * @property {OcrBlock[]} blocks
 * @property {number} confidence - Overall confidence (0-1)
 * @property {string} raw - Raw text output (backward compat)
 * @property {Object} meta - Pipeline-specific metadata
 */

export function createResult(blocks, { confidence = 0, raw = '', meta = {} } = {}) {
  return { blocks, confidence, raw, meta };
}

export function createBlock(type, content, opts = {}) {
  return { type, content, confidence: opts.confidence || 0, ...opts };
}

/** Legacy string → OcrResult */
export function fromString(text, confidence = 0) {
  if (!text) return createResult([], { confidence });
  return createResult([createBlock('text', text, { confidence })], { confidence, raw: text });
}
