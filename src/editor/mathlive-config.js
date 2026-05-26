// MathLive config — simple: textarea is primary, MathLive is preview-only
// Based on LaTeXSnipper desktop Math Workbench layout

const ZH = {
  'keyboard.tooltip.symbols': '符号',
  'tooltip.copy to clipboard': '复制到剪贴板',
  'tooltip.redo': '重做', 'tooltip.undo': '撤销',
  'menu.copy': '复制', 'menu.copy-as-latex': '复制为 LaTeX',
  'menu.copy-as-mathml': '复制为 MathML',
  'menu.paste': '粘贴', 'menu.select-all': '全选',
  'menu.cut': '剪切', 'menu.mode': '模式',
  'menu.mode-math': '数学', 'menu.mode-text': '文本',
  'menu.insert': '插入', 'menu.insert.matrix': '插入矩阵',
  'menu.font-style': '字体风格',
  'menu.color': '颜色', 'menu.borders': '矩阵边框',
  'menu.evaluate': '计算', 'menu.simplify': '化简',
};

let mathField = null;

export async function initMathLive() {
  await customElements.whenDefined('mathlive-field');

  try { MathfieldElement.strings = { 'zh-CN': ZH }; } catch (_) {}
  try { MathfieldElement.locale = 'zh-CN'; } catch (_) {}
  MathfieldElement.fontsDirectory = '/vendor/mathlive/fonts';

  mathField = document.getElementById('mathField');
  const latexSource = document.getElementById('latexSource');
  if (!mathField || !latexSource) return;

  // MathLive is read-only preview — system keyboard via textarea works reliably
  mathField.readOnly = true;
  mathField.mathVirtualKeyboardPolicy = 'manual';

  // textarea → MathLive preview + MathJax
  function sync() {
    const latex = latexSource.value || '';
    mathField.value = latex;
    const preview = document.getElementById('editorPreview');
    if (preview && latex.trim() && typeof MathJax !== 'undefined' && MathJax.tex2svgPromise) {
      MathJax.tex2svgPromise(latex).then(node => {
        preview.innerHTML = '';
        preview.appendChild(node);
        preview.classList.add('show');
      }).catch(() => {});
    } else if (preview && !latex.trim()) {
      preview.classList.remove('show');
    }
  }
  latexSource.addEventListener('input', sync);

  // Snippet buttons — insert into textarea at cursor
  document.querySelectorAll('.snip-btn[data-latex]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.latex;
      const s = latexSource.selectionStart, e = latexSource.selectionEnd;
      latexSource.value = latexSource.value.slice(0, s) + t + latexSource.value.slice(e);
      latexSource.selectionStart = latexSource.selectionEnd = s + t.length;
      latexSource.focus();
      latexSource.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  // Compute buttons — use MathLive ComputeEngine
  document.querySelectorAll('.comp-btn[data-op]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const latex = latexSource.value.trim();
      const out = document.getElementById('computeResult');
      if (!out) return;
      if (!latex) { out.textContent = '请先输入公式'; return; }
      out.textContent = '计算中…';
      try {
        const CE = window.ComputeEngine;
        if (!CE) { out.textContent = '计算引擎未加载'; return; }
        const ce = new CE();
        const expr = ce.parse(latex);
        let r;
        switch (btn.dataset.op) {
          case 'simplify': r = expr.simplify(); break;
          case 'evaluate': r = expr.evaluate(); break;
          case 'expand': r = expr.expand(); break;
          case 'factor': r = expr.factor(); break;
          case 'numeric': r = expr.N(); break;
          default: r = expr;
        }
        out.textContent = r?.latex ?? String(r ?? '无法计算');
      } catch (e) {
        out.textContent = '计算失败: ' + (e.message || e);
      }
    });
  });

  // Copy button
  document.getElementById('editorCopy')?.addEventListener('click', () => {
    const latex = latexSource.value.trim();
    if (!latex) return;
    navigator.clipboard.writeText(latex).then(() => {
      const b = document.getElementById('editorCopy');
      if (b) { b.textContent = '已复制 ✓'; setTimeout(() => b.textContent = '复制 LaTeX', 1500); }
    });
  });
}

export function getMathField() { return mathField; }
