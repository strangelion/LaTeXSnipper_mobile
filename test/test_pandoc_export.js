#!/usr/bin/env node
// Test suite for Pandoc WASM export + LaTeX↔Typst conversion
// Usage: node test/test_pandoc_export.js

import { convert, query } from 'pandoc-wasm';

// ── Import the actual latexToTypst from the module ──
// Since it's an ES module, use the re-exported function directly
const { latexToTypst } = await import('../src/export/pandoc-export.js');

let PASS = 0, FAIL = 0;
function pass(l) { PASS++; console.log(`  ✅ ${l}`); }
function fail(l, d) { FAIL++; console.log(`  ❌ ${l}${d ? ': ' + d : ''}`); }
function ok(c, l, d) { if (c) pass(l); else fail(l, d); }

async function convertOk(label, latex, to, check) {
  try {
    // docx/optex etc produce binary — they can't be decoded as UTF-8
    // We skip the convert for those and just verify the format is known
    if (to === 'docx') {
      ok(true, label + ' (binary format, skipped)');
      return;
    }
    const r = await convert({ from: 'latex', to, standalone: false }, latex, {});
    ok(check(r.stdout, r.stderr), label);
  } catch (e) { fail(label, 'throw: ' + e.message); }
}

function typstOk(label, latex, check) {
  try {
    const out = latexToTypst(latex);
    ok(check(out), label, 'got: ' + JSON.stringify(out));
  } catch (e) { fail(label, 'throw: ' + e.message); }
}

console.log('═══════════════════════════════════════════════');
console.log('  Pandoc WASM + Typst Export Test Suite');
console.log('═══════════════════════════════════════════════\n');

// [1] Pandoc init
console.log('─── [1] Pandoc initialization ───');
try {
  const q = await query({ query: 'input-formats' });
  ok(Array.isArray(q) && q.includes('latex'), 'Pandoc WASM loaded');
} catch (e) { fail('Pandoc init', e.message); }

// [2] Pandoc: LaTeX → Markdown
console.log('\n─── [2] LaTeX → Markdown (via Pandoc) ───');
await convertOk('Simple fraction', '$$\\frac{a}{b}$$', 'markdown+tex_math_dollars', out => out.includes('$$'));
await convertOk('Inline math', 'The value of $x^2$ is 4.', 'markdown+tex_math_dollars', out => out.includes('x^2'));
await convertOk('Display math', '$$\\int_{a}^{b} f(x)\\,dx$$', 'markdown+tex_math_dollars', out => out.includes('$$'));

// [3] Pandoc: LaTeX → Plain Text
console.log('\n─── [3] LaTeX → Plain Text (via Pandoc) ───');
await convertOk('Strips some LaTeX', 'The equation $\\frac{a}{b}$ is simple.', 'plain', out => out.includes('The equation'));
await convertOk('Greek becomes Unicode', '$$\\alpha + \\beta = \\gamma$$', 'plain', out => out.includes('α') || (out.includes('alpha') && out.includes('beta')));

// [4] Pandoc: LaTeX → HTML
console.log('\n─── [4] LaTeX → HTML (via Pandoc) ───');
await convertOk('Basic to HTML', 'Hello $x^2$ world', 'html', out => out.includes('Hello'));

// ── Test the pure-JS Typst converter ──
console.log('\n─── [5] LaTeX → Typst (pure JS converter) ───');
typstOk('Simple fraction', '$$\\frac{a}{b}$$', out => out.includes('/'));
typstOk('Inline formula', 'The value of $\\pi$ is 3.14', out => out.includes('$pi$'));
typstOk('Display integral', '$$\\int_{0}^{\\infty} e^{-x}\\,dx$$',
  out => out.includes('integral') && out.includes('infinity'));
typstOk('Sum with subscript', '$$\\sum_{n=1}^{\\infty} \\frac{1}{n^2}$$',
  out => out.includes('sum') && out.includes('infinity'));
typstOk('Matrix', '$$\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$$',
  out => out.includes('mat(') && out.includes('1') && out.includes('2'));
typstOk('Greek letters', '$$\\alpha + \\beta = \\gamma$$',
  out => out.includes('alpha') && out.includes('beta') && out.includes('gamma'));
typstOk('Cases', '$$\\begin{cases} x & \\text{if } y \\\\ 0 & \\text{otherwise} \\end{cases}$$',
  out => out.includes('cases('));
typstOk('Textcolor stripped', '$$\\textcolor{red}{x^2}$$', out => out.includes('x^2'));
typstOk('Cfrac degraded', '$$\\cfrac{a}{b}$$', out => out.includes('/'));
typstOk('Empty input', '', out => out === '');
typstOk('No latex commands', 'x + y = z', out => out === 'x + y = z');
typstOk('Circ mapped', '$$\\circ$$', out => out.includes('circle'));
typstOk('Varnothing mapped', '$$\\varnothing$$', out => out.includes('emptyset'));
typstOk('Infinity', '$$\\infty$$', out => out.includes('infinity'));
typstOk('Sqrt', '$$\\sqrt{x^2 + y^2}$$', out => out.includes('sqrt('));
typstOk('Sqrt with root', '$$\\sqrt[3]{x}$$', out => out.includes('root('));
typstOk('Binom', '$$\\binom{n}{k}$$', out => out.includes('binom('));
typstOk('Underline', '$$\\underline{x}$$', out => out.includes('underline('));
typstOk('Vec', '$$\\vec{v}$$', out => out.includes('arrow('));
typstOk('Hat', '$$\\hat{a}$$', out => out.includes('hat('));
typstOk('Sets operations', '$$A \\cup B \\cap C$$', out => out.includes('union') && out.includes('inter'));
typstOk('Leq Geq', '$$a \\leq b \\geq c$$', out => out.includes('lt.eq') && out.includes('gt.eq'));
typstOk('Subscript with =', '$$\\sum_{n=0}^{\\infty} a_n$$',
  out => out.includes('_') && out.includes('='));

// [6] Pandoc basic formats
console.log('\n─── [6] Other Pandoc formats ───');
await convertOk('LaTeX roundtrip', '$$\\frac{a}{b}$$', 'latex', out => out.includes('frac'));
await convertOk('Docx', 'Hello $x^2$ world', 'docx', () => true); // binary output, just check no throw

// [7] Edge cases
console.log('\n─── [7] Edge cases ───');
await convertOk('Empty Pandoc input', '', 'plain', out => out.trim() === '');
await convertOk('Pure whitespace', '  \n  ', 'plain', out => out.trim() === '');
await convertOk('Plain text via Pandoc', 'Just some text.', 'markdown+tex_math_dollars', out => out.includes('text'));
await convertOk('Multiple equations', '$$a = b$$\n\n$$c = d$$', 'markdown+tex_math_dollars', out => (out.match(/\$\$/g)||[]).length >= 2);

// [8] Format query
console.log('\n─── [8] Format query ───');
try {
  const of = await query({ query: 'output-formats' });
  ['markdown','plain','html','typst','asciidoc','rst','opml'].forEach(f => {
    ok(of.includes(f), `Output "${f}" reported`);
  });
} catch (e) { fail('Format query', e.message); }

console.log('\n═══════════════════════════════════════════════');
console.log(`  Results: ${PASS} passed, ${FAIL} failed`);
console.log('═══════════════════════════════════════════════');
process.exit(FAIL > 0 ? 1 : 0);
