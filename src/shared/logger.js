/**
 * Logger — centralized debug logging with persistence.
 * Records system info, errors, model loading, and recognition details.
 * All logs are persisted to localStorage and can be exported from settings.
 */

    // Static import ensures JSZip is bundled correctly by Vite
import JSZipModule from 'jszip';
const JSZip = JSZipModule.default || JSZipModule;

const MAX_LOG_LINES = 1000;
const LOG_KEY = 'ls_log';

let logBuffer = [];

/** Reload log buffer from localStorage */
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
  logBuffer.push(`[${timestamp()}][${level}][${tag}] ${msg}`);
  save();
  if (level === 'ERROR' || level === 'WARN') {
    console.warn(`[${tag}] ${msg}`);
  } else {
    console.debug(`[${tag}] ${msg}`);
  }
}

const Logger = {
  info(tag, msg) { push('INFO', tag, msg); },
  warn(tag, msg) { push('WARN', tag, msg); },
  error(tag, msg, err) {
    let text = msg;
    if (err) {
      text += ' | ' + (err.message || err);
      if (err.stack) text += '\n' + err.stack.split('\n').slice(0, 5).join('\n');
    }
    push('ERROR', tag, text);
  },

  /** Log system info at startup */
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

  /** Get all log text for export */
  getExportText() {
    load();
    const lines = logBuffer.slice(-500);
    return [
      '=== LaTeXSnipper 调试日志 ===',
      `导出时间: ${new Date().toLocaleString('zh-CN')}`,
      `平台: ${typeof window.NativeOcr !== 'undefined' ? 'Android' : '浏览器'}`,
      `用户代理: ${navigator.userAgent}`,
      '',
      ...lines,
    ].join('\n');
  },

  /** Get last N lines for display */
  getLastLines(n = 100) {
    load();
    return logBuffer.slice(-n);
  },

  clear() {
    logBuffer = [];
    try { localStorage.removeItem(LOG_KEY); } catch (_) {}
  },

  /** Export all diagnostic info as a ZIP blob (uses JSZip) */
  async exportAsZip() {
    const zip = new JSZip();

    // 1. Main log
    zip.file('latexsnipper-log.txt', this.getExportText());

    // 2. System info JSON
    const sysInfo = {
      time: new Date().toLocaleString('zh-CN'),
      platform: typeof window.NativeOcr !== 'undefined' ? 'Android' : 'Browser',
      userAgent: navigator.userAgent,
      language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
      deviceMemory: navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'unknown',
      nativeOcr: typeof window.NativeOcr !== 'undefined' ? 'YES' : 'NO',
      capacitor: typeof window.Capacitor !== 'undefined' ? 'YES' : 'NO',
      online: navigator.onLine,
      localStorage: (() => { try { return !!localStorage; } catch(_) { return false; } })(),
    };
    zip.file('system-info.json', JSON.stringify(sysInfo, null, 2));

    // 3. Saved settings
    try {
      const settings = JSON.parse(localStorage.getItem('ls_settings') || '{}');
      // Redact API keys
      if (settings.apiKey) settings.apiKey = settings.apiKey.substring(0, 8) + '...';
      if (settings.polishApiKey) settings.polishApiKey = settings.polishApiKey.substring(0, 8) + '...';
      zip.file('settings.json', JSON.stringify(settings, null, 2));
    } catch (_) {}

    // 4. Model info
    const modelInfo = {
      formulaDetection: 'mathcraft-mfd.onnx (YOLOv8)',
      formulaRecognition: 'encoder_model.onnx + decoder_model.onnx (TrOCR)',
      textDetection: 'ppocrv5_mobile_det.onnx (DBNet)',
      textRecognition: 'ppocrv5_mobile_rec.onnx (CRNN)',
      regionDetection: 'chinese_detector.onnx',
      docOrientation: 'pplcnet_doc_ori.onnx',
    };
    zip.file('model-info.json', JSON.stringify(modelInfo, null, 2));

    // Generate blob
    return await zip.generateAsync({ type: 'blob' });
  },
};

export default Logger;
