// MathJax renderer — loads MathJax from local vendor files
// All fonts are bundled locally so it works fully offline.

let mathjaxReady = false;
let mathjaxLoading = false;
let mathjaxCallbacks = [];

/** Check if MathJax is loaded and ready */
export function isMathjaxReady() {
  return mathjaxReady && typeof window.MathJax !== 'undefined'
    && typeof window.MathJax.tex2chtmlPromise === 'function';
}

/** Load MathJax from local vendor path */
export function ensureMathjax() {
  if (mathjaxReady || mathjaxLoading) return;
  // Already on page?
  if (typeof window.MathJax !== 'undefined' && typeof window.MathJax.tex2chtmlPromise === 'function') {
    mathjaxReady = true;
    return;
  }
  mathjaxLoading = true;

  // Configure MathJax before loading script
  window.MathJax = {
    tex: {
      inlineMath: [['$', '$']],
      displayMath: [['$$', '$$']],
      processEscapes: true,
      processEnvironments: true,
    },
    options: {
      enableMenu: false,
      ignoreHtmlClass: 'tex2jax_ignore',
      processHtmlClass: 'tex2jax_process',
    },
    chtml: {
      fontURL: '/vendor/mathjax/fonts',
    },
    startup: {
      pageReady: () => {
        mathjaxLoading = false;
        mathjaxReady = true;
        mathjaxCallbacks.forEach(cb => cb());
        mathjaxCallbacks = [];
      },
    },
  };

  const script = document.createElement('script');
  script.src = '/vendor/mathjax/tex-chtml.js';
  script.async = true;
  script.onerror = () => {
    mathjaxLoading = false;
    mathjaxReady = false;
    console.warn('MathJax local file load failed');
  };
  document.head.appendChild(script);
}

/**
 * Render a LaTeX string to HTML using MathJax (tex2chtml).
 * Returns a Promise that resolves to an HTML string (the outerHTML of the rendered node).
 */
export async function renderMathjax(latex, displayMode = true) {
  if (!isMathjaxReady()) {
    ensureMathjax();
    if (!mathjaxReady) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('MathJax load timeout')), 30000);
        mathjaxCallbacks.push(() => { clearTimeout(timeout); resolve(); });
      });
    }
  }
  try {
    const node = await window.MathJax.tex2chtmlPromise(latex, {
      display: displayMode,
      em: 16,
      ex: 8,
      containerWidth: 40 * 16,
    });
    return node.outerHTML;
  } catch (e) {
    // Fallback: try inline mode
    try {
      const node = await window.MathJax.tex2chtmlPromise(latex, {
        display: false,
        em: 16,
        ex: 8,
      });
      return node.outerHTML;
    } catch (_) {
      throw e;
    }
  }
}
