// Service Worker — pre-cache all app files for full offline support
const CACHE_NAME = 'latexsnipper-v1';

const PRE_CACHE = [
  '/',
  '/manifest.json',
  '/icon.png',
  '/ort/ort-wasm-simd-threaded.wasm',
  '/ort/ort-wasm-simd-threaded.jsep.wasm',
  '/ort/ort-wasm-simd-threaded.mjs',
  '/ort/ort-wasm-simd-threaded.jsep.mjs',
  // MathLive formula editor
  '/vendor/mathlive/mathlive.min.js',
  '/vendor/mathlive/mathlive-fonts.css',
  // Models (large files, pre-cached for offline use)
  '/models/mathcraft-formula-rec/encoder_model.onnx',
  '/models/mathcraft-formula-rec/decoder_model.onnx',
  '/models/mathcraft-formula-rec/tokenizer.json',
  '/models/mathcraft-formula-rec/generation_config.json',
  '/models/mathcraft-formula-rec/config.json',
  '/models/mathcraft-formula-rec/preprocessor_config.json',
  '/models/mathcraft-formula-rec/special_tokens_map.json',
  '/models/mathcraft-formula-rec/tokenizer_config.json',
];

// Install — pre-cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache each file individually to handle failures gracefully
      return Promise.allSettled(
        PRE_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('SW: failed to cache', url, err.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache first, then network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // For models and static assets: cache first
  if (
    url.pathname.startsWith('/models/') ||
    url.pathname.startsWith('/ort/') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.otf')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // For HTML, JS, CSS: network first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
