// MathLive config — minimal: textarea input, MathLive + MathJax dual preview
import { getTheme } from '../ui/theme.js';

const DEBUG = true;
function log(label, data) {
  if (!DEBUG) return;
  console.debug('[editor]', label, data);
}

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
  log('sync', { latex: latex.substring(0, 80), len: latex.length });

  // Update MathLive
  if (mathField) mathField.value = latex;

  // Update MathJax SVG preview
  const preview = document.getElementById('editorPreview');
  const copyBtn = document.getElementById('editorCopy');
  if (!latex.trim()) {
    if (preview) { preview.classList.remove('show'); preview.innerHTML = ''; }
    if (copyBtn) copyBtn.style.display = 'none';
    return;
  }
  if (copyBtn) copyBtn.style.display = 'block';

  log('mathjax check', { hasMathJax: typeof MathJax !== 'undefined', hasTex2svg: typeof MathJax !== 'undefined' && !!MathJax.tex2svgPromise });

  if (typeof MathJax !== 'undefined' && MathJax.tex2svgPromise) {
    MathJax.tex2svgPromise(latex).then(node => {
      log('mathjax ok', { nodeType: node?.nodeName, html: node?.innerHTML?.substring(0, 60) });
      if (preview) {
        preview.innerHTML = '';
        preview.appendChild(node);
        preview.classList.add('show');
      }
    }).catch(err => {
      log('mathjax error', err.message || err);
      if (preview) {
        preview.innerHTML = '<em style="color:var(--muted)">渲染失败: ' + (err.message || err) + '</em>';
        preview.classList.add('show');
      }
    });
  } else {
    log('mathjax missing');
    if (preview) {
      preview.innerHTML = '<em style="color:var(--muted)">MathJax 未加载</em>';
      preview.classList.add('show');
    }
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
