import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    assetsInlineLimit: 0, // never inline wasm/big files
    rollupOptions: {
      external: ['wasi_snapshot_preview1'], // provided by browser_wasi_shim at runtime
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
