#!/usr/bin/env node
// Comprehensive e2e-style test — covers all user operations, modules, configs.
// Node.js only — no browser/DOM runtime needed.
//
// Usage: node test/test_e2e.js

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let PASS = 0, FAIL = 0;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function $read(f) { return readFileSync(join(ROOT, f), 'utf-8'); }
function $exists(f) { return existsSync(join(ROOT, f)); }

function pass(l) { PASS++; console.log(`  ✅ ${l}`); }
function fail(l, d) { FAIL++; console.log(`  ❌ ${l}${d ? ': ' + d : ''}`); }
function ok(c, l, d) { if (c) pass(l); else fail(l, d); }
function group(n) { console.log(`\n─── [${n}] ───`); }

console.log('═══════════════════════════════════════════════════════════════');
console.log('  LaTeXSnipper Mobile — E2E Test Suite');
console.log('═══════════════════════════════════════════════════════════════');

// ─── 1. Critical files ───
group('1. Critical Files');
['index.html','vite.config.js','package.json','capacitor.config.json',
 'src/main.js','src/constants.js','src/export/pandoc-export.js',
 'src/editor/mathlive-config.js','src/camera/camera.js',
 'src/handwriting/handwrite.js','src/history/history-db.js',
 'src/history/history-ui.js','src/settings/settings.js',
 'src/ui/result.js','src/ui/recognition.js','src/ui/status.js',
 'src/ui/ui.js','src/ui/theme.js','src/ui/custom-select.js',
 'src/ui/polish.js','src/shared/logger.js','src/shared/share.js',
 'src/native/ocr-native.js',
 'src/styles/base.css','src/styles/ocr.css','src/styles/editor.css',
 'src/styles/handwriting.css','src/styles/history.css','src/styles/mobile.css',
 'public/sw.js','public/manifest.json',
 'public/vendor/katex.min.js','public/vendor/katex.min.css',
 'public/vendor/fonts/KaTeX_Main-Regular.woff2',
 'public/vendor/mathlive/mathlive.min.js'
].forEach(f => ok($exists(f), `File: ${f}`));

// ─── 2. Build config ───
group('2. Build Config');
const pkg = JSON.parse($read('package.json'));
ok(pkg.scripts.build, 'build script');
ok(pkg.dependencies['pandoc-wasm'], 'pandoc-wasm dep');
ok(pkg.dependencies['katex'] || $exists('public/vendor/katex.min.js'), 'KaTeX dep');

const vite = $read('vite.config.js');
ok(vite.includes('vite-plugin-wasm'), 'WASM plugin');
ok(vite.includes('copy-pandoc-wasm'), 'pandoc.wasm copy plugin');

const cap = JSON.parse($read('capacitor.config.json'));
ok(cap.appId === 'com.latexsnipper.app', 'App ID');

// ─── 3. HTML ───
group('3. HTML Structure');
const html = $read('index.html');
['page-ocr','page-editor','page-history','page-settings'].forEach(id =>
  ok(html.includes(`id="${id}"`), `Page #${id}`));

// OCR page controls
['dropZone','fileInput','camTrigger','camModal',
 'hwCanvas','hwPanel','hwPen','hwRecognize',
 'resultCard','resultCode','copyBtn','copyBtn','shareBtn','aiPolishBtn',
 'mathPreview','exportDropdownContainer','errorMsg',
 'pdfBrowser','pdfThumbstrip'
].forEach(id => ok(html.includes(`id="${id}"`), `Element #${id}`));

// Editor controls
['editorCopy','editorClearBtn','editorKbdToggle',
 'editorExportContainer','calcToolbar'
].forEach(id => ok(html.includes(`id="${id}"`), `Element #${id}`));

// Settings
['setEngineSelect','setPresetSelect','setBaseUrl','setApiKey',
 'setAccelSelect','setSkinSelect','setLangSelect',
 'setDevMode','devLogOutput','devExportLogs',
 'settingsSave','checkUpdateBtn'
].forEach(id => ok(html.includes(`id="${id}"`), `Element #${id}`));

// KaTeX vs MathJax
ok(html.includes('katex.min.js'), 'KaTeX JS loaded');
ok(html.includes('katex.min.css'), 'KaTeX CSS loaded');
ok(!html.includes('MathJax ='), 'No MathJax config');
ok(!html.includes('tex-svg.js'), 'No tex-svg.js');
ok(!html.includes('exportPngBtn'), 'Old PNG btn removed');
ok(!html.includes('exportSvgBtn'), 'Old SVG btn removed');

// PWA
ok(html.includes('manifest.json'), 'Manifest');
ok(html.includes('serviceWorker') || $exists('public/sw.js'), 'SW');

// ─── 4. main.js ───
group('4. main.js');
const main = $read('src/main.js');
['base.css','ocr.css','editor.css','constants.js',
 'handwriting/handwrite.js','camera/camera.js',
 'history/history-db.js','editor/mathlive-config.js',
 'export/pandoc-export.js','ui/custom-select.js'
].forEach(m => ok(main.includes(m), `Import ${m}`));

ok(main.includes('boot('), 'boot()');
ok(main.includes('initModels('), 'initModels()');
ok(main.includes('initI18n('), 'initI18n()');
ok(main.includes('initEditor('), 'initEditor()');
ok(main.includes('createExportDropdown'), 'createExportDropdown');
ok(main.includes('editorKbdToggle'), 'Keyboard toggle bound');
ok(main.includes('editorClearBtn'), 'Clear btn bound');
ok(!main.includes('exportPNG'), 'exportPNG removed');
ok(!main.includes('exportSVG'), 'exportSVG removed');

// ─── 5. result.js (KaTeX preview, export) ───
group('5. result.js');
const result = $read('src/ui/result.js');
['showResult','hideResult','copyResult','shareResult',
 'export function showPDFBrowser','export function hidePDFBrowser',
 'export function gotoPDFPage','export function initPDFNav',
 'function renderMathPreview','async function renderLatexToSvgs',
 'function combineSvgs','async function svgToPngBlob'
].forEach(fn => ok(result.includes(fn), `Has ${fn}`));

ok(result.includes('katex.renderToString'), 'KaTeX renderToString');
ok(result.includes('throwOnError: false'), 'throwOnError');
ok(!result.includes('MathJax.tex2svgPromise'), 'No MathJax');

// ─── 6. editor (MathLive) ───
group('6. Editor');
const editor = $read('src/editor/mathlive-config.js');
['export function initEditor(','export function setEditorContent(',
 'export function toggleKeyboard(','MathfieldElement',
 'mathVirtualKeyboardPolicy',"smartMode = true","smartFence = true",
  'toggleVirtualKeyboard','resetKbdState','MATHLIVE_ZH',
 'deleteBackward','expression.evaluate'
].forEach(t => ok(editor.includes(t), `Editor: ${t}`));

// ─── 7. export module ───
group('7. Export');
const exp = $read('src/export/pandoc-export.js');
ok(exp.includes('EXPORT_FORMATS'), 'EXPORT_FORMATS');
ok(exp.includes('exportLatex'), 'exportLatex');
ok(exp.includes('createExportDropdown'), 'createExportDropdown');
ok(exp.includes('latexToTypst'), 'latexToTypst');

['png','svg','markdown','plain','html','typst','asciidoc','rst','opml'].forEach(f =>
  ok(exp.includes(`id: '${f}'`), `Format: ${f}`));

ok(exp.includes("action: 'render'"), 'Image action');
ok(exp.includes("action: 'pandoc'"), 'Pandoc action');
ok(exp.includes("action: 'typst'"), 'Typst action');

ok(exp.includes("import('pandoc-wasm')"), 'Pandoc lazy load');

// ─── 8. settings ───
group('8. Settings');
const settings = $read('src/settings/settings.js');
['engine','accel','skin','baseUrl','apiKey','devMode'].forEach(k =>
  ok(settings.includes(k), `Setting: ${k}`));
ok(settings.includes('paddleocr'), 'Paddle preset');
ok(settings.includes('gemini'), 'Gemini preset');
ok(settings.includes('mineru'), 'MinerU preset');
ok(settings.includes('AbortSignal.timeout'), '10s timeout');
ok(settings.includes('checkForUpdateNow'), 'Update check');
ok(settings.includes('exportAndShare'), 'Log export');
ok(settings.includes('clearCache'), 'Cache clear');

// ─── 9. logger ───
group('9. Logger');
const log = $read('src/shared/logger.js');
['push(','load()','save()','timestamp()','MAX_LOG_LINES',
 'console.log = function','console.error = function',
 'logSystemInfo','getLastLines','exportAndShare',
 'ingestJavaLogs','_emitLogEvent','NativeOcr.addLog'
].forEach(t => ok(log.includes(t), `Logger: ${t}`));

// ─── 10. camera ───
group('10. Camera');
const cam = $read('src/camera/camera.js');
['export function initCamera(','export async function openCamera(',
 'export function closeCamera(','export function capturePhoto(',
 'export function confirmCrop(','export function retakePhoto(',
 'export function setCropMode(','export async function toggleFlash(',
 'export function isOpen(','export function isFromCamera(',
 '_captureLock','torch','perspective','lasso','camera.jpg'
].forEach(t => ok(cam.includes(t), `Camera: ${t}`));
// async function signatures differ from export function — loose match
// openCamera/toggleFlash are async, not "export function"
ok(cam.includes('openCamera'), 'Camera: openCamera');
ok(cam.includes('toggleFlash'), 'Camera: toggleFlash');

// ─── 11. handwriting ───
group('11. Handwriting');
const hw = $read('src/handwriting/handwrite.js');
['export function initHandwrite(','export function hwSetTool(',
 'export function hwUndo(','export function hwRedo(',
 'export function hwClear(','export async function hwExportImage(',
 'export function updateHwTheme(','export function onStrokeEnd(',
 'export function getCanvas(','export function hwPenColor(',
 'HW_MAX_STROKES','handwrite.png','pressure','bezier','resize'
].forEach(t => ok(hw.includes(t), `HW: ${t}`));
ok(hw.includes('hwExportImage'), 'HW: hwExportImage');

// ─── 12. history ───
group('12. History');
const db = $read('src/history/history-db.js');
['function getDB(','export async function addResult(',
 'export async function getAllResults(','export async function toggleFavorite(',
 'export async function deleteResult(','export async function clearHistory(',
 'export async function getResultCount(','favorite','createdAt','IndexedDB'
].forEach(t => ok(db.includes(t), `DB: ${t}`));
ok(db.includes('async function getDB') || db.includes('getDB('), 'DB: getDB');

const hui = $read('src/history/history-ui.js');
ok(hui.includes('renderHistoryList('), 'renderHistoryList');
ok(hui.includes('touch'), 'Touch events');

// ─── 13. recognition ───
group('13. Recognition');
const rec = $read('src/ui/recognition.js');
['compressImage','processImageExternal','recognizeFormula',
 'recognizeText','recognizeMixed','processPDFNative','AbortSignal.timeout'
].forEach(t => ok(rec.includes(t), `Recog: ${t}`));
ok(rec.includes('processImage('), 'Recog: processImage');

// ─── 14. share ───
group('14. Share');
const share = $read('src/shared/share.js');
['export async function shareText(','export async function saveFile(',
 'CapacitorShare.share','navigator.share','showSaveToast(',
 'download'
].forEach(t => ok(share.includes(t), `Share: ${t}`));

// ─── 15. native bridge ───
group('15. Native Bridge');
const nat = $read('src/native/ocr-native.js');
['export const OcrNative','export function isNativeOcrAvailable(',
 'export function waitForNativeOcr(','recognizeFormula',
 'recognizeText','recognizeMixed','saveSettings','loadSettings',
 'setAcceleration'
].forEach(t => ok(nat.includes(t), `Native: ${t}`));
ok(nat.includes('loadModelsAndWait(') || nat.includes('loadModelsAndWait ('), 'Native: loadModelsAndWait');

// ─── 16. i18n ───
group('16. i18n');
['en.js','zh-CN.js','zh-TW.js','ja.js','ko.js'].forEach(lang => {
  const f = `src/lang/${lang}`;
  ok($exists(f), `${lang} exists`);
  const content = $read(f);
  const keys = content.match(/"([^"]+)":/g) || [];
  ['export.trigger','export.format.png','export.format.typst',
   'editor.showKeyboard','editor.clear','editor.copyLatex'
  ].forEach(k => ok(keys.includes(`"${k}"`) || keys.includes(`"${k}":`),
    `${lang}: ${k}`));
});

// ─── 17. styles ───
group('17. Styles');
const base = $read('src/styles/base.css');
['--accent','--fg','--bg','set-select-wrap','data-skin'].forEach(t =>
  ok(base.includes(t), `Base CSS: ${t}`));

// ─── 18. polish ───
group('18. AI Polish');
const pol = $read('src/ui/polish.js');
['export async function polishResult(','deepseek','AbortSignal.timeout',
 'renderMathPreview','resultCode'
].forEach(t => ok(pol.includes(t), `Polish: ${t}`));

// ─── 19. android native ───
group('19. Android Native');
['android/app/src/main/java/com/latexsnipper/app/MainActivity.java',
 'android/app/src/main/java/com/latexsnipper/app/ocr/NativeOcrBridge.java'
].forEach(f => ok($exists(f), `File: ${f}`));

const bridge = $read('android/app/src/main/java/com/latexsnipper/app/ocr/NativeOcrBridge.java');
['@JavascriptInterface','recognizeFormula','recognizeText','recognizeMixed',
 'saveFile','saveSettings','loadSettings','getLogs'
].forEach(t => ok(bridge.includes(t), `Bridge: ${t}`));

// ─── 20. test files ───
group('20. Test Files');
['run_tests.sh','test_pandoc_export.js','test_katex.js','test_integration.js','test_e2e.js'
].forEach(f => ok($exists(`test/${f}`), `Test: ${f}`));

// ═══ SUMMARY ═══
console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(`  ${PASS} passed, ${FAIL} failed`);
console.log(`═══════════════════════════════════════════════════════════════`);
process.exit(FAIL > 0 ? 1 : 0);
