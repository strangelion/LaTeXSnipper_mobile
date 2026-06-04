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

  // ── Key configuration for Math Live-like experience ──
  // manual = show keyboard on user button click (not auto on focus)
  mathField.mathVirtualKeyboardPolicy = 'manual';
  // smartFence: auto-close fences like (), {}, []
  mathField.smartFence = true;
  // smartMode: automatically switch between text/math mode
  mathField.smartMode = true;

  mathField.style.minHeight = '220px';
  mathField.style.fontSize = '1.4rem';
  mathField.style.width = '100%';
  mathField.style.border = '1px solid var(--border-color)';
  mathField.style.borderRadius = '10px';
  mathField.style.background = 'var(--card-bg)';
  mathField.style.padding = '0.75rem';

  // Long-press context menu
  mathField.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (mathField.menu && typeof mathField.menu.show === 'function') {
      mathField.menu.show();
    }
  });
  mathField.id = 'mathField';

  // Virtual keyboard container
  try {
    if (window.mathVirtualKeyboard) {
      window.mathVirtualKeyboard.container = document.body;
      window.mathVirtualKeyboard.style = {
        ...(window.mathVirtualKeyboard.style || {}),
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)',
      };
      window.mathVirtualKeyboard.showKeyboardButton = true;

      const closeOnOutsideTap = (e) => {
        if (!window.mathVirtualKeyboard.visible) return;
        const kbd = document.querySelector('math-virtual-keyboard');
        if (kbd && (kbd.contains(e.target) || e.target.closest('math-field'))) return;
        if (e.target.closest('#editorKbdToggle')) return;
        if (e.target.closest('.editor-footer-actions')) return;
        // When user taps outside while MathLive keyboard is open,
        // hide keyboard but don't change state — tapping toggle again
        // will re-open MathLive keyboard without going through OFF state
        window.mathVirtualKeyboard.visible = false;
      };
      document.addEventListener('pointerdown', closeOnOutsideTap);
    }
  } catch (_) {}

  // Append to editor page — just source display left
  hostEl = document.getElementById('page-editor')?.querySelector('.editor-wrap');
  if (hostEl) {
    const sourceEl = document.getElementById('editorLatexSource');
    // Insert mathField before the source display (or just append)
    if (sourceEl) {
      hostEl.insertBefore(mathField, sourceEl);
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

  // Copy button in preview actions bar
  document.getElementById('editorCopy')?.addEventListener('click', async () => {
    const latex = mathField.value?.trim();
    if (!latex) return;
    const { t } = await import('../lang/i18n.js');
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

  // Show raw LaTeX source only
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

// Toggle virtual keyboard — 3-state cycle
//   state 0: no keyboard (hidden)
//   state 1: MathLive virtual keyboard
//   state 2: system native keyboard
//   → back to state 0
let _kbdState = 0; // 0=off, 1=mathlive, 2=system

function _setKbdState(newState) {
  _kbdState = newState;
  // Use body data attribute for CSS to target (html may not work in all WebViews)
  if (typeof document !== 'undefined') {
    document.body.dataset.kbdState = String(newState);
  }
  // Update toggle button text via i18n or fallback labels
  const btn = document.getElementById('editorKbdToggle');
  if (btn) {
    const labels = ['', 'Math键盘', '系统键盘'];
    const icons = [
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M6 16h12"/></svg>',
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M6 16h12"/></svg>',
    ];
    if (newState === 0) {
      btn.innerHTML = icons[0] + ' 键盘';
    } else {
      btn.innerHTML = icons[newState] + ' ' + labels[newState] + ' ✕';
    }
  }
}

export function toggleKeyboard() {
  if (!mathField) return;
  const nextState = (_kbdState + 1) % 3;

  if (nextState === 0) {
    // OFF: hide all keyboards
    if (window.mathVirtualKeyboard) {
      window.mathVirtualKeyboard.visible = false;
    }
    mathField.mathVirtualKeyboardPolicy = 'manual';
    mathField.removeAttribute('inputmode');
    mathField.blur();
  } else if (nextState === 1) {
    // MathLive virtual keyboard
    mathField.mathVirtualKeyboardPolicy = 'manual';
    mathField.setAttribute('inputmode', 'none');
    mathField.focus();
    // Give focus time to settle, then show MathLive keyboard
    requestAnimationFrame(() => {
      mathField.executeCommand('toggleVirtualKeyboard');
    });
  } else if (nextState === 2) {
    // System native keyboard: hide MathLive, show native
    if (window.mathVirtualKeyboard) {
      window.mathVirtualKeyboard.visible = false;
    }
    mathField.mathVirtualKeyboardPolicy = 'auto';
    mathField.removeAttribute('inputmode');
    mathField.focus();
  }

  _setKbdState(nextState);
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
