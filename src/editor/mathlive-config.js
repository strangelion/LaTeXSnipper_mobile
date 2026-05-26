// MathLive editor — native component with Chinese locale (from LaTeXSnipper desktop)
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

export async function initEditor() {
  console.debug('[editor] initEditor called');
  try {
    console.debug('[editor] waiting for mathlive-field...');
    await customElements.whenDefined('mathlive-field');
    console.debug('[editor] mathlive-field defined');
  } catch(e) {
    console.debug('[editor] mathlive-field failed', e.message);
    return;
  }

  console.debug('[editor] MathfieldElement:', typeof MathfieldElement);
  console.debug('[editor] mathField element:', document.getElementById('mathField'));

  // Chinese locale
  try { MathfieldElement.strings = { 'zh-CN': MATHLIVE_ZH }; console.debug('[editor] strings set'); } catch (_) { console.debug('[editor] strings failed'); }
  try { MathfieldElement.locale = 'zh-CN'; console.debug('[editor] locale set'); } catch (_) { console.debug('[editor] locale failed'); }
  MathfieldElement.fontsDirectory = '/vendor/mathlive/fonts';
  console.debug('[editor] fontsDirectory set');

  mathField = document.getElementById('mathField');
  if (!mathField) { console.debug('[editor] mathField not found!'); return; }
  console.debug('[editor] mathField found, configuring...');

  // Native MathLive keyboard, smart fence, math mode
  mathField.mathVirtualKeyboardPolicy = 'onfocus';
  mathField.smartFence = true;
  mathField.smartMode = false;
  console.debug('[editor] mathField configured, ready');

  // Sync MathJax preview on input
  mathField.addEventListener('input', () => syncPreview());

  // Copy button
  document.getElementById('editorCopy')?.addEventListener('click', () => {
    const latex = mathField.value?.trim();
    if (!latex) return;
    navigator.clipboard.writeText(latex).then(() => {
      const b = document.getElementById('editorCopy');
      if (b) { b.textContent = '已复制 ✓'; setTimeout(() => b.textContent = '复制 LaTeX', 1500); }
    });
  });
}

function syncPreview() {
  const latex = mathField?.value || '';
  const preview = document.getElementById('editorPreview');
  const copyBtn = document.getElementById('editorCopy');

  if (!latex.trim()) {
    if (preview) { preview.classList.remove('show'); preview.innerHTML = ''; }
    if (copyBtn) copyBtn.style.display = 'none';
    return;
  }
  if (copyBtn) copyBtn.style.display = 'block';

  if (typeof MathJax !== 'undefined' && MathJax.tex2svgPromise) {
    MathJax.tex2svgPromise(latex).then(node => {
      if (preview) { preview.innerHTML = ''; preview.appendChild(node); preview.classList.add('show'); }
    }).catch(() => {});
  }
}

// Fill editor from OCR/history
export function setEditorContent(latex) {
  if (!mathField) mathField = document.getElementById('mathField');
  if (mathField) {
    mathField.value = latex;
    mathField.dispatchEvent(new Event('input', { bubbles: true }));
    const t = document.querySelector('.bottom-nav button[data-page="editor"]');
    if (t) t.click();
  }
}
