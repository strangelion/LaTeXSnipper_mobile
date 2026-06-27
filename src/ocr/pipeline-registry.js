// Pipeline registry — central index of available OCR pipelines.
// Add a new recognition mode by creating a pipeline file and calling registerPipeline().

import { formulaPipeline } from './pipelines/formula.js';
import { textPipeline } from './pipelines/text.js';
import { mixedPipeline } from './pipelines/mixed.js';

const pipelines = new Map();

// Built-in pipelines
pipelines.set('formula', formulaPipeline);
pipelines.set('text', textPipeline);
pipelines.set('mixed', mixedPipeline);

/**
 * Register a new OCR pipeline.
 * @param {string} name - Mode name (must match a .mode-tab data-mode value)
 * @param {import('./pipeline.js').OcrPipeline} pipeline
 */
export function registerPipeline(name, pipeline) {
  pipelines.set(name, pipeline);
}

/**
 * Get a pipeline by mode name.
 * @param {string} name
 * @returns {import('./pipeline.js').OcrPipeline | undefined}
 */
export function getPipeline(name) {
  return pipelines.get(name);
}

/**
 * List all registered pipeline names.
 * @returns {string[]}
 */
export function listPipelines() {
  return [...pipelines.keys()];
}
