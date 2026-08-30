// OcrPipeline — pluggable detection → recognition → formatting chain.
//
// Each pipeline wraps a full recognition flow (e.g. formula, text, mixed).
// Currently delegates to Java's NativeOcrBridge; in the future, individual
// nodes (detect, recognize, format) could become independent, swappable units.
//
// To add a new mode:
//   1. Create src/ocr/pipelines/<name>.js exporting a pipeline
//   2. Register it in pipeline-registry.js
//   No changes needed in recognition.js or the UI layer.

export class OcrPipeline {
  /**
   * @param {Object} meta - Pipeline metadata
   * @param {string} meta.id - Unique identifier (matches UI mode tabs)
   * @param {string} meta.name - Display name
   * @param {string} meta.description - Short description
   * @param {string} [meta.icon] - Icon identifier
   * @param {string[]} [meta.requiredModels] - Model categories needed
   * @param {boolean} [meta.supportsPDF] - Can process PDF files
   * @param {boolean} [meta.supportsBatch] - Can process multiple images
   * @param {string} [meta.version] - Pipeline version
   * @param {Object} opts
   * @param {function} opts.run - async (image, context) => OcrResult
   */
  constructor(meta, { run } = {}) {
    this.meta = {
      id: meta.id,
      name: meta.name || meta.id,
      description: meta.description || '',
      icon: meta.icon || '🔍',
      requiredModels: meta.requiredModels || [],
      supportsPDF: meta.supportsPDF ?? false,
      supportsBatch: meta.supportsBatch ?? false,
      version: meta.version || '1.0.0',
    };
    this.name = this.meta.id; // backward compat
    this._run = run;
  }

  /** Pipeline identifier */
  get id() { return this.meta.id; }

  /**
   * Execute the pipeline.
   * @param {string} image - base64 data URI
   * @param {Object} [context] - extra context (e.g. file metadata)
   * @returns {Promise<OcrResult>}
   */
  async run(image, context = {}) {
    const result = await this._run(image, context);
    if (!result || result.error) return result;

    // Core owns the post-recognition document contract and semantic exports.
    // Android inference remains in the production Java ONNX path until Core
    // ships a non-stub Android runtime.
    const { attachCoreDocument } = await import('../core/core-runtime.js');
    return attachCoreDocument(result, {
      ...context,
      mode: this.meta.id,
      model: `mobile-${this.meta.id}`,
      pipelineVersion: this.meta.version,
    });
  }
}
