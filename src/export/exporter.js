// Export module — generate various output formats in-browser

export function exportLaTeX(latex, format = 'display') {
  const code = latex.trim();
  switch (format) {
    case 'inline': return '$' + code + '$';
    case 'display': return '$$\n' + code + '\n$$';
    case 'equation': return '\\begin{equation}\n' + code + '\n\\end{equation}';
    default: return code;
  }
}

export function exportMarkdown(latex, format = 'block') {
  const code = latex.trim();
  return format === 'inline' ? '$' + code + '$' : '$$\n' + code + '\n$$';
}

export function exportMathML(latex) {
  // Simple conversion using MathJax if available
  if (typeof MathJax !== 'undefined' && MathJax.tex2mmlPromise) {
    return MathJax.tex2mmlPromise(latex).then(node => {
      return new XMLSerializer().serializeToString(node);
    });
  }
  return Promise.resolve('<!-- MathML requires MathJax -->');
}

export function exportText(latex) {
  // Strip LaTeX commands for plain text
  return latex
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}$&]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function downloadAsFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  }
}
