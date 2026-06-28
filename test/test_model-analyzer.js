// Test model-analyzer.js — inferCategory with synthetic shapes

import { inferCategory } from '../src/model/model-analyzer.js';

function testInferFormulaDet() {
  const result = inferCategory(
    [{ name: 'images', dims: [1, 3, 768, 768] }],
    [{ name: 'output', dims: [1, 6, 8400] }],
    ['Conv', 'Slice', 'Concat']
  );
  console.assert(result.name === 'formula-det', `Expected formula-det, got ${result.name}`);
  console.assert(result.confidence >= 0.7, 'Should have reasonable confidence');
  console.log('testInferFormulaDet PASSED');
}

function testInferFormulaRecEncoder() {
  const result = inferCategory(
    [{ name: 'pixel_values', dims: [1, 3, 384, 384] }],
    [{ name: 'last_hidden_state', dims: [1, 577, 384] }],
    ['MatMul', 'Softmax']
  );
  console.assert(result.name === 'formula-rec-encoder', `Expected formula-rec-encoder, got ${result.name}`);
  console.log('testInferFormulaRecEncoder PASSED');
}

function testInferFormulaRecDecoder() {
  const result = inferCategory(
    [
      { name: 'input_ids', dims: [1, 32] },
      { name: 'encoder_hidden_states', dims: [1, 577, 384] },
    ],
    [{ name: 'logits', dims: [1, 32, 50000] }],
    ['MatMul', 'Softmax']
  );
  console.assert(result.name === 'formula-rec-decoder', `Expected formula-rec-decoder, got ${result.name}`);
  console.log('testInferFormulaRecDecoder PASSED');
}

function testInferTextDet() {
  const result = inferCategory(
    [{ name: 'input', dims: [1, 3, 960, 960] }],
    [{ name: 'output', dims: [1, 1, 960, 960] }],
    ['Conv']
  );
  console.assert(result.name === 'text-det', `Expected text-det, got ${result.name}`);
  console.log('testInferTextDet PASSED');
}

function testInferTextRec() {
  const result = inferCategory(
    [{ name: 'input', dims: [1, 3, 48, 320] }],
    [{ name: 'output', dims: [1, 40, 6625] }],
    ['Conv', 'MatMul']
  );
  console.assert(result.name === 'text-rec', `Expected text-rec, got ${result.name}`);
  console.log('testInferTextRec PASSED');
}

function testInferRegionDet() {
  const result = inferCategory(
    [{ name: 'input', dims: [1, 3, 64, 64] }],
    [{ name: 'output', dims: [1, 2] }],
    ['Conv']
  );
  console.assert(result.name === 'region-det', `Expected region-det, got ${result.name}`);
  console.log('testInferRegionDet PASSED');
}

function testInferDocOri() {
  const result = inferCategory(
    [{ name: 'input', dims: [1, 3, 224, 224] }],
    [{ name: 'output', dims: [1, 4] }],
    ['Conv']
  );
  console.assert(result.name === 'doc-ori', `Expected doc-ori, got ${result.name}`);
  console.log('testInferDocOri PASSED');
}

function testInferUnknown() {
  const result = inferCategory(
    [{ name: 'input', dims: [1, 3, 100, 100] }],
    [{ name: 'output', dims: [1, 1000] }],
    ['Conv']
  );
  console.assert(result.name === 'unknown', `Expected unknown, got ${result.name}`);
  console.log('testInferUnknown PASSED');
}

// Run all tests
testInferFormulaDet();
testInferFormulaRecEncoder();
testInferFormulaRecDecoder();
testInferTextDet();
testInferTextRec();
testInferRegionDet();
testInferDocOri();
testInferUnknown();
console.log('\n=== All model-analyzer tests passed ===');
