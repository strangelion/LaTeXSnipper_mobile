#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  attachCoreDocument,
  convertOcrResult,
  getCoreRuntimeStatus,
  initCoreRuntime,
} from '../src/core/core-runtime.js';
import { createBlock, createResult } from '../src/ocr/ocr-result.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✅ ${message}`);
}

const wasmUrl = new URL(
  '../node_modules/latexsnipper-wasm/latexsnipper_wasm_bg.wasm',
  import.meta.url,
);
const wasmInput = await readFile(fileURLToPath(wasmUrl));
const runtime = await initCoreRuntime({ wasmInput });

assert(runtime.info.ok, 'Core v3 API envelope is available');
assert(runtime.info.versions.coreVersion === '3.2.0', 'pinned Core version is 3.2.0');
assert(runtime.info.versions.documentSchemaVersion === '1.0.0', 'Document schema is compatible');
assert(getCoreRuntimeStatus().available, 'runtime status reports ready');

const mobileResult = createResult([
  createBlock('text', 'Result:', { confidence: 0.94, geometry: { x: 2, y: 3, w: 30, h: 8 } }),
  createBlock('formula', String.raw`\frac{a}{b}`, {
    confidence: 0.97,
    mathStyle: 'display',
    geometry: { x: 2, y: 15, w: 40, h: 16 },
  }),
], { confidence: 0.95, raw: String.raw`Result:\n\frac{a}{b}`, meta: { timeMs: 12 } });

const enriched = await attachCoreDocument(mobileResult, {
  width: 128,
  height: 96,
  model: 'mobile-test',
  pipelineVersion: '1.0.0',
});

assert(enriched.meta.core.available, 'Mobile result is accepted by Core');
assert(enriched.document.pages[0].blocks.length === 2, 'block structure is preserved in Core AST');
assert(enriched.document.pages[0].blocks[1].formula.source.content === String.raw`\frac{a}{b}`,
  'formula source remains editable LaTeX');

const latex = await convertOcrResult(enriched, 'latex');
const typst = await convertOcrResult(enriched, 'typst');
const markdown = await convertOcrResult(enriched, 'markdown_block');

assert(latex.text.includes(String.raw`\frac{a}{b}`), 'Core produces LaTeX from Mobile AST');
assert(typst.text.includes('a') && typst.text.includes('b'), 'Core produces Typst from Mobile AST');
assert(markdown.text.includes('Result:'), 'Core preserves mixed text during Markdown export');

console.log('\nCore Mobile integration contract passed.');
