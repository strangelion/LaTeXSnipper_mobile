/**
 * Logger — centralized debug logging for both JS and Java (NativeOcr) layers.
 * All logs from Java are posted via @JavascriptInterface to the JS log buffer.
 * All logs are persisted to localStorage and can be exported as diagnostic ZIP.
 */


const MAX_LOG_LINES = 2000;
const LOG_KEY = 'ls_log';

let logBuffer = [];

function load() {
  try {
    const saved = localStorage.getItem(LOG_KEY);
    logBuffer = saved ? saved.split('\n').filter(Boolean) : [];
  } catch (_) { logBuffer = []; }
}

function save() {
  try {
    localStorage.setItem(LOG_KEY, logBuffer.slice(-MAX_LOG_LINES).join('\n'));
  } catch (_) {}
}

function timestamp() {
  const d = new Date();
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' +
    String(d.getMilliseconds()).padStart(3, '0');
}

function push(level, tag, msg) {
  load();
  const entry = `[${timestamp()}][${level}][${tag}] ${msg}`;
  logBuffer.push(entry);
  save();
  // Forward to native log if available (tagged)
  _forwardToNative(level, tag, msg);
  // Also emit as DOM event for dev console (captured by settings.js)
  _emitLogEvent(level, tag, msg);
  // Console output
  if (level === 'ERROR' || level === 'WARN') {
    console.warn(`[${tag}] ${msg}`);
  } else {
    console.debug(`[${tag}] ${msg}`);
  }
}

function _forwardToNative(level, tag, msg) {
  try {
    if (typeof window.NativeOcr !== 'undefined' && window.NativeOcr.addLog) {
      window.NativeOcr.addLog(`[JS-${level}][${tag}] ${msg}`);
    }
  } catch(_) {}
}

function _emitLogEvent(level, tag, msg) {
  try {
    window.dispatchEvent(new CustomEvent('ls-log', {
      detail: { level, tag, msg, time: Date.now() }
    }));
  } catch(_) {}
}

// ── Override console methods to capture ALL output ──
// This intercepts every console.log/warn/error, including from
// third-party libraries, and captures the stack trace for errors.

const _origLog = console.log;
const _origWarn = console.warn;
const _origError = console.error;
const _origDebug = console.debug;

console.log = function(...args) {
  _captureConsole('INFO', args);
  _origLog.apply(console, args);
};

console.debug = function(...args) {
  _captureConsole('DEBUG', args);
  _origDebug.apply(console, args);
};

console.warn = function(...args) {
  _captureConsole('WARN', args);
  _origWarn.apply(console, args);
};

console.error = function(...args) {
  _captureConsole('ERROR', args);
  // For Error objects, include stack trace
  const errorObj = args.find(a => a instanceof Error);
  if (errorObj && errorObj.stack) {
    _captureConsole('ERROR', [errorObj.stack.split('\n').slice(0, 8).join('\n')]);
  }
  _origError.apply(console, args);
};

function _captureConsole(level, args) {
  const msg = args.map(a => {
    if (a instanceof Error) return a.message + '\n' + (a.stack || '').split('\n').slice(0, 5).join('\n');
    if (typeof a === 'object') try { return JSON.stringify(a, null, 1); } catch(_) { return String(a); }
    return String(a);
  }).join(' ');
  load();
  const tagMatch = msg.match(/^\[([^\]]+)\]/);
  const tag = tagMatch ? tagMatch[1] : 'CONSOLE';
  logBuffer.push(`[${timestamp()}][${level}][${tag}] ${msg}`);
  save();
}

const Logger = {
  info(tag, msg) { push('INFO', tag, msg); try { if (typeof window.NativeOcr !== 'undefined') window.NativeOcr.addLog('[JS-INFO][' + tag + '] ' + msg); } catch(_){} },
  warn(tag, msg) { push('WARN', tag, msg); try { if (typeof window.NativeOcr !== 'undefined') window.NativeOcr.addLog('[JS-WARN][' + tag + '] ' + msg); } catch(_){} },
  error(tag, msg, err) {
    let text = msg;
    if (err) {
      text += ' | ' + (err.message || err);
      if (err.stack) text += '\n' + err.stack.split('\n').slice(0, 5).join('\n');
    }
    push('ERROR', tag, text);
    try { if (typeof window.NativeOcr !== 'undefined') window.NativeOcr.addLog('[JS-ERROR][' + tag + '] ' + text); } catch(_){}
  },

  /**
   * Accept logs from Java NativeOcr via @JavascriptInterface.
   * Called from NativeOcrBridge.exportLogs() which pumps accumulated Java logs.
   */
  ingestJavaLogs(line) {
    if (!line) return;
    load();
    logBuffer.push(line);
    save();
  },

  logSystemInfo() {
    load();
    logBuffer.push('═══════════════════════════════════════');
    logBuffer.push(`启动时间: ${new Date().toLocaleString('zh-CN')}`);
    logBuffer.push(`用户代理: ${navigator.userAgent}`);
    logBuffer.push(`平台: ${navigator.platform || 'unknown'}`);
    logBuffer.push(`语言: ${navigator.language}`);
    logBuffer.push(`硬件并发: ${navigator.hardwareConcurrency || 'unknown'}`);
    logBuffer.push(`内存: ${navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'unknown'}`);
    logBuffer.push(`NativeOcr: ${typeof window.NativeOcr !== 'undefined'}`);
    logBuffer.push(`Capacitor: ${typeof window.Capacitor !== 'undefined'}`);
    logBuffer.push(`连接: ${navigator.onLine ? '在线' : '离线'}`);
    logBuffer.push('═══════════════════════════════════════');
    save();
  },

  getExportText() {
    load();
    const lines = logBuffer.slice(-MAX_LOG_LINES);
    let text = [
      '=== LaTeXSnipper 调试日志 ===',
      `导出时间: ${new Date().toLocaleString('zh-CN')}`,
      `平台: ${typeof window.NativeOcr !== 'undefined' ? 'Android' : '浏览器'}`,
      `用户代理: ${navigator.userAgent}`,
      '',
      ...lines,
    ].join('\n');

    // Append Java native logs
    if (typeof window.NativeOcr !== 'undefined' && window.NativeOcr.getLogs) {
      try {
        const javaLogs = window.NativeOcr.getLogs();
        if (javaLogs && javaLogs.trim()) {
          text += '\n\n══════ Java Native Logs ══════\n' + javaLogs;
        }
      } catch (_) {}
    }
    return text;
  },

  getLastLines(n = 100) {
    load();
    return logBuffer.slice(-n);
  },

  clear() {
    logBuffer = [];
    try { localStorage.removeItem(LOG_KEY); } catch (_) {}
  },

/** Export diagnostic ZIP with log, system info, settings, model info */
  async exportAsZip() {
    const zip = new JSZip();

    // 1. Main log (latest 2000 lines)
    zip.file('debug-log.txt', this.getExportText());

    // 2. System info
    const sysInfo = {
      exportTime: new Date().toLocaleString('zh-CN'),
      platform: typeof window.NativeOcr !== 'undefined' ? 'Android' : 'Browser',
      userAgent: navigator.userAgent,
      language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
      deviceMemory: navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'unknown',
      nativeOcr: typeof window.NativeOcr !== 'undefined' ? 'YES' : 'NO',
    };
    zip.file('system.json', JSON.stringify(sysInfo, null, 2));

    // 3. Settings (redacted)
    try {
      const settings = JSON.parse(localStorage.getItem('ls_settings') || '{}');
      if (settings.apiKey) settings.apiKey = settings.apiKey.substring(0, 8) + '...';
      if (settings.polishApiKey) settings.polishApiKey = settings.polishApiKey.substring(0, 8) + '...';
      zip.file('settings.json', JSON.stringify(settings, null, 2));
    } catch (_) {}

    // 4. Model manifest
    zip.file('models.json', JSON.stringify({
      formulaDetection: 'mathcraft-mfd.onnx (YOLOv8)',
      formulaRecognition: 'encoder_model.onnx + decoder_model.onnx (TrOCR)',
      textDetection: 'ppocrv5_mobile_det.onnx (DBNet)',
      textRecognition: 'ppocrv5_mobile_rec.onnx (CRNN)',
      docOrientation: 'pplcnet_doc_ori.onnx',
    }, null, 2));

    // 5. Native Java logs
    if (typeof window.NativeOcr !== 'undefined' && window.NativeOcr.getLogs) {
      try {
        const javaLogs = await window.NativeOcr.getLogs();
        if (javaLogs) zip.file('native-log.txt', javaLogs);
      } catch (_) {}
    }

    return await zip.generateAsync({ type: 'blob' });
  },

  /** Export diagnostic text file and share via system share dialog */
  async exportAndShare() {
    const text = this.getExportText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const { shareFile } = await import('../export/share.js');
    await shareFile(blob, 'latexsnipper-debug-log.txt', '', {
      title: 'LaTeXSnipper 调试日志',
      dialogTitle: '导出调试日志',
    });
  },
};

export default Logger;
