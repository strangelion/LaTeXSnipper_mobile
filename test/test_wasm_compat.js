#!/usr/bin/env node
// Android WebView / Chromium version check for WASM compatibility
// Tests whether the current runtime supports features needed by pandoc-wasm
//
// Usage: node test/test_wasm_compat.js

let PASS = 0, FAIL = 0;
function pass(l) { PASS++; console.log(`  ✅ ${l}`); }
function fail(l, d) { FAIL++; console.log(`  ❌ ${l}${d ? ': ' + d : ''}`); }
function ok(c, l, d) { if (c) pass(l); else fail(l, d); }

console.log('═══════════════════════════════════════════════');
console.log('  WASM Compatibility Test Suite');
console.log('═══════════════════════════════════════════════\n');

// ── [1] Check runtime environment ──
console.log('─── [1] Runtime environment ───');
const isNode = typeof process !== 'undefined' && process.versions?.node;
const isBrowser = typeof window !== 'undefined';
const userAgent = isBrowser ? navigator.userAgent : 'Node.js ' + (process.version || 'unknown');

console.log(`  Runtime: ${isNode ? 'Node.js' : 'Browser'}`);
console.log(`  UA: ${userAgent}`);
ok(isNode || isBrowser, 'Recognizable runtime');

if (isNode) {
  ok(parseInt(process.version?.slice(1)) >= 18, 'Node.js >= 18 required');
}

// ── [2] Check WebAssembly basics ──
console.log('\n─── [2] WebAssembly basics ───');
ok(typeof WebAssembly !== 'undefined', 'WebAssembly global exists');
ok(typeof WebAssembly.instantiate === 'function', 'WebAssembly.instantiate');
ok(typeof WebAssembly.instantiateStreaming === 'function' || isNode, 'WebAssembly.instantiateStreaming');

// ── [3] Check WASM memory features ──
console.log('\n─── [3] WASM memory features ───');
try {
  // Test creating a WASM memory of the size pandoc-wasm needs
  // pandoc uses -H64m heap, so need ~128MB+ memory
  const mem = new WebAssembly.Memory({ initial: 256, maximum: 512 }); // 256 pages = 16MB
  ok(mem instanceof WebAssembly.Memory, 'WebAssembly.Memory created');
  ok(mem.buffer instanceof ArrayBuffer, 'Memory has ArrayBuffer');

  // Try growing memory (pandoc may need to grow)
  mem.grow(128); // grow by another 8MB
  ok(mem.buffer.byteLength > 16 * 1024 * 1024, 'Memory can grow');
} catch (e) {
  fail('WASM memory support', e.message);
}

// ── [4] Check loading large WASM binaries ──
console.log('\n─── [4] Large WASM binary loading ───');
const { readFileSync, existsSync } = await import('node:fs');
const { join, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmPath = join(__dirname, '..', 'node_modules', 'pandoc-wasm', 'src', 'pandoc.wasm');

if (existsSync(wasmPath)) {
  const wasmSize = readFileSync(wasmPath).length;
  const wasmSizeMB = (wasmSize / (1024 * 1024)).toFixed(1);
  ok(wasmSizeMB >= 50, `WASM binary is ${wasmSizeMB} MB (pandoc-wasm)`);

  // Check if it can be compiled
  try {
    const wasmBytes = readFileSync(wasmPath);
    const compiled = await WebAssembly.compile(wasmBytes);
    ok(compiled instanceof WebAssembly.Module, 'WASM binary compiles successfully');
  } catch (e) {
    fail('WASM binary compilation', e.message);
  }
} else {
  fail('WASM binary file', `not found at ${wasmPath}`);
}

// ── [5] Check wasm shim dependencies ──
console.log('\n─── [5] WASM shim dependencies ───');
try {
  const { WASI } = await import('@bjorn3/browser_wasi_shim');
  ok(typeof WASI === 'function', '@bjorn3/browser_wasi_shim loads');
  ok(typeof WASI.prototype.start === 'function', 'WASI.start method');
} catch (e) {
  fail('WASI shim', e.message);
}

// ── [6] Check pandoc-wasm node entry ──
console.log('\n─── [6] pandoc-wasm Node.js entry ───');
try {
  const pandoc = await import('pandoc-wasm');
  ok(typeof pandoc.convert === 'function', 'pandoc-wasm.convert function');
  ok(typeof pandoc.query === 'function', 'pandoc-wasm.query function');
} catch (e) {
  fail('pandoc-wasm module load', e.message);
}

// ── [7] Check Vite bundler config ──
console.log('\n─── [7] Build config checks ───');
const { readFileSync: rf } = await import('node:fs');
const viteConfig = rf(join(__dirname, '..', 'vite.config.js'), 'utf-8');

ok(viteConfig.includes('vite-plugin-wasm'), 'vite-plugin-wasm configured');
ok(viteConfig.includes('vite-plugin-top-level-await'), 'top-level-await plugin');
ok(viteConfig.includes('copy-pandoc-wasm'), 'pandoc.wasm copy plugin configured');
ok(!viteConfig.includes("wasi_snapshot_preview1"), 'old wasi alias removed');
ok(viteConfig.includes('assetsInlineLimit: 0'), 'WASM inlining disabled');

// Check that COOP/COEP headers are set for SharedArrayBuffer
ok(viteConfig.includes('Cross-Origin-Opener-Policy'), 'COOP header');
ok(viteConfig.includes('Cross-Origin-Embedder-Policy'), 'COEP header');

// ═══ SUMMARY ═══
console.log(`\n═══════════════════════════════════════════════`);
console.log(`  ${PASS} passed, ${FAIL} failed`);
console.log(`═══════════════════════════════════════════════`);
process.exit(FAIL > 0 ? 1 : 0);
