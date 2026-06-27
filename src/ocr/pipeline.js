// OcrPipeline — pluggable detection → recognition → formatting chain.
//
// Each named pipeline wraps a full recognition flow (e.g. formula, text, mixed).
// Currently delegates to Java's NativeOcrBridge; in the future, individual
// nodes (detect, recognize, format) could become independent, swappable units.
//
// To add a new mode:
//   1. Create src/ocr/pipelines/<name>.js exporting a pipeline
//   2. Register it in pipeline-registry.js
//   No changes needed in recognition.js or the UI layer.

export class OcrPipeline {
  /**
   * @param {string} name - Pipeline identifier (matches UI mode tabs)
   * @param {Object} opts
   * @param {function} opts.run - async (image, context) => OcrResult
   * @param {function} [opts.checkModels] - () => boolean — are required models loaded?
   */
  constructor(name, { run, checkModels } = {}) {
    this.name = name;
    this._run = run;
    this.checkModels = checkModels || (() => true);
  }

  /**
   * Execute the pipeline.
   * @param {string} image - base64 data URI
   * @param {Object} [context] - extra context (e.g. file metadata)
   * @returns {Promise<OcrResult>}
   */
  async run(image, context = {}) {
    return this._run(image, context);
  }
}
