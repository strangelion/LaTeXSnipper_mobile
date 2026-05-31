/**
 * Native Ocr bridge — wraps Android's @JavascriptInterface (window.NativeOcr)
 * into a Promise-based API.
 *
 * Recognition methods now use async pattern:
 *   1. Java launches recognition on background thread, returns a key immediately
 *   2. JS polls getResult(key) until result is ready
 * This prevents WebView thread blocking.
 */

function NO() { return window.NativeOcr; }

function wrap(method, ...args) {
  return new Promise((resolve, reject) => {
    try {
      const result = NO()[method](...args);
      if (typeof result === 'string' && result.startsWith('error:')) {
        reject(new Error(result.substring(6)));
      } else {
        resolve(result);
      }
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Launch async recognition and poll for result.
 * @param {string} image - base64 data URI
 * @param {string} type - 'recognizeFormula', 'recognizeText', or 'recognizeMixed'
 * @param {number} timeoutMs - max wait time
 */
function recognizeAsync(image, type) {
  // Large photos need more time: formula=60s, text=90s, mixed=180s
  const timeoutMs = type === 'recognizeMixed' ? 180000
    : type === 'recognizeText' ? 90000
    : 60000;

  return new Promise(async (resolve, reject) => {
    try {
      // Launch recognition (returns immediately with key)
      const key = await wrap(type, image);
      if (!key) {
        reject(new Error('Failed to launch recognition'));
        return;
      }

      // Poll for result
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const result = await wrap('getResult', key);
        if (result && result.length > 0) {
          const parsed = JSON.parse(result);
          if (parsed.done) {
            resolve(parsed);
            return;
          }
          if (parsed.error) {
            reject(new Error(parsed.error));
            return;
          }
        }
        await new Promise(r => setTimeout(r, 200));
      }
      reject(new Error('Recognition timed out'));
    } catch (e) {
      reject(e);
    }
  });
}

export const OcrNative = {
  isReady() { return wrap('isReady').then(r => ({ ready: r })); },
  loadModels() { return wrap('loadModels'); },
  getStatus() { return wrap('getStatus'); },

  recognizeFormula(opts) {
    return recognizeAsync(opts.image, 'recognizeFormula');
  },

  recognizeText(opts) {
    return recognizeAsync(opts.image, 'recognizeText');
  },

  recognizeMixed(opts) {
    return recognizeAsync(opts.image, 'recognizeMixed');
  },

  saveSettings(opts) { return wrap('saveSettings', opts.settings); },
  loadSettings() { return wrap('loadSettings').then(r => ({ settings: r })); },
  setAcceleration(opts) { return wrap('setAcceleration', opts.mode); },
  addListener() { return { remove: () => {} }; },
  removeAllListeners() {},
};

export function isNativeOcrAvailable() {
  return typeof window.NativeOcr !== 'undefined' && window.NativeOcr !== null;
}

export function waitForNativeOcr(timeout = 8000) {
  return new Promise((resolve) => {
    if (isNativeOcrAvailable()) return resolve(true);
    const start = Date.now();
    const check = () => {
      if (isNativeOcrAvailable()) return resolve(true);
      if (Date.now() - start > timeout) return resolve(false);
      setTimeout(check, 50);
    };
    check();
  });
}

export async function loadModelsAndWait(timeoutMs = 180000) {
  const result = await OcrNative.loadModels();
  if (result === 'ok') return true;
  const start = Date.now();
  const expectedMs = 15000; // ~15s expected loading time
  while (Date.now() - start < timeoutMs) {
    const status = await OcrNative.getStatus();
    if (status === 'ready') return true;
    // Estimate progress based on elapsed time (capped at 90%)
    const elapsed = Date.now() - start;
    const pct = Math.min(90, Math.round(elapsed / expectedMs * 70));
    OcrNative._loadProgress = pct;
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}
