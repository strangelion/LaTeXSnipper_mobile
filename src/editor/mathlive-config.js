// MathLive config — textarea is primary, MathLive + MathJax as previews
import { getTheme } from '../ui/theme.js';

const DEBUG = true;
function log(label, data) { if (DEBUG) console.debug('[editor]', label, data); }

let mathField = null;
let latexSource = null;

export function initMathLive() {
  latexSource = document.getElementById('latexSource');
  if (!latexSource) return log('no latexSource element');

  // Attach textarea listener immediately — no dependency on MathLive
  latexSource.addEventListener('input', () => syncPreviews());
  log('textarea listener attached');

  // Copy button
  document.getElementById('editorCopy')?.addEventListener('click', () => {
    const latex = latexSource.value.trim();
    if (!latex) return;
    navigator.clipboard.writeText(latex).then(() => {
      const b = document.getElementById('editorCopy');
      if (b) { b.textContent = '已复制 ✓'; setTimeout(() => b.textContent = '复制 LaTeX', 1500); }
    });
  });

  // Try to init MathLive (non-blocking)
  initMathLiveAsync();

  syncPreviews();
}

async function initMathLiveAsync() {
  try {
    await customElements.whenDefined('mathlive-field');
    mathField = document.getElementById('mathField');
    if (!mathField) return log('no mathField element');

    try { MathfieldElement.locale = 'zh-CN'; } catch (_) {}
    MathfieldElement.fontsDirectory = '/vendor/mathlive/fonts';
    mathField.readOnly = true;
    mathField.mathVirtualKeyboardPolicy = 'manual';
    const theme = getTheme();
    mathField.style.color = theme === 'dark' ? '#e2e8f0' : '#1e293b';
    log('MathLive ready');
  } catch (e) {
    log('MathLive init failed', e.message);
  }
}

function syncPreviews() {
  const latex = latexSource.value || '';
  log('sync', { latex: latex.substring(0, 80), len: latex.length });

  // Update MathLive if available
  if (mathField) mathField.value = latex;

  // Update MathJax preview
  const preview = document.getElementById('editorPreview');
  const copyBtn = document.getElementById('editorCopy');

  if (!latex.trim()) {
    if (preview) { preview.classList.remove('show'); preview.innerHTML = ''; }
    if (copyBtn) copyBtn.style.display = 'none';
    return;
  }
  if (copyBtn) copyBtn.style.display = 'block';

  const hasMJ = typeof MathJax !== 'undefined';
  log('mathjax check', { hasMathJax: hasMJ, hasTex2svg: hasMJ && !!MathJax?.tex2svgPromise });

  if (hasMJ && MathJax.tex2svgPromise) {
    MathJax.tex2svgPromise(latex).then(node => {
      log('mathjax ok', { tag: node?.nodeName });
      if (preview) {
        preview.innerHTML = '';
        preview.appendChild(node);
        preview.classList.add('show');
      }
    }).catch(err => {
      log('mathjax fail', err.message || err);
      if (preview) {
        preview.innerHTML = '<em style="color:var(--muted)">渲染失败: ' + (err.message || String(err)) + '</em>';
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

// Called externally to fill editor (from OCR results, history, etc.)
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
