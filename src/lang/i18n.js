// i18n engine — lightweight zero-dependency translation
// All keys are flat strings (e.g. "history.empty", "status.ready")

let _lang = 'zh-CN';
let _dict = {};
let _fallbackDict = {};
let _reloadCallbacks = [];

const LANG_MAP = {
  'zh-CN': () => import('./zh-CN.js'),
  'zh-TW': () => import('./zh-TW.js'),
  'zh': () => import('./zh-CN.js'),
  'en': () => import('./en.js'),
  'ja': () => import('./ja.js'),
  'ko': () => import('./ko.js'),
};

function _detectLang() {
  try {
    const saved = localStorage.getItem('latexsnipper-lang');
    if (saved && LANG_MAP[saved]) return saved;
  } catch (_) {}
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('zh')) {
    if (nav.includes('hant') || nav.includes('hk') || nav.includes('tw')) return 'zh-TW';
    return 'zh-CN';
  }
  if (nav.startsWith('ja')) return 'ja';
  if (nav.startsWith('ko')) return 'ko';
  return 'en';
}

async function _loadDict(code) {
  const loader = LANG_MAP[code] || LANG_MAP['en'];
  try {
    const mod = await loader();
    return mod.default || mod;
  } catch (_) {
    return {};
  }
}

export async function initI18n() {
  _lang = _detectLang();
  try { _fallbackDict = (await import('./zh-CN.js')).default; } catch (_) { _fallbackDict = {}; }
  const langDict = await _loadDict(_lang);
  _dict = { ..._fallbackDict, ...langDict };
  return _lang;
}

export function t(key, params) {
  let val = _dict[key];
  if (typeof val !== 'string') val = _fallbackDict[key];
  if (typeof val !== 'string') return key;
  if (params) {
    return val.replace(/\{\{(\w+)\}\}/g, (_, name) =>
      params[name] != null ? String(params[name]) : `{{${name}}}`
    );
  }
  return val;
}

export function currentLang() { return _lang; }

export async function setLang(code) {
  if (code === _lang) return;
  _lang = code;
  try { localStorage.setItem('latexsnipper-lang', code); } catch (_) {}
  const langDict = await _loadDict(code);
  _dict = { ..._fallbackDict, ...langDict };
  translateDOM();
  // Notify callbacks (for dynamic text that was set via JS)
  if (_reloadCallbacks.length) {
    _reloadCallbacks.forEach(fn => { try { fn(); } catch (_) {} });
  }
}

// Register a callback to re-run when language changes
export function onLangChange(fn) {
  _reloadCallbacks.push(fn);
}

// DOM utility — translate all elements with data-i18n attribute
export function translateDOM(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    // Elements with data-i18n-html use innerHTML (preserves <strong>, <kbd>, etc.)
    if (el.hasAttribute('data-i18n-html')) {
      el.innerHTML = t(key);
      return;
    }
    // If element has child elements (like SVG icons, inputs), only update trailing text nodes
    if (el.children.length > 0) {
      const textNodes = [];
      for (const child of el.childNodes) {
        if (child.nodeType === 3 && child.textContent.trim()) {
          textNodes.push(child);
        }
      }
      if (textNodes.length > 0) {
        textNodes[textNodes.length - 1].textContent = t(key);
        return;
      }
    }
    el.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.placeholder = t(key);
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);
  });
}
