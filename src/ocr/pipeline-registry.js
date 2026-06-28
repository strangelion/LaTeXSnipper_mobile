// Pipeline registry — central index of available OCR pipelines.
// Pipelines are auto-discovered from pipelines/manifest.json.
// To add a new mode:
//   1. Create src/ocr/pipelines/<name>.js exporting an OcrPipeline
//   2. Add an entry to pipelines/manifest.json
//   No changes needed in recognition.js or the UI layer.

import pipelineManifest from './pipelines/manifest.json' with { type: 'json' };
import { getNativeModelStatus } from './ocr-native.js';

const loaded = new Map();
const loaders = new Map();

// Build loaders from manifest
for (const entry of pipelineManifest.pipelines) {
  loaders.set(entry.id, () =>
    import(entry.entry).then(m => m[entry.export])
  );
}

/**
 * Register a pipeline at runtime (for third-party or dynamic pipelines).
 * @param {string} name
 * @param {import('./pipeline.js').OcrPipeline | function} pipelineOrLoader
 */
export function registerPipeline(name, pipelineOrLoader) {
  if (typeof pipelineOrLoader === 'function') {
    loaders.set(name, pipelineOrLoader);
  } else {
    loaded.set(name, pipelineOrLoader);
    loaders.delete(name);
  }
}

/**
 * Get a pipeline by id. Loads lazily on first access.
 * @param {string} id
 * @returns {Promise<import('./pipeline.js').OcrPipeline | undefined>}
 */
export async function getPipeline(id) {
  if (loaded.has(id)) return loaded.get(id);
  const loader = loaders.get(id);
  if (!loader) return undefined;
  const pipeline = await loader();
  loaded.set(id, pipeline);
  return pipeline;
}

/**
 * List all registered pipeline ids (loaded + not-yet-loaded).
 * @returns {string[]}
 */
export function listPipelines() {
  return [...new Set([...loaders.keys(), ...loaded.keys()])];
}

/**
 * Get all loaded pipelines with their metadata.
 * @returns {Array<Object>}
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
 * @param {string} mode
 * @returns {boolean}
 */
export async function checkPipelineModels(mode) {
  const pipeline = await getPipeline(mode);
  if (!pipeline) return false;
  if (pipeline.meta.requiredModels.length === 0) return true;

  const status = getNativeModelStatus();
  if (!status) return false;

  const modelMap = {
    'formula-det': status.formulaDet,
    'formula-rec': status.formulaRec,
    'text-det': status.textDet,
    'text-rec': status.textRec,
  };

  if (mode === 'mixed') {
    return (modelMap['formula-det'] && modelMap['formula-rec']) ||
           (modelMap['text-det'] && modelMap['text-rec']);
  }

  return pipeline.meta.requiredModels.every(m => modelMap[m]);
}
