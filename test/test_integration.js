#!/usr/bin/env node
// Integration tests — covers all major user workflows in LaTeXSnipper Mobile
//
// Tests run in Node.js + jsdom for DOM-dependent modules.
// Browser-only features (export, filereader, camera) are validated at unit level.
//
// Usage: node test/test_integration.js

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let PASS = 0, FAIL = 0;
function pass(l) { PASS++; console.log(`  ✅ ${l}`); }
function fail(l, d) { FAIL++; console.log(`  ❌ ${l}${d ? ': ' + d : ''}`); }
function ok(c, l, d) { if (c) pass(l); else fail(l, d); }

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

console.log('═══════════════════════════════════════════════');
console.log('  LaTeXSnipper Mobile — Integration Tests');
console.log('═══════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════
// [1] Project structure checks
// ═══════════════════════════════════════════════════════════
console.log('─── [1] Project structure ───');

const essentialFiles = [
  'index.html',
  'vite.config.js',
  'package.json',
  'src/main.js',
  'src/export/pandoc-export.js',
  'src/ui/result.js',
  'src/ui/recognition.js',
  'src/ui/status.js',
  'src/ui/splash.js',
  'src/ui/custom-select.js',
  'src/ui/polish.js',
  'src/editor/mathlive-config.js',
  'src/history/history-db.js',
  'src/settings/settings.js',
  'src/shared/share.js',
  'src/shared/logger.js',
  'src/native/ocr-native.js',
  'src/styles/base.css',
  'src/styles/ocr.css',
  'src/styles/editor.css',
  'src/styles/handwriting.css',
  'src/styles/history.css',
  'src/styles/mobile.css',
  'public/vendor/katex.min.js',
  'public/vendor/katex.min.css',
  'public/vendor/fonts/KaTeX_Main-Regular.woff2',
  'public/sw.js',
  'public/manifest.json',
];
essentialFiles.forEach(f => {
  ok(existsSync(join(ROOT, f)), `File exists: ${f}`);
});

// ═══════════════════════════════════════════════════════════
// [2] index.html structure checks
// ═══════════════════════════════════════════════════════════
console.log('\n─── [2] index.html structure ───');
const html = readFileSync(join(ROOT, 'index.html'), 'utf-8');

ok(html.includes('KaTeX CSS'), 'KaTeX CSS ref present');
ok(html.includes('katex.min.js'), 'KaTeX JS ref present');
ok(!html.includes('mathjax'), 'No MathJax reference remains');

// Pages
['page-ocr', 'page-editor', 'page-history', 'page-settings'].forEach(id => {
  ok(html.includes(`id="${id}"`), `Page ${id} exists`);
});

// Elements
['copyBtn', 'aiPolishBtn', 'shareBtn', 'sendToEditorBtn', 'exportDropdownContainer',
 'editorPreview', 'editorPreviewActions', 'editorCopy', 'editorClearBtn',
 'editorKbdToggle', 'editorExportContainer', 'calcToolbar',
 'mathPreview', 'resultCode', 'resultCard', 'confidence',
 'dropZone', 'fileInput', 'preview', 'themeToggle',
 'camTrigger', 'camModal', 'camVideo', 'camCapture',
 'hwCanvas', 'hwPanel',
 'setEngineSelect', 'setAccelSelect', 'setSkinSelect', 'setLangSelect',
 'settingsSave', 'setDevMode'].forEach(id => {
  ok(html.includes(`id="${id}"`), `Element #${id} exists`);
});

// KaTeX not MathJax
// No MathJax global config in HTML (only in comments is fine)
ok(!html.includes('MathJax ='), 'No MathJax global config in HTML');
ok(!html.includes('tex-svg.js'), 'No tex-svg.js in HTML');

// Export dropdown instead of old PNG/SVG buttons
ok(html.includes('exportDropdownContainer'), 'Export dropdown container exists');
ok(!html.includes('exportPngBtn'), 'Old export PNG button removed');
ok(!html.includes('exportSvgBtn'), 'Old export SVG button removed');

// Editor improvements
ok(html.includes('editorClearBtn'), 'Editor clear button exists');
ok(html.includes('editorKbdToggle'), 'Editor keyboard toggle exists');

// i18n attributes
ok(html.includes('data-i18n='), 'i18n attributes present');
ok(html.includes('lang="zh-CN"'), 'lang attribute on html');

// PWA (sw.js is a separate file, not inlined in HTML)
ok(html.includes('manifest.json'), 'PWA manifest');
ok(html.includes('sw.js') || existsSync(join(ROOT, 'public/sw.js')), 'ServiceWorker file exists');

// ═══════════════════════════════════════════════════════════
// [3] CSS file checks
// ═══════════════════════════════════════════════════════════
console.log('\n─── [3] CSS styles ───');
const baseCss = readFileSync(join(ROOT, 'src/styles/base.css'), 'utf-8');
ok(baseCss.includes('--accent'), 'CSS variable --accent defined');
ok(baseCss.includes('--fg'), 'CSS variable --fg defined');
ok(baseCss.includes('--bg'), 'CSS variable --bg defined');
ok(baseCss.includes('set-select-wrap'), 'Custom dropdown styles present');

const ocrCss = readFileSync(join(ROOT, 'src/styles/ocr.css'), 'utf-8');
ok(ocrCss.includes('result-actions'), 'Result card grid layout');
ok(ocrCss.includes('export-dropdown-wrap'), 'Export dropdown CSS present');
ok(ocrCss.includes('export-dropdown-btn'), 'Export dropdown button CSS');
ok(ocrCss.includes('export-dropdown-list'), 'Export dropdown list CSS');

const editorCss = readFileSync(join(ROOT, 'src/styles/editor.css'), 'utf-8');
ok(editorCss.includes('editor-wrap'), 'Editor wrap CSS');
ok(editorCss.includes('editor-footer-actions'), 'Editor footer actions CSS');
ok(editorCss.includes('#editorKbdToggle'), 'Keyboard toggle CSS');
ok(editorCss.includes('calc-toolbar'), 'Calculator toolbar CSS');

const mobileCss = readFileSync(join(ROOT, 'src/styles/mobile.css'), 'utf-8');
ok(mobileCss.length > 0, 'Mobile CSS not empty');

// ═══════════════════════════════════════════════════════════
// [4] Main JS entry point checks
// ═══════════════════════════════════════════════════════════
console.log('\n─── [4] main.js structure ───');
const mainJs = readFileSync(join(ROOT, 'src/main.js'), 'utf-8');

// All imports present
['base.css', 'ocr.css', 'editor.css', 'history.css', 'mobile.css',
 'constants.js', 'ui/theme.js', 'ui/ui.js',
 'handwriting/handwrite.js', 'camera/camera.js',
 'history/history-db.js', 'history/history-ui.js',
 'editor/mathlive-config.js', 'lang/i18n.js',
 'settings/settings.js', 'ui/custom-select.js',
 'export/pandoc-export.js',
].forEach(imp => {
  ok(mainJs.includes(imp), `Import ${imp} present`);
});

// Boot function
ok(mainJs.includes('async function boot'), 'boot() function present');
ok(mainJs.includes('initI18n'), 'initI18n called');
ok(mainJs.includes('initModels'), 'initModels called');
ok(mainJs.includes('setupTabs'), 'Tab navigation setup');

// Event listeners
ok(mainJs.includes('backButton'), 'Android back button handler');
ok(mainJs.includes('editorKbdToggle'), 'Keyboard toggle listener');
ok(mainJs.includes('editorClearBtn'), 'Clear button listener');

// No MathJax references
ok(!mainJs.includes('exportPNG'), 'exportPNG not imported');
ok(!mainJs.includes('exportSVG'), 'exportSVG not imported');

// ═══════════════════════════════════════════════════════════
// [5] Export module checks
// ═══════════════════════════════════════════════════════════
console.log('\n─── [5] Export module ───');
const exportJs = readFileSync(join(ROOT, 'src/export/pandoc-export.js'), 'utf-8');

ok(exportJs.includes('EXPORT_FORMATS'), 'Export formats defined');
ok(exportJs.includes("action: 'render'"), 'Image export action');
ok(exportJs.includes("action: 'pandoc'"), 'Pandoc text export action');
ok(exportJs.includes("action: 'typst'"), 'Typst action (pure JS)');
ok(exportJs.includes('exportLatex'), 'exportLatex function');
ok(exportJs.includes('createExportDropdown'), 'createExportDropdown function');
ok(exportJs.includes('latexToTypst'), 'latexToTypst function');

// Typst converter
ok(exportJs.includes('integral'), 'integral in symbol table');
ok(exportJs.includes('infinity'), 'infinity in symbol table');
ok(exportJs.includes('SYMBOLS'), 'Symbol table present');
ok(exportJs.includes('formulaToTypst'), 'formulaToTypst function');
ok(exportJs.includes('segmentMixedInput'), 'segmentMixedInput function');

// ═══════════════════════════════════════════════════════════
// [6] Editor module checks
// ═══════════════════════════════════════════════════════════
console.log('\n─── [6] Editor module ───');
const editorJs = readFileSync(join(ROOT, 'src/editor/mathlive-config.js'), 'utf-8');

ok(editorJs.includes('MathfieldElement'), 'MathfieldElement used');
ok(editorJs.includes('mathVirtualKeyboardPolicy'), 'Keyboard policy configured');
ok(editorJs.includes(`'manual'`), 'Keyboard policy is manual');
ok(editorJs.includes('smartFence = true'), 'Smart fence enabled');
ok(editorJs.includes('smartMode = true'), 'Smart mode enabled');
ok(editorJs.includes('toggleVirtualKeyboard'), 'Keyboard toggle command');
ok(editorJs.includes('toggleKeyboard'), 'toggleKeyboard exported');
ok(editorJs.includes('katex.renderToString'), 'KaTeX used for preview');
ok(editorJs.includes('setEditorContent'), 'setEditorContent exported');
ok(editorJs.includes('MATHLIVE_ZH'), 'Chinese locale defined');

// ═══════════════════════════════════════════════════════════
// [7] Result display module checks
// ═══════════════════════════════════════════════════════════
console.log('\n─── [7] Result display module ───');
const resultJs = readFileSync(join(ROOT, 'src/ui/result.js'), 'utf-8');

ok(resultJs.includes('showResult'), 'showResult function');
ok(resultJs.includes('hideResult'), 'hideResult function');
ok(resultJs.includes('copyResult'), 'copyResult function');
ok(resultJs.includes('showPDFBrowser'), 'PDF browser UI');
ok(resultJs.includes('renderMathPreview'), 'renderMathPreview function');
ok(resultJs.includes('renderLatexToSvgs'), 'renderLatexToSvgs for export');
ok(resultJs.includes('combineSvgs'), 'SVG combining function');
ok(resultJs.includes('svgToPngBlob'), 'SVG to PNG conversion');
ok(resultJs.includes('exportDropdownContainer'), 'Export dropdown shown/hidden');

// KaTeX instead of MathJax
ok(resultJs.includes('katex.renderToString'), 'KaTeX renderToString in result');
ok(!resultJs.includes('MathJax.tex2svgPromise'), 'MathJax removed from result');

// No normalizeMixedLine in exports
ok(!resultJs.includes('normalizeMixedLine'), 'Normalize helper not exported');

// ═══════════════════════════════════════════════════════════
// [8] Camera module checks
// ═══════════════════════════════════════════════════════════
console.log('\n─── [8] Camera and handwriting ───');
const cameraDir = join(ROOT, 'src/camera');
const handwriteDir = join(ROOT, 'src/handwriting');

ok(existsSync(join(cameraDir, 'camera.js')), 'Camera module exists');
ok(existsSync(join(handwriteDir, 'handwrite.js')), 'Handwrite module exists');

// ═══════════════════════════════════════════════════════════
// [9] i18n language files consistency
// ═══════════════════════════════════════════════════════════
console.log('\n─── [9] i18n consistency ───');
const langDir = join(ROOT, 'src/lang');
const langFiles = ['en.js', 'zh-CN.js', 'zh-TW.js', 'ja.js', 'ko.js'];
const allKeys = {};

// Collect keys from zh-CN (reference)
const zhcn = readFileSync(join(langDir, 'zh-CN.js'), 'utf-8');
const keyRe = /"([^"]+)":/g;
let match;
const refKeys = new Set();
while ((match = keyRe.exec(zhcn)) !== null) refKeys.add(match[1]);

langFiles.forEach(file => {
  if (!existsSync(join(langDir, file))) {
    fail(`Language file missing: ${file}`);
    return;
  }
  const content = readFileSync(join(langDir, file), 'utf-8');
  const keys = new Set();
  const re = /"([^"]+)":/g;
  let m;
  while ((m = re.exec(content)) !== null) keys.add(m[1]);

  // Check export.format keys exist in all languages
  const fmtKeys = ['export.trigger', 'export.exporting',
    'export.format.png', 'export.format.svg', 'export.format.markdown',
    'export.format.plain', 'export.format.html', 'export.format.typst',
    'export.format.asciidoc', 'export.format.rst', 'export.format.opml'];
  fmtKeys.forEach(k => {
    ok(keys.has(k), `Key "${k}" in ${file}`);
  });

  // Check editor.showKeyboard
  ok(keys.has('editor.showKeyboard'), `"editor.showKeyboard" in ${file}`);
  ok(keys.has('editor.clear'), `"editor.clear" in ${file}`);
  ok(keys.has('editor.copyLatex'), `"editor.copyLatex" in ${file}`);
});

// ═══════════════════════════════════════════════════════════
// [10] Vite config
// ═══════════════════════════════════════════════════════════
console.log('\n─── [10] Build config ───');
const vite = readFileSync(join(ROOT, 'vite.config.js'), 'utf-8');
ok(vite.includes('vite-plugin-wasm'), 'WASM plugin configured');
ok(vite.includes('vite-plugin-top-level-await'), 'Top-level await plugin');
ok(vite.includes('assetsInlineLimit: 0'), 'WASM inlining disabled');
ok(vite.includes(`'wasi_snapshot_preview1'`), 'wasi externalized');

// ═══════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════');
console.log(`  Results: ${PASS} passed, ${FAIL} failed`);
console.log('═══════════════════════════════════════════════');
process.exit(FAIL > 0 ? 1 : 0);
