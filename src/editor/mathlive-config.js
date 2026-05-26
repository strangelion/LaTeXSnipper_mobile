// MathLive config — minimal: textarea input, MathLive + MathJax dual preview
import { getTheme } from '../ui/theme.js';

let mathField = null;
let latexSource = null;

export async function initMathLive() {
  await customElements.whenDefined('mathlive-field');

  try { MathfieldElement.locale = 'zh-CN'; } catch (_) {}
  MathfieldElement.fontsDirectory = '/vendor/mathlive/fonts';

  mathField = document.getElementById('mathField');
  latexSource = document.getElementById('latexSource');
  if (!mathField || !latexSource) return;

  // MathLive is read-only visual preview
  mathField.readOnly = true;
  mathField.mathVirtualKeyboardPolicy = 'manual';

  // Apply initial theme
  const theme = getTheme();
  mathField.style.color = theme === 'dark' ? '#e2e8f0' : '#1e293b';

  // textarea input → update MathLive + MathJax
  latexSource.addEventListener('input', () => syncPreviews());

  // Copy button
  document.getElementById('editorCopy')?.addEventListener('click', () => {
    const latex = latexSource.value.trim();
    if (!latex) return;
    navigator.clipboard.writeText(latex).then(() => {
      const b = document.getElementById('editorCopy');
      if (b) { b.textContent = '已复制 ✓'; setTimeout(() => b.textContent = '复制 LaTeX', 1500); }
    });
  });

  // Initial sync (in case textarea has pre-filled content)
  syncPreviews();
}

function syncPreviews() {
  const latex = latexSource.value || '';
  // Update MathLive
  mathField.value = latex;

  // Update MathJax SVG preview
  const preview = document.getElementById('editorPreview');
  const copyBtn = document.getElementById('editorCopy');
  if (!latex.trim()) {
    preview.classList.remove('show');
    preview.innerHTML = '';
    if (copyBtn) copyBtn.style.display = 'none';
    return;
  }
  if (copyBtn) copyBtn.style.display = 'block';

  if (typeof MathJax !== 'undefined' && MathJax.tex2svgPromise) {
    MathJax.tex2svgPromise(latex).then(node => {
      preview.innerHTML = '';
      preview.appendChild(node);
      preview.classList.add('show');
    }).catch(() => {
      preview.innerHTML = '<em style="color:var(--muted)">预览渲染失败，请检查 LaTeX 语法</em>';
      preview.classList.add('show');
    });
  } else {
    preview.innerHTML = '<em style="color:var(--muted)">MathJax 未加载</em>';
    preview.classList.add('show');
  }
}

// Called externally to fill the editor with LaTeX (from OCR results, history, etc.)
export function setEditorContent(latex) {
  if (!latexSource) {
    latexSource = document.getElementById('latexSource');
    mathField = document.getElementById('mathField');
  }
  if (latexSource) {
    latexSource.value = latex;
    latexSource.dispatchEvent(new Event('input', { bubbles: true }));
    // Switch to editor tab
    const editorTab = document.querySelector('.bottom-nav button[data-page="editor"]');
    if (editorTab) editorTab.click();
  }
}

export function getMathField() { return mathField; }
