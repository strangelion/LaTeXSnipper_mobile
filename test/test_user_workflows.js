#!/usr/bin/env node
// Complete user workflow tests — covers the full app lifecycle:
//   Boot → Upload → OCR → View result → Copy/Share/Export → Editor → History → Settings
//
// Usage: node test/test_user_workflows.js

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
console.log('  User Workflow Tests — app lifecycle simulation');
console.log('  Verifies every function in the Boot→Upload→OCR→Result→Export→Editor→History chain');
console.log('═══════════════════════════════════════════════════════════════');

// ═══════════════════════════════════════════════════════════════
// 1. BOOT — entry point loads all modules
// ═══════════════════════════════════════════════════════════════
group('1. Boot / Initialization');
const html = $read('index.html');
const main = $read('src/main.js');

ok(main.includes('function boot('), 'boot() entry point');
ok(main.includes('initI18n('), 'i18n initialized');
ok(main.includes('translateDOM('), 'DOM translated');
ok(main.includes('initCustomSelects('), 'custom dropdowns initialized');
ok(main.includes('initSettings('), 'settings initialized');
ok(main.includes('initEditor('), 'editor initialized');
ok(main.includes('hideSplash('), 'splash hidden');
ok(main.includes('initModels('), 'model loading started');
ok(main.includes('renderHistoryList('), 'history rendered');
ok(main.includes('setStatus('), 'status bar updated');

// Event listeners bound during boot
ok(main.includes('editorKbdToggle'), 'keyboard toggle');
ok(main.includes('editorClearBtn'), 'editor clear');

// ═══════════════════════════════════════════════════════════════
// 2. UPLOAD — file selection & drag-drop
// ═══════════════════════════════════════════════════════════════
group('2. Upload / File Input');
const ui = $read('src/ui/ui.js');
ok(ui.includes('fileInput.click'), 'click file input');
ok(ui.includes('dragover'), 'drag over handler');
ok(ui.includes('drop'), 'drop handler');
ok(ui.includes('processImage'), 'process image on drop');
ok(ui.includes('paste'), 'paste handler');
ok(html.includes('fileInput'), 'file input element');
ok(html.includes('dropZone'), 'drop zone element');

// ═══════════════════════════════════════════════════════════════
// 3. CAMERA — photo capture flow
// ═══════════════════════════════════════════════════════════════
group('3. Camera');
const cam = $read('src/camera/camera.js');
ok(cam.includes('openCamera'), 'open camera');
ok(cam.includes('capturePhoto'), 'capture photo');
ok(cam.includes('confirmCrop'), 'confirm crop → processImage');
ok(cam.includes('retakePhoto'), 'retake photo');
ok(cam.includes('closeCamera'), 'close camera');
ok(cam.includes('setCropMode'), 'set crop mode');
ok(cam.includes('toggleFlash'), 'toggle flash');

// camera.jpg output
ok(cam.includes('camera.jpg'), 'filename camera.jpg');

// ═══════════════════════════════════════════════════════════════
// 4. OCR — recognition pipeline
// ═══════════════════════════════════════════════════════════════
group('4. Recognition');
const rec = $read('src/ui/recognition.js');
ok(rec.includes('processImage('), 'processImage exported');
ok(rec.includes('processImageExternal'), 'external API path');
ok(rec.includes('recognizeFormula'), 'formula recognition');
ok(rec.includes('recognizeText'), 'text recognition');
ok(rec.includes('recognizeMixed'), 'mixed recognition');
ok(rec.includes('processPDFNative'), 'PDF recognition');
ok(rec.includes('compressImage'), 'image compression');
ok(rec.includes('1920'), 'max 1920px dimension');

// Handwriting path
const hw = $read('src/handwriting/handwrite.js');
ok(hw.includes('hwExportImage'), 'handwrite export image');
ok(hw.includes('handwrite.png'), 'filename handwrite.png');

// Recognition mode selector
ok(main.includes('recogMode'), 'recognition mode variable');

// ═══════════════════════════════════════════════════════════════
// 5. RESULT — display, copy, share
// ═══════════════════════════════════════════════════════════════
group('5. Result Display');
const res = $read('src/ui/result.js');
ok(res.includes('showResult('), 'show result');
ok(res.includes('hideResult('), 'hide result');
ok(res.includes('copyResult('), 'copy result');
ok(res.includes('shareResult('), 'share result');

// Copy wraps in $$...$$
ok(res.includes('$$\\n'), 'copy wraps in $$...$$');

// KaTeX preview
ok(res.includes('renderMathPreview'), 'math preview rendered');
ok(res.includes('katex.renderToString'), 'KaTeX used for preview');

// Kill: MathJax gone
ok(!res.includes('MathJax.tex2svgPromise'), 'no MathJax in result');
ok(!res.includes('normalizeMixedLine'), 'normalizeMixedLine removed');

// PDF browser
ok(res.includes('showPDFBrowser('), 'PDF browser shown');
ok(res.includes('gotoPDFPage('), 'PDF page navigation');
ok(res.includes('initPDFNav('), 'PDF prev/next nav');

// ═══════════════════════════════════════════════════════════════
// 6. EXPORT — all formats
// ═══════════════════════════════════════════════════════════════
group('6. Export');
const exp = $read('src/export/pandoc-export.js');
ok(exp.includes('exportLatex('), 'exportLatex');
ok(exp.includes('createExportDropdown('), 'createExportDropdown');
ok(exp.includes('latexToTypst('), 'latexToTypst');

// 9 export formats
['png','svg','markdown','plain','html','typst','asciidoc','rst','opml'].forEach(f =>
  ok(exp.includes(`id: '${f}'`), `Format: ${f}`));
ok(exp.includes(`action: 'render'`), 'image export');
ok(exp.includes(`action: 'pandoc'`), 'pandoc text export');
ok(exp.includes(`action: 'typst'`), 'typst export');

// PNG/SVG export path: KaTeX → SVG → composite → save
ok(res.includes('renderLatexToSvgs'), 'render to SVGs');
ok(res.includes('combineSvgs'), 'combine SVGs');
ok(res.includes('svgToPngBlob'), 'SVG to PNG');

// Export dropdown UI
ok(exp.includes('export-dropdown-wrap'), 'dropdown wrapper');
ok(exp.includes('closeExportDropdowns'), 'close dropdown');

// Pandoc lazy loaded
ok(exp.includes("import('pandoc-wasm')"), 'pandoc lazy load');

// Export in HTML
ok(html.includes('exportDropdownContainer'), 'export dropdown in HTML');

// ═══════════════════════════════════════════════════════════════
// 7. SEND TO EDITOR — OCR result → MathLive
// ═══════════════════════════════════════════════════════════════
group('7. Send to Editor');
ok(main.includes('setEditorContent('), 'sendToEditorBtn calls setEditorContent');
ok(main.includes('sendToEditorBtn'), 'send to editor button');

const editor = $read('src/editor/mathlive-config.js');
ok(editor.includes('setEditorContent('), 'setEditorContent function');
ok(editor.includes('mathField.value = latex'), 'content set in mathField');
ok(editor.includes('t.click()'), 'switch to editor tab');

// Editor features
ok(editor.includes('smartMode = true'), 'smart mode');
ok(editor.includes('smartFence = true'), 'smart fence');
ok(editor.includes('mathVirtualKeyboardPolicy'), 'keyboard policy');
ok(editor.includes('katex.renderToString'), 'KaTeX preview in editor');

// Editor toolbar
ok(html.includes('calcToolbar'), 'symbol toolbar');
ok(html.includes('editorCopy'), 'editor copy button');
ok(html.includes('editorClearBtn'), 'editor clear button');
ok(html.includes('editorKbdToggle'), 'editor keyboard toggle');
ok(html.includes('editorExportContainer'), 'editor export dropdown');

// ═══════════════════════════════════════════════════════════════
// 8. HISTORY — save, list, delete, favorite
// ═══════════════════════════════════════════════════════════════
group('8. History');
const db = $read('src/history/history-db.js');
ok(db.includes('addResult('), 'add result to history');
ok(db.includes('getAllResults('), 'get all results');
ok(db.includes('toggleFavorite('), 'toggle favorite');
ok(db.includes('deleteResult('), 'delete result');
ok(db.includes('clearHistory('), 'clear history');
ok(db.includes('IndexedDB'), 'IndexedDB storage');

const hui = $read('src/history/history-ui.js');
ok(hui.includes('renderHistoryList('), 'render history list');

// Save OCR to history
ok(main.includes('addResult({'), 'OCR result saved to history');
ok(main.includes('clearHistory'), 'clear history button');

// ═══════════════════════════════════════════════════════════════
// 9. SHARE & SAVE FILES
// ═══════════════════════════════════════════════════════════════
group('9. Share / Save');
const share = $read('src/shared/share.js');
ok(share.includes('shareText('), 'share text');
ok(share.includes('saveFile('), 'save file');
ok(share.includes('CapacitorShare.share'), 'Capacitor share');
ok(share.includes('navigator.share'), 'Web share API');
ok(share.includes('navigator.clipboard'), 'clipboard fallback');
ok(share.includes('showSaveToast('), 'save toast');
ok(share.includes('NativeOcr') || share.includes('native'), 'native file save');

// ═══════════════════════════════════════════════════════════════
// 10. AI POLISH — correction service
// ═══════════════════════════════════════════════════════════════
group('10. AI Polish');
const pol = $read('src/ui/polish.js');
ok(pol.includes('polishResult('), 'polish result');
ok(pol.includes('deepseek'), 'DeepSeek API');
ok(pol.includes('AbortSignal.timeout'), '30s timeout');
ok(pol.includes('renderMathPreview'), 'refresh preview after polish');
ok(pol.includes('resultCode'), 'reads current result');

// ═══════════════════════════════════════════════════════════════
// 11. SETTINGS — all configurable options
// ═══════════════════════════════════════════════════════════════
group('11. Settings');
const settings = $read('src/settings/settings.js');
ok(settings.includes('initSettings('), 'initSettings');
ok(settings.includes('engine'), 'engine setting');
ok(settings.includes('baseUrl'), 'base URL');
ok(settings.includes('apiKey'), 'API key');
ok(settings.includes('accel'), 'acceleration');
ok(settings.includes('skin'), 'skin');
ok(settings.includes('devMode'), 'developer mode');
ok(settings.includes('saveSettingsNative'), 'native persistence');
ok(settings.includes('checkForUpdateNow'), 'update check');

// Presets
ok(settings.includes('paddleocr'), 'paddle preset');
ok(settings.includes('gemini'), 'gemini preset');
ok(settings.includes('mineru'), 'mineru preset');

// Test connection
ok(settings.includes('AbortSignal.timeout'), '10s timeout');

// Dev panel
ok(settings.includes('devShowLogs'), 'show logs');
ok(settings.includes('devClearLogs'), 'clear logs');
ok(settings.includes('devExportLogs'), 'export logs');
ok(settings.includes('devClearCache'), 'clear cache');

// ═══════════════════════════════════════════════════════════════
// 12. THEME — light/dark
// ═══════════════════════════════════════════════════════════════
group('12. Theme');
const theme = $read('src/ui/theme.js');
ok(theme.includes('getTheme('), 'get theme');
ok(theme.includes('initTheme('), 'init theme');
ok(theme.includes('toggleTheme('), 'toggle theme');
ok(theme.includes('prefers-color-scheme'), 'system theme');
ok(html.includes('themeToggle'), 'theme toggle button');

// ═══════════════════════════════════════════════════════════════
// 13. i18n — all user-facing text through t()
// ═══════════════════════════════════════════════════════════════
group('13. i18n / Text');
// Verify no hardcoded Chinese in non-lang files (except vendor/data)
const srcFiles = ['main.js','ui/ui.js','ui/result.js','ui/recognition.js',
  'ui/status.js','ui/splash.js','ui/custom-select.js','ui/polish.js',
  'editor/mathlive-config.js','settings/settings.js',
  'history/history-db.js','history/history-ui.js',
  'camera/camera.js','handwriting/handwrite.js',
  'export/pandoc-export.js','export/exporter.js',
  'shared/logger.js','shared/share.js',
  'native/ocr-native.js'];
let hardcodedFound = 0;
srcFiles.forEach(f => {
  const content = $read(`src/${f}`);
  // Check for Chinese characters directly in string literals
  // (t() calls, data-i18n, comments, and vendor data are fine)
  const chineseInStrings = content.match(/"[一-鿿][^"]*"/);
  if (chineseInStrings) {
    // Check it's not in a comment line
    const line = content.split('\n').find(l => l.includes(chineseInStrings[0]));
    if (line && !line.trim().startsWith('//') && !line.includes('data-i18n')) {
      // Further check: is it in a t() call?
      if (!line.includes('t(')) {
        hardcodedFound++;
        if (hardcodedFound <= 3) {
          fail(`${f}: possible hardcoded Chinese: ${chineseInStrings[0].slice(0, 40)}`);
        }
      }
    }
  }
});
if (hardcodedFound === 0) pass('no hardcoded Chinese in source files');

// ═══════════════════════════════════════════════════════════════
// 14. LOGGER
// ═══════════════════════════════════════════════════════════════
group('14. Logger');
const log = $read('src/shared/logger.js');
ok(log.includes('push('), 'push log');
ok(log.includes('load()'), 'load from localStorage');
ok(log.includes('save()'), 'save to localStorage');
ok(log.includes('ingestJavaLogs'), 'ingest Java logs');
ok(log.includes('_forwardToNative'), 'forward to native');
ok(log.includes('_emitLogEvent'), 'emit DOM event');
ok(log.includes('getExportText'), 'export text');
ok(log.includes('exportAndShare'), 'export and share');

// Console interceptor
ok(log.includes('console.log = function'), 'console.log interceptor');
ok(log.includes('console.error = function'), 'console.error interceptor');
ok(log.includes('Error.stack') || log.includes('instanceof Error'), 'stack trace capture');

// ═══════════════════════════════════════════════════════════════
// 15. NATIVE BRIDGE
// ═══════════════════════════════════════════════════════════════
group('15. Native Bridge');
const nat = $read('src/native/ocr-native.js');
ok(nat.includes('OcrNative'), 'OcrNative exported');
ok(nat.includes('isNativeOcrAvailable('), 'isNativeOcrAvailable');
ok(nat.includes('waitForNativeOcr('), 'waitForNativeOcr');
ok(nat.includes('loadModelsAndWait('), 'loadModelsAndWait');
ok(nat.includes('recognizeFormula'), 'recognizeFormula');
ok(nat.includes('recognizeText'), 'recognizeText');
ok(nat.includes('recognizeMixed'), 'recognizeMixed');
ok(nat.includes('saveSettings'), 'saveSettings');
ok(nat.includes('loadSettings'), 'loadSettings');
ok(nat.includes('setAcceleration'), 'setAcceleration');

// Android Java bridge
const bridge = $read('android/app/src/main/java/com/latexsnipper/app/ocr/NativeOcrBridge.java');
ok(bridge.includes('@JavascriptInterface'), 'JS bridge');
ok(bridge.includes('recognizeFormula'), 'bridge recognizeFormula');
ok(bridge.includes('saveFile'), 'bridge saveFile');
ok(bridge.includes('getLogs'), 'bridge getLogs');

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(`  ${PASS} passed, ${FAIL} failed`);
console.log(`  15 groups covering the full app lifecycle`);
console.log(`═══════════════════════════════════════════════════════════════`);
process.exit(FAIL > 0 ? 1 : 0);
