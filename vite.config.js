import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
  ],
  resolve: {
    alias: {
      // pandoc-wasm's WASM binary imports wasi_snapshot_preview1;
      // alias it to our shim that wraps @bjorn3/browser_wasi_shim
      'wasi_snapshot_preview1': resolve(__dirname, 'src/shared/wasi-shim.js'),
    },
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
