// MathLive editor — full WYSIWYG formula editor with virtual keyboard
const MATHLIVE_ZH = {
  'keyboard.tooltip.symbols': '符号',
  'keyboard.tooltip.greek': '希腊字母',
  'keyboard.tooltip.numeric': '数字',
  'keyboard.tooltip.alphabetic': '罗马字母',
  'tooltip.copy to clipboard': '复制到剪贴板',
  'tooltip.cut to clipboard': '剪切到剪贴板',
  'tooltip.paste from clipboard': '从剪贴板粘贴',
  'tooltip.redo': '重做',
  'tooltip.toggle virtual keyboard': '切换虚拟键盘',
  'tooltip.menu': '菜单',
  'tooltip.undo': '撤销',
  'menu.borders': '矩阵边框',
  'menu.insert matrix': '插入矩阵',
  'menu.array.add row above': '上方添加行',
  'menu.array.add row below': '下方添加行',
  'menu.array.add column after': '右侧添加列',
  'menu.array.add column before': '左侧添加列',
  'menu.array.delete row': '删除行',
  'menu.array.delete rows': '删除选中行',
  'menu.array.delete column': '删除列',
  'menu.array.delete columns': '删除选中列',
  'menu.mode': '模式',
  'menu.mode-math': '数学',
  'menu.mode-text': '文本',
  'menu.mode-latex': 'LaTeX',
  'menu.insert': '插入',
  'menu.insert.abs': '绝对值',
  'menu.insert.nth-root': 'n 次根号',
  'menu.insert.log-base': '对数 (log)',
  'menu.insert.heading-calculus': '微积分',
  'menu.insert.derivative': '导数',
  'menu.insert.nth-derivative': 'n 阶导数',
  'menu.insert.integral': '积分',
  'menu.insert.sum': '求和',
  'menu.insert.product': '乘积',
  'menu.insert.heading-complex-numbers': '复数',
  'menu.insert.modulus': '模',
  'menu.insert.argument': '辐角',
  'menu.insert.real-part': '实部',
  'menu.insert.imaginary-part': '虚部',
  'menu.insert.conjugate': '共轭',
  'tooltip.blackboard': '黑板粗体', 'tooltip.bold': '粗体',
  'tooltip.italic': '斜体', 'tooltip.fraktur': '哥特体',
  'tooltip.script': '手写体', 'tooltip.caligraphic': '书法体',
  'tooltip.typewriter': '等宽', 'tooltip.roman-upright': '罗马正体',
  'tooltip.row-by-col': '%@ × %@',
  'menu.font-style': '字体风格',
  'menu.accent': '重音/修饰', 'menu.decoration': '装饰',
  'menu.color': '颜色', 'menu.background-color': '背景',
  'menu.evaluate': '计算', 'menu.simplify': '化简', 'menu.solve': '求解',
  'menu.solve-for': '求解 %@',
  'menu.cut': '剪切', 'menu.copy': '复制',
  'menu.copy-as-latex': '复制为 LaTeX', 'menu.copy-as-typst': '复制为 Typst',
  'menu.copy-as-ascii-math': '复制为 ASCII Math', 'menu.copy-as-mathml': '复制为 MathML',
  'menu.paste': '粘贴', 'menu.select-all': '全选',
  'color.red': '红色', 'color.orange': '橙色',
  'color.yellow': '黄色', 'color.lime': '青柠色',
  'color.green': '绿色', 'color.teal': '蓝绿色',
  'color.cyan': '青色', 'color.blue': '蓝色',
  'color.indigo': '靛蓝色', 'color.purple': '紫色',
  'color.magenta': '品红色', 'color.black': '黑色',
  'color.dark-grey': '深灰色', 'color.grey': '灰色',
  'color.light-grey': '浅灰色', 'color.white': '白色',
};

let mathField = null;
let hostEl = null;
let _kbdState = 0; // 0=off, 1=mathlive, 2=system

function _updateToggleBtn() {
  const btn = document.getElementById('editorKbdToggle');
  if (!btn) return;
  const LABELS = ['键盘', 'Math 键盘', '系统键盘'];
  btn.innerHTML = LABELS[_kbdState];
  btn.classList.toggle('active', _kbdState !== 0);
}

function _setKbdState(newState) {
  _kbdState = newState;
  if (typeof document !== 'undefined') {
    document.body.dataset.kbdState = String(newState);
  }
  _updateToggleBtn();
}

export function initEditor() {
  if (typeof MathfieldElement === 'undefined') {
    setTimeout(initEditor, 200);
    return;
  }

  // Chinese locale
  try { MathfieldElement.strings = { 'zh-CN': MATHLIVE_ZH }; } catch (_) {}
  try { MathfieldElement.locale = 'zh-CN'; } catch (_) {}
  MathfieldElement.fontsDirectory = '/vendor/mathlive/fonts';

  // Create MathfieldElement
  mathField = new MathfieldElement();

  // ── Key configuration ──
  mathField.mathVirtualKeyboardPolicy = 'manual';
  mathField.smartFence = true;
  mathField.smartMode = true;

  mathField.style.minHeight = '220px';
  mathField.style.fontSize = '1.4rem';
  mathField.style.width = '100%';
  mathField.style.border = '1px solid var(--border-color)';
  mathField.style.borderRadius = '10px';
  mathField.style.background = 'var(--card-bg)';
  mathField.style.color = 'var(--fg)';
  mathField.style.padding = '0.75rem';

  // Long-press context menu
  mathField.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (mathField.menu && typeof mathField.menu.show === 'function') {
      mathField.menu.show();
    }
  });
  mathField.id = 'mathField';

  // Virtual keyboard container config
  try {
    if (window.mathVirtualKeyboard) {
      window.mathVirtualKeyboard.container = document.body;
      window.mathVirtualKeyboard.style = {
        ...(window.mathVirtualKeyboard.style || {}),
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)',
      };
      window.mathVirtualKeyboard.showKeyboardButton = true;
    }
  } catch (_) {}

  // Append to editor page
  hostEl = document.getElementById('page-editor')?.querySelector('.editor-wrap');
  if (hostEl) {
    // Insert after the kbd bar (first child)
    const ref = hostEl.querySelector('.editor-kbd-bar')?.nextSibling || null;
    if (ref) {
      hostEl.insertBefore(mathField, ref);
    } else {
      hostEl.appendChild(mathField);
    }
  }

  // Sync preview on input
  mathField.addEventListener('input', syncPreview);

  // Calculator toolbar
  document.querySelectorAll('.calc-btn').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const action = btn.dataset.action;
      if (action === 'backspace') {
        mathField.executeCommand('deleteBackward');
        mathField.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (action === 'evaluate') {
        try {
          const latex = mathField.value?.trim();
          if (!latex) return;
          if (mathField.expression && typeof mathField.expression.evaluate === 'function') {
            const result = mathField.expression.evaluate();
            if (result && result.latex) {
              mathField.value = result.latex;
              mathField.dispatchEvent(new Event('input', { bubbles: true }));
            }
          } else {
            mathField.insert('=');
          }
        } catch (_) { mathField.insert('='); }
        return;
      }
      const latex = btn.dataset.latex;
      if (latex) mathField.insert(latex);
    });
  });

  // Copy button
  document.getElementById('editorCopy')?.addEventListener('click', async () => {
    const latex = mathField.value?.trim();
    if (!latex) return;
    const { t } = await import('../core/i18n.js');
    navigator.clipboard.writeText(latex).then(() => {
      const b = document.getElementById('editorCopy');
      if (b) { b.textContent = t('btn.copied'); setTimeout(() => b.textContent = t('editor.copyLatex'), 1500); }
    });
  });

  syncPreview();
}

function syncPreview() {
  const latex = mathField?.value || '';
  const source = document.getElementById('editorLatexSource');
  const previewActions = document.getElementById('editorPreviewActions');

  if (!latex.trim()) {
    if (source) { source.classList.remove('show'); source.textContent = ''; }
    if (previewActions) previewActions.style.display = 'none';
    return;
  }
  if (previewActions) previewActions.style.display = 'flex';

  if (source) {
    source.textContent = latex;
    source.classList.add('show');
  }
}

// Fill editor from OCR/history
export function setEditorContent(latex) {
  if (!mathField) { initEditor(); setTimeout(() => setEditorContent(latex), 300); return; }
  mathField.value = latex;
  mathField.dispatchEvent(new Event('input', { bubbles: true }));
  const t = document.querySelector('.bottom-nav button[data-page="editor"]');
  if (t) t.click();
}

// ── 3-state keyboard toggle ──
export function toggleKeyboard() {
  if (!mathField) return;
  const nextState = (_kbdState + 1) % 3;

  console.debug('[LaTeXSnipper] toggleKeyboard: state', _kbdState, '→', nextState);

  // Hide any active keyboard first
  if (window.mathVirtualKeyboard) {
    window.mathVirtualKeyboard.visible = false;
  }
  _hideSysKbdProxy();

  if (nextState === 0) {
    // OFF: no keyboard
    mathField.mathVirtualKeyboardPolicy = 'manual';
    mathField.removeAttribute('inputmode');
    mathField.blur();
  } else if (nextState === 1) {
    // MathLive virtual keyboard
    mathField.mathVirtualKeyboardPolicy = 'manual';
    mathField.setAttribute('inputmode', 'none');
    mathField.focus();
    setTimeout(() => {
      console.debug('[LaTeXSnipper] toggleKeyboard: showing MathLive kbd');
      mathField.executeCommand('toggleVirtualKeyboard');
    }, 100);
  } else if (nextState === 2) {
    // System native keyboard
    // MathLive's 'sandboxed' strategy is mapped to 'manual' in this version.
    // Android WebView does not connect system keyboard (IME) to Shadow DOM
    // contenteditable elements inside custom elements like <math-field>.
    //
    // Solution: an opaque <textarea> proxy overlays the editor area.
    // It receives DOM focus and triggers the IME; input is forwarded to
    // MathLive via mathField.insert(). No mathField.focus() needed.
    console.debug('[LaTeXSnipper] toggleKeyboard: switching to proxy');
    mathField.mathVirtualKeyboardPolicy = 'manual';
    mathField.setAttribute('inputmode', 'none');
    setTimeout(() => {
      console.debug('[LaTeXSnipper] toggleKeyboard: showing proxy');
      _showSysKbdProxy();
    }, 80);
  }

  _setKbdState(nextState);
}

// ── Offscreen proxy for system keyboard IME ──
// Named with $ prefix to avoid conflict with other variables
const ZWS = '​'; // zero-width space, prevents Android from hiding IME when content is empty
let _$proxy = null;
let _$proxyReady = false;

function _resetProxyValue() {
  if (_$proxy) {
    _$proxy.value = ZWS;
    // Place cursor after ZWS so new input appends after it
    if (_$proxy.setSelectionRange) {
      _$proxy.setSelectionRange(ZWS.length, ZWS.length);
    }
  }
}

function _initSysKbdProxy() {
  if (_$proxyReady) return;
  console.debug('[LaTeXSnipper] _initSysKbdProxy');
  const p = document.createElement('textarea');
  p.setAttribute('inputmode', 'text');
  p.setAttribute('autocomplete', 'off');
  p.setAttribute('autocorrect', 'off');
  p.setAttribute('autocapitalize', 'off');
  p.setAttribute('spellcheck', 'false');

  // Position fixed directly over math-field so taps on editor hit
  // the proxy (keep focus) rather than going to the background.
  // NOT offscreen: Android hides IME when focused element is outside viewport.
  // Height/width recalculated on each show to handle layout changes.
  p.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 1px',
    'height: 1px',
    'opacity: 0',
    'resize: none',
    'border: none',
    'outline: none',
    'padding: 0',
    'margin: 0',
    'background: transparent',
    'color: transparent',
    'font-size: 16px',
    'overflow: hidden',
    'z-index: 9999',
  ].join(';');

  let composing = false;

  p.addEventListener('compositionstart', () => { composing = true; });

  p.addEventListener('compositionend', (e) => {
    composing = false;
    console.debug('[LaTeXSnipper] proxy compositionend:', e.data);
    if (e.data && mathField) {
      mathField.insert(e.data);
      mathField.dispatchEvent(new Event('input', { bubbles: true }));
    }
    _resetProxyValue();
  });

  p.addEventListener('input', () => {
    if (composing || !mathField) return;
    const val = p.value;
    if (!val) return;
    // Filter out our ZWS placeholder
    if (val !== ZWS) {
      console.debug('[LaTeXSnipper] proxy input:', val);
      mathField.insert(val.replace(ZWS, ''));
      mathField.dispatchEvent(new Event('input', { bubbles: true }));
    }
    _resetProxyValue();
  });

  p.addEventListener('keydown', (e) => {
    if (!mathField || composing) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      console.debug('[LaTeXSnipper] proxy keydown: Backspace, mathField.value:', mathField.value?.length || 0);
      if (mathField.value) {
        mathField.executeCommand('deleteBackward');
        mathField.dispatchEvent(new Event('input', { bubbles: true }));
      }
      // Android auto-hides IME when textarea value is empty and the
      // connected editor has no content. Keep a non-empty placeholder
      // value so IME stays open after the last character is deleted.
      p.value = mathField.value ? '' : ' ';
    } else if (e.key === 'Delete') {
      e.preventDefault();
      console.debug('[LaTeXSnipper] proxy keydown: Delete');
      mathField.executeCommand('deleteForward');
      mathField.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      console.debug('[LaTeXSnipper] proxy keydown: Enter');
      mathField.insert('\\newline ');
      mathField.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      console.debug('[LaTeXSnipper] proxy keydown:', e.key);
      const cmdMap = { ArrowLeft: 'moveBackward', ArrowRight: 'moveForward', ArrowUp: 'moveUp', ArrowDown: 'moveDown' };
      mathField.executeCommand(cmdMap[e.key]);
    }
  });

  // Track focus/blur on proxy itself
  p.addEventListener('focus', () => {
    console.debug('[LaTeXSnipper] proxy FOCUS (hasFocus:', document.activeElement === p, ')');
  });

  p.addEventListener('blur', (e) => {
    console.debug('[LaTeXSnipper] proxy BLUR → new focus target:', e.relatedTarget?.tagName || 'null', 'kbdState:', _kbdState);
  });

  document.body.appendChild(p);
  _$proxy = p;
  _$proxyReady = true;
}

function _showSysKbdProxy() {
  _initSysKbdProxy();
  if (!_$proxy || !mathField) return;

  // Position the proxy directly over the math-field
  const rect = mathField.getBoundingClientRect();
  _$proxy.style.top = rect.top + 'px';
  _$proxy.style.left = rect.left + 'px';
  _$proxy.style.width = rect.width + 'px';
  _$proxy.style.height = rect.height + 'px';

  _resetProxyValue();
  _$proxy.focus();

  console.debug('[LaTeXSnipper] _showSysKbdProxy rect:', JSON.stringify({top: rect.top, left: rect.left, w: rect.width, h: rect.height}));
  console.debug('[LaTeXSnipper] _showSysKbdProxy, activeElement after:', document.activeElement?.tagName || 'null');

  // Disable contentEditable on math-field's shadow DOM so MathLive
  // cannot steal focus when insert()/deleteBackward() is called.
  // MathLive operates on its atomic model and does NOT require
  // contentEditable to be true for these to work.
  try {
    const sr = mathField.shadowRoot;
    if (sr) {
      if (!_$proxy._ceFocusGuard) {
        _$proxy._ceFocusGuard = (e) => {
          if (_kbdState !== 2 || !_$proxy) return;
          e.stopImmediatePropagation();
          // Disable contentEditable immediately
          const target = e.target;
          if (target?.contentEditable && target.contentEditable !== 'false') {
            target.contentEditable = 'false';
          }
          _$proxy.focus();
        };
      }
      // Guard 1: shadow root capture — catches focus on shadow-internal elements
      sr.removeEventListener('focus', _$proxy._ceFocusGuard, true);
      sr.addEventListener('focus', _$proxy._ceFocusGuard, true);
      // Guard 2: host element capture — catches focus that is retargeted
      // across the shadow boundary (e.g. MathLive calling focus() on host)
      mathField.removeEventListener('focus', _$proxy._ceFocusGuard, true);
      mathField.addEventListener('focus', _$proxy._ceFocusGuard, true);
      // Immediately disable any existing contenteditable
      const ceEl = sr.querySelector('[contenteditable]');
      if (ceEl) ceEl.contentEditable = 'false';
    }
  } catch (e) {
    console.debug('[LaTeXSnipper] failed to disable contentEditable:', e.message);
  }
}

function _hideSysKbdProxy() {
  if (_$proxy) {
    _$proxy.blur();
    _$proxy.value = '';
    // Reset size
    _$proxy.style.width = '1px';
    _$proxy.style.height = '1px';
    _$proxy.style.top = '0';
    _$proxy.style.left = '0';
  }
  // Restore contentEditable on math-field's shadow DOM
  try {
    const sr = mathField?.shadowRoot;
    if (sr) {
      const editable = sr.querySelector('[contenteditable]');
      if (editable) {
        editable.contentEditable = 'true';
      }
    }
  } catch (_) {}
}

export function resetKbdState() {
  if (window.mathVirtualKeyboard) {
    window.mathVirtualKeyboard.visible = false;
  }
  if (mathField) {
    mathField.mathVirtualKeyboardPolicy = 'manual';
    mathField.removeAttribute('inputmode');
    mathField.blur();
  }
  _setKbdState(0);
}

// ── Event bindings (called from main.js via event-registry) ──

export function bindEvents() {
  document.getElementById('editorKbdToggle')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    toggleKeyboard();
  });
  document.getElementById('editorClearBtn')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const mf = document.getElementById('mathField');
    if (mf) { mf.value = ''; mf.dispatchEvent(new Event('input', { bubbles: true })); }
  });
}
