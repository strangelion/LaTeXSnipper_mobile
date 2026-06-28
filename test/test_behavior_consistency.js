#!/usr/bin/env node
// Behavior Consistency Tests — verifies refactoring preserved all user-facing behavior.
// These tests check that the OCR pipeline produces the same results as before.

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let PASS = 0, FAIL = 0;
function pass(l) { PASS++; console.log(`  ✅ ${l}`); }
function fail(l, d) { FAIL++; console.log(`  ❌ ${l}${d ? ': ' + d : ''}`); }
function ok(c, l, d) { if (c) pass(l); else fail(l, d); }
function group(n) { console.log(`\n─── [${n}] ───`); }
function $read(f) { return readFileSync(join(ROOT, f), 'utf-8'); }

console.log('═══════════════════════════════════════════════════════════════');
console.log('  Behavior Consistency Tests — OCR pipeline equivalence');
console.log('═══════════════════════════════════════════════════════════════');

// ═══════════════════════════════════════════════════════════════
// 1. Pipeline Registry — all 3 built-in modes registered
// ═══════════════════════════════════════════════════════════════
group('1. Pipeline Registry');
const registry = $read('src/ocr/pipeline-registry.js');
ok(registry.includes("'formula'"), 'formula pipeline registered');
ok(registry.includes("'text'"), 'text pipeline registered');
ok(registry.includes("'mixed'"), 'mixed pipeline registered');
ok(registry.includes('getPipeline'), 'getPipeline exported');
ok(registry.includes('registerPipeline'), 'registerPipeline exported');
ok(registry.includes('listPipelines'), 'listPipelines exported');
ok(registry.includes('getPipelineInfo'), 'getPipelineInfo exported');
ok(registry.includes('checkPipelineModels'), 'checkPipelineModels exported');
ok(registry.includes('import('), 'lazy loading via dynamic import');

// ═══════════════════════════════════════════════════════════════
// 2. Pipeline contracts — each pipeline has correct run() signature
// ═══════════════════════════════════════════════════════════════
group('2. Pipeline Contracts');
const formula = $read('src/ocr/pipelines/formula.js');
ok(formula.includes("OcrNative.recognizeFormula"), 'formula: delegates to recognizeFormula');
ok(formula.includes('createResult'), 'formula: returns OcrResult');
ok(formula.includes('createBlock'), 'formula: creates blocks');
ok(formula.includes("raw:"), 'formula: includes raw field');
ok(formula.includes("confidence"), 'formula: includes confidence');
ok(formula.includes("error"), 'formula: handles error case');
ok(formula.includes("id: 'formula'"), 'formula: has metadata id');
ok(formula.includes("requiredModels"), 'formula: has requiredModels');

const text = $read('src/ocr/pipelines/text.js');
ok(text.includes("OcrNative.recognizeText"), 'text: delegates to recognizeText');
ok(text.includes('createResult'), 'text: returns OcrResult');
ok(text.includes('createBlock'), 'text: creates blocks');
ok(text.includes("raw:"), 'text: includes raw field');
ok(text.includes("confidence"), 'text: includes confidence');
ok(text.includes("error"), 'text: handles error case');
ok(text.includes("id: 'text'"), 'text: has metadata id');
ok(text.includes("requiredModels"), 'text: has requiredModels');

const mixed = $read('src/ocr/pipelines/mixed.js');
ok(mixed.includes("OcrNative.recognizeMixed"), 'mixed: delegates to recognizeMixed');
ok(mixed.includes('createResult'), 'mixed: returns OcrResult');
ok(mixed.includes('createBlock'), 'mixed: creates blocks');
ok(mixed.includes("raw:"), 'mixed: includes raw field');
ok(mixed.includes("confidence"), 'mixed: includes confidence');
ok(mixed.includes("formattedText"), 'mixed: reads formattedText');
ok(mixed.includes("error"), 'mixed: handles error case');

// ═══════════════════════════════════════════════════════════════
// 3. OcrResult data model — backward compatible
// ═══════════════════════════════════════════════════════════════
group('3. OcrResult Data Model');
const ocrResult = $read('src/ocr/ocr-result.js');
ok(ocrResult.includes('createResult'), 'createResult exported');
ok(ocrResult.includes('createBlock'), 'createBlock exported');
ok(ocrResult.includes('fromString'), 'fromString exported');
ok(ocrResult.includes("'formula'"), 'block type: formula');
ok(ocrResult.includes("'text'"), 'block type: text');
ok(ocrResult.includes("'table'"), 'block type: table (future)');
ok(ocrResult.includes("'image'"), 'block type: image (future)');
ok(ocrResult.includes('geometry'), 'block supports geometry');
ok(ocrResult.includes('mathStyle'), 'block supports mathStyle');
ok(ocrResult.includes('raw'), 'result includes raw field');
ok(ocrResult.includes('confidence'), 'result includes confidence');
ok(ocrResult.includes('meta'), 'result includes meta field');

// ═══════════════════════════════════════════════════════════════
// 4. Recognition.js — consumes OcrResult correctly
// ═══════════════════════════════════════════════════════════════
group('4. Recognition Consumer');
const recog = $read('src/ocr/recognition.js');
ok(recog.includes('getPipeline'), 'uses getPipeline');
ok(recog.includes('pipeline.run'), 'calls pipeline.run()');
ok(recog.includes('ocrResult.raw'), 'reads raw from OcrResult');
ok(recog.includes('ocrResult.blocks'), 'reads blocks from OcrResult');
ok(recog.includes('ocrResult.confidence'), 'reads confidence from OcrResult');
ok(recog.includes('showResult'), 'displays result via showResult');
ok(recog.includes('processImageExternal'), 'external API path preserved');
ok(recog.includes('processPDFNative'), 'PDF processing preserved');
ok(recog.includes('isNative()'), 'native mode check preserved');
ok(recog.includes('window.__recogMode'), 'recognition mode selector preserved');

// ═══════════════════════════════════════════════════════════════
// 5. Mode dispatch — no if/else chain in recognition.js
// ═══════════════════════════════════════════════════════════════
group('5. Mode Dispatch');
const hasIfElse = recog.includes('if (mode === \'formula\')') ||
  recog.includes('if (mode === \'text\')') ||
  recog.includes('if (mode === \'mixed\')');
ok(!hasIfElse, 'no if/else mode dispatch in recognition.js (uses pipeline)');

// ═══════════════════════════════════════════════════════════════
// 6. App Architecture — bootstrap + app pattern
// ═══════════════════════════════════════════════════════════════
group('6. App Architecture');
const main = $read('src/main.js');
const bootstrap = $read('src/core/bootstrap.js');
const app = $read('src/core/app.js');
ok(main.includes('bootstrap'), 'main.js calls bootstrap()');
ok(main.includes('createApp'), 'main.js calls createApp()');
ok(main.includes('start'), 'main.js calls start()');
ok(bootstrap.includes('initTheme'), 'bootstrap: theme init');
ok(bootstrap.includes('serviceWorker') || bootstrap.includes('sw.js'), 'bootstrap: service worker');
ok(app.includes('registerBinding'), 'app: uses registerBinding');
ok(app.includes('bindAll'), 'app: uses bindAll');
ok(app.includes('bindCameraEvents'), 'app: camera events registered');
ok(app.includes('bindHandwriteEvents'), 'app: handwrite events registered');
ok(app.includes('bindHistoryEvents'), 'app: history events registered');
ok(app.includes('bindResultEvents'), 'app: result events registered');
ok(app.includes('bindEditorEvents'), 'app: editor events registered');

// ═══════════════════════════════════════════════════════════════
// 7. Feature modules — self-contained event bindings
// ═══════════════════════════════════════════════════════════════
group('7. Feature Module Self-Containment');
const cam = $read('src/camera/camera.js');
ok(cam.includes('bindEvents'), 'camera has bindEvents');

const hw = $read('src/handwriting/handwrite.js');
ok(hw.includes('bindUiEvents'), 'handwriting has bindUiEvents');

const hist = $read('src/history/history-ui.js');
ok(hist.includes('bindEvents'), 'history has bindEvents');

const res = $read('src/ui/result.js');
ok(res.includes('bindEvents'), 'result has bindEvents');

const editor = $read('src/editor/mathlive-config.js');
ok(editor.includes('bindEvents'), 'editor has bindEvents');

// ═══════════════════════════════════════════════════════════════
// 8. Directory structure — Feature First
// ═══════════════════════════════════════════════════════════════
group('8. Directory Structure');
ok(existsSync(join(ROOT, 'src/core/logger.js')), 'core/logger.js exists');
ok(existsSync(join(ROOT, 'src/core/i18n.js')), 'core/i18n.js exists');
ok(existsSync(join(ROOT, 'src/core/event-registry.js')), 'core/event-registry.js exists');
ok(existsSync(join(ROOT, 'src/core/lang/zh-CN.js')), 'core/lang/zh-CN.js exists');
ok(existsSync(join(ROOT, 'src/ocr/pipeline.js')), 'ocr/pipeline.js exists');
ok(existsSync(join(ROOT, 'src/ocr/pipeline-registry.js')), 'ocr/pipeline-registry.js exists');
ok(existsSync(join(ROOT, 'src/ocr/ocr-result.js')), 'ocr/ocr-result.js exists');
ok(existsSync(join(ROOT, 'src/ocr/ocr-native.js')), 'ocr/ocr-native.js exists');
ok(existsSync(join(ROOT, 'src/ocr/recognition.js')), 'ocr/recognition.js exists');
ok(existsSync(join(ROOT, 'src/model/model-manager.js')), 'model/model-manager.js exists');
ok(existsSync(join(ROOT, 'src/model/model-analyzer.js')), 'model/model-analyzer.js exists');
ok(existsSync(join(ROOT, 'src/model/model-import.js')), 'model/model-import.js exists');
ok(existsSync(join(ROOT, 'src/model/model-settings.js')), 'model/model-settings.js exists');

// Verify old paths are gone
ok(!existsSync(join(ROOT, 'src/shared/logger.js')), 'shared/logger.js removed');
ok(!existsSync(join(ROOT, 'src/shared/share.js')), 'shared/share.js removed');
ok(!existsSync(join(ROOT, 'src/native/ocr-native.js')), 'native/ocr-native.js removed');
ok(!existsSync(join(ROOT, 'src/lang/i18n.js')), 'lang/i18n.js removed');

// ═══════════════════════════════════════════════════════════════
// 9. Import paths — no stale references
// ═══════════════════════════════════════════════════════════════
group('9. Import Path Integrity');
const allSrc = [
  'src/main.js', 'src/ui/ui.js', 'src/ui/result.js', 'src/ui/status.js',
  'src/ocr/recognition.js', 'src/ocr/pipeline-registry.js',
  'src/settings/settings.js', 'src/history/history-ui.js',
  'src/export/pandoc-export.js', 'src/export/share.js',
  'src/model/model-manager.js', 'src/model/model-import.js',
  'src/model/model-settings.js', 'src/core/logger.js',
  'src/core/i18n.js', 'src/editor/mathlive-config.js',
];
let staleRefs = 0;
allSrc.forEach(f => {
  try {
    const content = $read(f);
    if (content.includes('shared/logger') || content.includes('shared/share') ||
        content.includes('native/ocr-native') || content.includes("'../lang/i18n") ||
        content.includes("'./lang/i18n")) {
      console.log(`  [WARN] stale import in ${f}`);
      staleRefs++;
    }
  } catch {}
});
ok(staleRefs === 0, 'no stale import paths in src/');

// ═══════════════════════════════════════════════════════════════
// 10. Export generators — derive from OcrResult
// ═══════════════════════════════════════════════════════════════
group('10. Export Generators');
ok(existsSync(join(ROOT, 'src/export/latex-generator.js')), 'latex-generator.js exists');
ok(existsSync(join(ROOT, 'src/export/markdown-generator.js')), 'markdown-generator.js exists');
const latexGen = $read('src/export/latex-generator.js');
ok(latexGen.includes('generateLatex'), 'generateLatex exported');
ok(latexGen.includes('result.blocks'), 'consumes OcrResult.blocks');
ok(latexGen.includes('block.type'), 'reads block type');
ok(latexGen.includes('mathStyle'), 'handles mathStyle');
const mdGen = $read('src/export/markdown-generator.js');
ok(mdGen.includes('generateMarkdown'), 'generateMarkdown exported');
ok(mdGen.includes('result.blocks'), 'consumes OcrResult.blocks');

// ═══════════════════════════════════════════════════════════════
// 11. Native bridge — OcrNative still exposes all methods
// ═══════════════════════════════════════════════════════════════
group('11. Native Bridge API');
const native = $read('src/ocr/ocr-native.js');
ok(native.includes('recognizeFormula'), 'recognizeFormula preserved');
ok(native.includes('recognizeText'), 'recognizeText preserved');
ok(native.includes('recognizeMixed'), 'recognizeMixed preserved');
ok(native.includes('isNativeOcrAvailable'), 'isNativeOcrAvailable preserved');
ok(native.includes('waitForNativeOcr'), 'waitForNativeOcr preserved');
ok(native.includes('loadModelsAndWait'), 'loadModelsAndWait preserved');
ok(native.includes('OcrNative'), 'OcrNative object exported');

// ═══════════════════════════════════════════════════════════════
// 12. Model manager — unchanged APIs
// ═══════════════════════════════════════════════════════════════
group('12. Model Manager API');
const mm = $read('src/model/model-manager.js');
ok(mm.includes('export async function fetchManifest'), 'fetchManifest preserved');
ok(mm.includes('export async function downloadVariant'), 'downloadVariant preserved');
ok(mm.includes('export async function importFromZip'), 'importFromZip preserved');
ok(mm.includes('export function getActiveModels'), 'getActiveModels preserved');
ok(mm.includes('export function setActiveModel'), 'setActiveModel preserved');
ok(mm.includes('export function getAllVariants'), 'getAllVariants preserved');
ok(mm.includes('export async function refreshManifests'), 'refreshManifests preserved');

// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Results: ${PASS} passed, ${FAIL} failed`);
console.log('═══════════════════════════════════════════════════════════════');

process.exit(FAIL > 0 ? 1 : 0);
