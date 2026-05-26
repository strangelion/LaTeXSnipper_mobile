import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('onnxruntime-web')) return 'onnx';
          if (id.includes('mathlive')) return 'mathlive';
          if (id.includes('mathjax')) return 'mathjax';
          if (id.includes('pdfjs-dist')) return 'pdfjs';
        },
      },
    },
  },
  server: {
    port: 5174,
    // COOP/COEP headers removed — enables SharedArrayBuffer but multi-threaded
    // WASM times out on large ONNX model inference in Firefox.
    // Single-thread WASM is stable; enable these headers only if deploying
    // to a server that can handle long-running WASM threads.
    // headers: {
    //   'Cross-Origin-Opener-Policy': 'same-origin',
    //   'Cross-Origin-Embedder-Policy': 'require-corp',
    // },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
});
