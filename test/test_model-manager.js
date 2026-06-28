// Test model-manager.js core functionality (ES module)

// Mock localStorage for Node.js
const storage = {};
global.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, value) => { storage[key] = value; },
  removeItem: (key) => { delete storage[key]; },
};

import {
  validateManifest,
  parseManifest,
  getSources,
  addSource,
  removeSource,
  getActiveModels,
  setActiveModel,
  getInstalledModels,
  markInstalled,
  markUninstalled,
  getAllVariants,
  MODEL_CATEGORIES,
} from '../src/model/model-manager.js';

function testValidateManifest() {
  const valid = {
    sourceId: 'test',
    sourceLabel: 'Test Pack',
    version: '1.0.0',
    categories: {
      'formula-det': {
        required: true,
        default: 'model-a',
        variants: [{ id: 'model-a', label: 'Model A', files: ['a.onnx'], sizeBytes: 1000 }]
      }
    }
  };
  const result = validateManifest(valid);
  console.assert(result.valid === true, 'Valid manifest should pass');

  const invalid = { sourceId: 'test' };
  const result2 = validateManifest(invalid);
  console.assert(result2.valid === false, 'Invalid manifest should fail');
  console.assert(result2.errors.length > 0, 'Should have error messages');

  console.log('testValidateManifest PASSED');
}

function testParseManifest() {
  const json = {
    sourceId: 'test',
    sourceLabel: 'Test',
    version: '1.0.0',
    categories: {
      'formula-det': {
        variants: [{ id: 'm1', label: 'M1', files: ['m1.onnx'], sizeBytes: 100 }]
      }
    }
  };
  const m = parseManifest(json);
  console.assert(m.sourceId === 'test', 'sourceId parsed');
  console.assert(m.baseUrl === '', 'baseUrl defaults to empty');
  console.assert(m.categories['formula-det'].variants.length === 1, 'variants parsed');

  console.log('testParseManifest PASSED');
}

function testSources() {
  const sources = getSources();
  console.assert(sources.length === 1, 'Default source exists');
  console.assert(sources[0].id === 'official', 'Official source present');
  console.assert(sources[0].builtin === true, 'Official is builtin');

  addSource({ id: 'custom1', label: 'Custom', url: 'https://example.com/manifest.json' });
  const after = getSources();
  console.assert(after.length === 2, 'Custom source added');

  removeSource('custom1');
  const afterRemove = getSources();
  console.assert(afterRemove.length === 1, 'Custom source removed');

  try {
    removeSource('official');
    console.assert(false, 'Should not remove builtin');
  } catch (e) {
    // expected
  }

  console.log('testSources PASSED');
}

function testActiveModels() {
  setActiveModel('formula-det', 'official', 'model-a');
  const active = getActiveModels();
  console.assert(active['formula-det'].variantId === 'model-a', 'Active model set');
  console.assert(active['formula-det'].sourceId === 'official', 'Source set');

  console.log('testActiveModels PASSED');
}

function testInstalledModels() {
  markInstalled('formula-rec', 'model-x', 'official', ['encoder.onnx', 'decoder.onnx']);
  const installed = getInstalledModels();
  console.assert(installed['formula-rec']['model-x'].files.length === 2, 'Files tracked');
  console.assert(installed['formula-rec']['model-x'].sourceId === 'official', 'Source tracked');

  markUninstalled('formula-rec', 'model-x');
  const after = getInstalledModels();
  console.assert(!after['formula-rec'] || !after['formula-rec']['model-x'], 'Uninstalled');

  console.log('testInstalledModels PASSED');
}

function testGetAllVariants() {
  const m1 = {
    sourceId: 's1', sourceLabel: 'S1', version: '1.0.0',
    categories: {
      'formula-rec': {
        default: 'model-a',
        variants: [
          { id: 'model-a', label: 'A', files: ['a.onnx'], sizeBytes: 1000 },
          { id: 'model-b', label: 'B', files: ['b.onnx'], sizeBytes: 2000 },
        ]
      }
    }
  };
  const m2 = {
    sourceId: 's2', sourceLabel: 'S2', version: '1.0.0',
    categories: {
      'formula-rec': {
        variants: [
          { id: 'model-b', label: 'B-v2', files: ['b2.onnx'], sizeBytes: 2500 },
          { id: 'model-c', label: 'C', files: ['c.onnx'], sizeBytes: 3000 },
        ]
      }
    }
  };
  const merged = getAllVariants([m1, m2]);
  const frVariants = merged['formula-rec'].variants;
  console.assert(frVariants.length === 3, `Expected 3 variants, got ${frVariants.length}`);

  const mb = frVariants.find(v => v.id === 'model-b');
  console.assert(mb.sourceId === 's1', 'First source wins for duplicate');
  console.assert(mb.label === 'B', 'First source label preserved');

  const mc = frVariants.find(v => v.id === 'model-c');
  console.assert(mc.sourceId === 's2', 'Second source variant present');

  console.log('testGetAllVariants PASSED');
}

function testModelCategories() {
  console.assert(MODEL_CATEGORIES.length === 6, '6 model categories');
  console.assert(MODEL_CATEGORIES.includes('formula-det'), 'formula-det exists');
  console.assert(MODEL_CATEGORIES.includes('formula-rec'), 'formula-rec exists');
  console.log('testModelCategories PASSED');
}

// Run all tests
testValidateManifest();
testParseManifest();
testSources();
testActiveModels();
testInstalledModels();
testGetAllVariants();
testModelCategories();
console.log('\n=== All model-manager tests passed ===');
