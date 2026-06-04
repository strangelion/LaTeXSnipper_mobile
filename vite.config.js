import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { resolve } from 'path';
import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const dirname = fileURLToPath(new URL('.', import.meta.url));

const pkg = JSON.parse(readFileSync(resolve(dirname, 'package.json'), 'utf-8'));
const APP_VERSION = pkg.version;

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    {
      name: 'inject-version',
      transformIndexHtml(html) {
        return html.replace(
          /<meta name="version" content=".*?">/,
          `<meta name="version" content="${APP_VERSION}">`
        );
      },
    },
    // Copy pandoc.wasm (56MB) to dist/assets as a static asset
    // without vite-plugin-wasm interference
    {
      name: 'copy-pandoc-wasm',
      writeBundle({ dir }) {
        const src = resolve(dirname, 'node_modules/pandoc-wasm/src/pandoc.wasm');
        const outDir = resolve(dir || 'dist', 'assets');
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
        copyFileSync(src, resolve(outDir, 'pandoc.wasm'));
      },
      closeBundle() {
        // also copy for dev mode public resolution
        const src = resolve(dirname, 'node_modules/pandoc-wasm/src/pandoc.wasm');
        const outDir = resolve(dirname, 'public/vendor/pandoc');
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
        copyFileSync(src, resolve(outDir, 'pandoc.wasm'));
      },
    },
  ],
  resolve: {
    alias: {
      'wasi_snapshot_preview1': resolve(dirname, 'src/shared/wasi-shim.js'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    assetsInlineLimit: 0, // never inline wasm/big files
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('onnxruntime-web')) return 'onnx';
          if (id.includes('katex')) return 'katex';
          if (id.includes('mathlive')) return 'mathlive';
          if (id.includes('pdfjs-dist')) return 'pdfjs';
        },
      },
    },
  },
  server: {
    port: 5174,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
});
