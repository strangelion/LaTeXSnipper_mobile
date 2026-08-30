#!/usr/bin/env node

import { attachCoreDocument } from '../src/core/core-runtime.js';
import { createBlock, createResult } from '../src/ocr/ocr-result.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✅ ${message}`);
}

const original = createResult([
  createBlock('formula', String.raw`x^2`, { confidence: 0.91 }),
], { confidence: 0.91, raw: String.raw`x^2` });

const enriched = await attachCoreDocument(original, {
  coreOptions: { wasmInput: new Uint8Array([0x00]) },
});

assert(enriched.raw === original.raw, 'Core initialization failure preserves OCR text');
assert(enriched.blocks === original.blocks, 'Core initialization failure preserves OCR blocks');
assert(enriched.document?.pages?.[0]?.blocks?.length === 1,
  'canonical document remains available for later recovery');
assert(enriched.meta.core.available === false, 'Core failure is explicit in result metadata');
assert(Boolean(enriched.meta.core.error), 'Core failure includes a diagnostic message');

console.log('\nCore failure fallback contract passed.');
