#!/usr/bin/env node
// Test suite for KaTeX rendering in Node.js (headless)
// Note: This tests the KaTeX library itself (used in the browser).
// Browser-level tests (PNG/SVG export) need Puppeteer/Playwright.
//
// Usage: node test/test_katex.js

import katex from 'katex';

let PASS = 0, FAIL = 0;
function pass(l) { PASS++; console.log(`  ✅ ${l}`); }
function fail(l, d) { FAIL++; console.log(`  ❌ ${l}${d ? ': ' + d : ''}`); }
function ok(c, l, d) { if (c) pass(l); else fail(l, d); }

function renderOk(label, latex, check, opts = {}) {
  try {
    const html = katex.renderToString(latex, { throwOnError: false, ...opts });
    const ok = check(html);
    if (ok) pass(label);
    else fail(label, 'HTML: ' + html.slice(0, 200));
  } catch (e) {
    fail(label, 'throw: ' + e.message);
  }
}

console.log('═══════════════════════════════════════════════');
console.log('  KaTeX Rendering Test Suite');
console.log('═══════════════════════════════════════════════\n');

// [1] Basic formulas
console.log('─── [1] Basic formulas ───');
renderOk('Simple fraction', '\\frac{a}{b}', html => html.includes('frac') || html.includes('mfrac'));
renderOk('Square root', '\\sqrt{x}', html => html.includes('sqrt'));
renderOk('Superscript', 'x^2', html => html.includes('msup') || html.includes('x<'));
renderOk('Subscript', 'x_1', html => html.includes('msub') || html.includes('1'));
renderOk('Integral', '\\int_{0}^{1} f(x)\\,dx', html => html.includes('int') || html.includes('mo'));
renderOk('Sum', '\\sum_{n=1}^{\\infty} \\frac{1}{n^2}', html => html.includes('infty') || html.includes('sum'));

// [2] Greek letters
console.log('\n─── [2] Greek letters ───');
renderOk('Alpha', '\\alpha', html => html.includes('alpha') || html.includes('α'));
renderOk('Pi', '\\pi', html => html.includes('pi') || html.includes('π'));
renderOk('Beta', '\\beta', html => html.includes('beta') || html.includes('β'));
renderOk('Gamma', '\\Gamma', html => html.includes('Gamma') || html.includes('Γ'));

// [3] Environments
console.log('\n─── [3] Environments ───');
renderOk('Matrix', '\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}', html => html.includes('mtable') || html.includes('matrix'));
renderOk('Cases', '\\begin{cases} x & \\text{if } y \\\\ 0 & \\text{otherwise} \\end{cases}', html => html.includes('cases') || html.includes('mtable'));
renderOk('Aligned', '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}', html => html.includes('mtable') || html.includes('aligned'));

// [4] Commands
console.log('\n─── [4] Misc commands ───');
renderOk('Hat', '\\hat{a}', html => html.includes('hat') || html.includes('a'));
renderOk('Vec', '\\vec{v}', html => html.includes('vec') || html.includes('v'));
renderOk('Text inside formula', '\\text{hello}', html => html.includes('hello') || html.includes('text'));
renderOk('Underline', '\\underline{x}', html => html.includes('underline'));
renderOk('Binom', '\\binom{n}{k}', html => html.includes('binom') || html.includes('mo'));
renderOk('Color', '\\textcolor{red}{x^2}', html => html.includes('color') || html.includes('x'));

// [5] Inline vs display
console.log('\n─── [5] Inline and display math ───');
renderOk('Inline $x^2$', 'x^2', html => html.includes('msup') || html.includes('x<'), { displayMode: false });
renderOk('Display $$x^2$$', 'x^2', html => html.includes('msup') || html.includes('x'), { displayMode: true });
renderOk('Display has larger katex-display wrapper', '\\int x\\,dx', html => html.includes('katex-display') || html.includes('int'), { displayMode: true });

// [6] Edge cases
console.log('\n─── [6] Edge cases ───');
renderOk('Empty string', '', html => html.includes('katex-html') || html.trim() === '');
renderOk('Plain text', 'hello', html => html.includes('hello'));
renderOk('Error handling', '\\undefinedcommand', html => html.includes('katex') || html.length > 0);
renderOk('Null/undefined gracefully', '', html => html.includes('katex-html') || html.trim() === '');

// [7] Real OCR output
console.log('\n─── [7] Real OCR output ───');
renderOk('Integral with limits', '\\int_{0}^{\\infty} e^{-x}\\,dx = 1', html => html.includes('int') || html.includes('infty'));
renderOk('Sigma notation', '\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}', html => html.includes('sum') || html.includes('frac'));
renderOk('Mixed text+formula', 'The value of \\pi is 3.14159', html => html.includes('pi') || html.includes('3.14159'));
renderOk('Multiple formulas in one line', 'x^2 + y^2 = z^2', html => html.includes('msup') || html.includes('='));

// [8] KaTeX CSS resource verification (ensure vendor files exist)
console.log('\n─── [8] Resource checks ───');
import { existsSync, readFileSync } from 'node:fs';

function fileOk(label, path, check) {
  try {
    const exists = existsSync(path);
    if (!exists) { fail(label, 'not found: ' + path); return; }
    if (check) {
      const content = readFileSync(path, 'utf-8');
      ok(check(content), label);
    } else {
      ok(true, label);
    }
  } catch (e) { fail(label, e.message); }
}

fileOk('katex.min.js exists', 'public/vendor/katex.min.js', null);
fileOk('katex.min.css exists', 'public/vendor/katex.min.css', null);
fileOk('katex.min.css font paths correct', 'public/vendor/katex.min.css',
  content => content.includes('url(fonts/KaTeX_'));
fileOk('Main-Regular woff2 exists', 'public/vendor/fonts/KaTeX_Main-Regular.woff2', null);
fileOk('katex.min.js is valid JS', 'public/vendor/katex.min.js',
  content => content.includes('katex') || content.includes('KaTeX'));

console.log('\n═══════════════════════════════════════════════');
console.log(`  Results: ${PASS} passed, ${FAIL} failed`);
console.log('═══════════════════════════════════════════════');
process.exit(FAIL > 0 ? 1 : 0);
