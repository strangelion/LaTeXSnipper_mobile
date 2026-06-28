// Pipeline registry — central index of available OCR pipelines.
// Supports lazy loading: pipelines are loaded on first use, not at startup.
//
// To add a new mode:
//   1. Create src/ocr/pipelines/<name>.js
//   2. Add a lazy entry below
//   No changes needed in recognition.js or the UI layer.

import { getNativeModelStatus } from './ocr-native.js';

const lazyLoaders = new Map();
const loaded = new Map();

// Built-in pipeline loaders (lazy)
lazyLoaders.set('formula', () => import('./pipelines/formula.js').then(m => m.formulaPipeline));
lazyLoaders.set('text', () => import('./pipelines/text.js').then(m => m.textPipeline));
lazyLoaders.set('mixed', () => import('./pipelines/mixed.js').then(m => m.mixedPipeline));

// Future pipelines can be added here:
// lazyLoaders.set('table', () => import('./pipelines/table.js').then(m => m.tablePipeline));

/**
 * Register a new OCR pipeline (eager or lazy).
 * @param {string} name
 * @param {import('./pipeline.js').OcrPipeline | function} pipelineOrLoader
 */
export function registerPipeline(name, pipelineOrLoader) {
  if (typeof pipelineOrLoader === 'function') {
    lazyLoaders.set(name, pipelineOrLoader);
  } else {
    loaded.set(name, pipelineOrLoader);
    lazyLoaders.delete(name);
  }
}

/**
 * Get a pipeline by mode name. Loads lazily on first access.
 * @param {string} name
 * @returns {Promise<import('./pipeline.js').OcrPipeline | undefined>}
 */
export async function getPipeline(name) {
  if (loaded.has(name)) return loaded.get(name);
  const loader = lazyLoaders.get(name);
  if (!loader) return undefined;
  const pipeline = await loader();
  loaded.set(name, pipeline);
  return pipeline;
}

/**
 * List all registered pipeline names.
 * @returns {string[]}
 */
export function listPipelines() {
  return [...new Set([...lazyLoaders.keys(), ...loaded.keys()])];
}

/**
 * Get all loaded pipelines with their metadata.
 * @returns {Array<{id: string, name: string, description: string, icon: string}>}
 */
export async function getPipelineInfo() {
  const ids = listPipelines();
  const infos = [];
  for (const id of ids) {
    const p = await getPipeline(id);
    if (p) infos.push({ ...p.meta });
  }
  return infos;
}

/**
 * Centralized model availability check.
 * Returns true if any of the pipeline's required models are loaded.
 * @param {string} mode
 * @returns {boolean}
 */
export async function checkPipelineModels(mode) {
  const pipeline = await getPipeline(mode);
  if (!pipeline) return false;
  if (pipeline.meta.requiredModels.length === 0) return true;

  const status = await getNativeModelStatus();
  if (!status) return false;

  const modelMap = {
    'formula-det': status.formulaDet,
    'formula-rec': status.formulaRec,
    'text-det': status.textDet,
    'text-rec': status.textRec,
  };

  // For mixed mode, require at least one model set
  if (mode === 'mixed') {
    return (modelMap['formula-det'] && modelMap['formula-rec']) ||
           (modelMap['text-det'] && modelMap['text-rec']);
  }

  return pipeline.meta.requiredModels.every(m => modelMap[m]);
}
