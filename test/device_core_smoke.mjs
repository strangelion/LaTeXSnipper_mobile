#!/usr/bin/env node

// Real Android WebView smoke test. Before running, forward a debuggable WebView:
//   adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>

const endpoint = (process.argv[2] || 'http://127.0.0.1:9222').replace(/\/$/, '');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`  ✅ ${message}`);
}

const targets = await fetch(`${endpoint}/json`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
assert(target, 'Android WebView debug target is available');

function evaluate(expression, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Android WebView evaluation timed out'));
    }, timeoutMs);

    socket.onopen = () => socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
    socket.onerror = () => reject(new Error('Unable to connect to Android WebView CDP'));
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (message.result?.exceptionDetails) {
        reject(new Error(message.result.exceptionDetails.text || 'WebView evaluation failed'));
        return;
      }
      resolve(message.result?.result?.value);
    };
  });
}

const result = await evaluate(`
  (async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 220;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111111';
    context.font = '76px serif';
    context.textBaseline = 'middle';
    context.fillText('x² + y² = z²', 64, 110);

    const key = window.NativeOcr.recognizeFormula(canvas.toDataURL('image/png'));
    let nativeResult = null;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const raw = window.NativeOcr.getResult(key);
      if (raw) {
        const candidate = JSON.parse(raw);
        if (candidate.done || candidate.error) {
          nativeResult = candidate;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!nativeResult) throw new Error('Native OCR timed out');
    if (nativeResult.error) throw new Error(nativeResult.error);

    const coreResource = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => /core-runtime-[^/]+\\.js$/.test(name));
    if (!coreResource) throw new Error('Core runtime chunk was not loaded');
    const core = await import(coreResource);
    const mobileResult = {
      blocks: nativeResult.latex ? [{
        type: 'formula',
        content: nativeResult.latex,
        confidence: nativeResult.confidence || 0,
        mathStyle: 'display',
      }] : [],
      confidence: nativeResult.confidence || 0,
      raw: nativeResult.latex || '',
      meta: { timeMs: nativeResult.timeMs || 0, model: 'android-device-smoke' },
    };
    const enriched = await core.attachCoreDocument(mobileResult, {
      model: 'android-device-smoke',
      pipelineVersion: 'device-smoke-v1',
    });
    window.__lastOcrResult = enriched;
    return {
      nativeDone: nativeResult.done === true,
      latex: nativeResult.latex || '',
      confidence: nativeResult.confidence || 0,
      core: enriched.meta.core,
      documentBlocks: enriched.document.pages[0].blocks.length,
    };
  })()
`);

assert(result?.nativeDone, 'native Android ONNX recognition completed');
assert(result?.core?.available, 'native recognition result was accepted by Core');
assert(result.core.coreVersion === '3.2.0', 'device uses pinned Core 3.2.0');
assert(result.core.documentSchemaVersion === '1.0.0', 'device uses Document schema 1.0.0');

console.log(JSON.stringify({
  latex: result.latex,
  confidence: result.confidence,
  documentBlocks: result.documentBlocks,
}, null, 2));
