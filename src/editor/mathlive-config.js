// MathLive configuration — Chinese locale + initialization
// Based on LaTeXSnipper desktop app (src/assets/mathlive/app.js)

const MATHLIVE_ZH_STRINGS = {
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
  'tooltip.blackboard': '黑板粗体',
  'tooltip.bold': '粗体',
  'tooltip.italic': '斜体',
  'tooltip.fraktur': '哥特体',
  'tooltip.script': '手写体',
  'tooltip.caligraphic': '书法体',
  'tooltip.typewriter': '等宽',
  'tooltip.roman-upright': '罗马正体',
  'menu.font-style': '字体风格',
  'menu.accent': '重音/修饰',
  'menu.decoration': '装饰',
  'menu.color': '颜色',
  'menu.background-color': '背景',
  'menu.evaluate': '计算',
  'menu.simplify': '化简',
  'menu.solve': '求解',
  'menu.solve-for': '求解 %@',
  'menu.cut': '剪切',
  'menu.copy': '复制',
  'menu.copy-as-latex': '复制为 LaTeX',
  'menu.copy-as-typst': '复制为 Typst',
  'menu.copy-as-ascii-math': '复制为 ASCII Math',
  'menu.copy-as-mathml': '复制为 MathML',
  'menu.paste': '粘贴',
  'menu.select-all': '全选',
  'color.red': '红色',
  'color.orange': '橙色',
  'color.yellow': '黄色',
  'color.lime': '青柠色',
  'color.green': '绿色',
  'color.teal': '蓝绿色',
  'color.cyan': '青色',
  'color.blue': '蓝色',
  'color.indigo': '靛蓝色',
  'color.purple': '紫色',
  'color.magenta': '品红色',
  'color.black': '黑色',
  'color.dark-grey': '深灰色',
  'color.grey': '灰色',
  'color.light-grey': '浅灰色',
  'color.white': '白色',
};

let mathField = null;

export async function initMathLive() {
  // Wait for the custom element to be registered
  await customElements.whenDefined('mathlive-field');

  // Inject Chinese translations (must be done BEFORE creating any MathfieldElement)
  try {
    MathfieldElement.strings = { 'zh-CN': MATHLIVE_ZH_STRINGS };
  } catch (_) {
    try { MathfieldElement.strings = { 'zh-cn': MATHLIVE_ZH_STRINGS }; } catch (_2) { /* */ }
  }
  try {
    MathfieldElement.locale = 'zh-CN';
  } catch (_) { /* */ }

  // Use local fonts (bundled, not CDN)
  MathfieldElement.fontsDirectory = '/vendor/mathlive/fonts';

  // Get the existing element from the page
  mathField = document.getElementById('mathField');
  if (!mathField) return;

  // Configure the editor
  mathField.mathVirtualKeyboardPolicy = 'onfocus';
  mathField.smartFence = true;
  mathField.smartMode = false;

  // ── Two-way sync: LaTeX source textarea ↔ MathLive visual editor ──
  const latexSource = document.getElementById('latexSource');
  let syncing = false; // prevent infinite loop

  function syncSourceToMathLive() {
    if (syncing) return;
    syncing = true;
    mathField.value = latexSource.value;
    syncing = false;
  }

  function syncMathLiveToSource() {
    if (syncing) return;
    syncing = true;
    latexSource.value = mathField.value;
    syncing = false;
  }

  if (latexSource) {
    latexSource.addEventListener('input', syncSourceToMathLive);
    mathField.addEventListener('input', syncMathLiveToSource);
  }

  // Snippet buttons — insert LaTeX via MathLive API
  document.querySelectorAll('.snippet-btn[data-latex]').forEach(btn => {
    btn.addEventListener('click', () => {
      mathField.insert(btn.dataset.latex);
      mathField.focus();
      // Also update the source textarea
      if (latexSource) latexSource.value = mathField.value;
      if (navigator.vibrate) navigator.vibrate(10);
    });
  });

  // Compute buttons — use MathLive ComputeEngine
  document.querySelectorAll('.compute-btn[data-op]').forEach(btn => {
    btn.addEventListener('click', async () => {
      // Get LaTeX from MathLive or fallback to textarea
      let latex = mathField.value?.trim();
      if (!latex && latexSource) latex = latexSource.value?.trim();
      const resultEl = document.getElementById('computeResult');
      if (!resultEl) return;
      if (!latex) { resultEl.textContent = '请先输入公式'; return; }
      const op = btn.dataset.op;
      resultEl.textContent = '计算中…';

      try {
        const ComputeEngine = window.ComputeEngine;
        if (ComputeEngine) {
          const ce = new ComputeEngine();
          const expr = ce.parse(latex);
          let result;
          switch (op) {
            case 'simplify': result = expr.simplify(); break;
            case 'evaluate': result = expr.evaluate(); break;
            case 'expand': result = expr.expand(); break;
            case 'factor': result = expr.factor(); break;
            case 'numeric': result = expr.N(); break;
            default: result = expr;
          }
          resultEl.textContent = result.latex || String(result);
        } else {
          resultEl.textContent = '计算引擎未加载，请刷新页面';
        }
      } catch (e) {
        resultEl.textContent = '计算出错: ' + (e.message || e);
      }
    });
  });

  // Live MathJax preview
  mathField.addEventListener('input', () => {
    const latex = mathField.value || '';
    const preview = document.getElementById('editorPreview');
    if (preview && typeof MathJax !== 'undefined' && MathJax.tex2svgPromise) {
      MathJax.tex2svgPromise(latex).then(node => {
        preview.innerHTML = '';
        preview.appendChild(node);
        preview.classList.add('show');
      }).catch(() => {});
    }
  });

  // Copy button
  document.getElementById('editorCopy')?.addEventListener('click', () => {
    const latex = mathField.value || (latexSource?.value) || '';
    navigator.clipboard.writeText(latex).then(() => {
      const btn = document.getElementById('editorCopy');
      if (btn) { btn.textContent = '已复制 ✓'; setTimeout(() => btn.textContent = '复制 LaTeX', 1500); }
    });
    if (navigator.vibrate) navigator.vibrate(30);
  });

  // Share button
  document.getElementById('editorShare')?.addEventListener('click', async () => {
    const latex = mathField.value || (latexSource?.value) || '';
    if (navigator.share) {
      try { await navigator.share({ title: 'LaTeXSnipper', text: latex }); } catch (e) { /* */ }
    }
  });
}

export function getMathField() {
  return mathField;
}
