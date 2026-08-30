// Unified export system: LaTeXSnipper Core (semantic formats) + Pandoc WASM
// (DOCX/plain fallback) + MathJax (image formats).
//
// Provides:
//   EXPORT_FORMATS — all supported output formats
//   exportLatex(latex, fmt) — core export, saves file to Downloads
//   createExportDropdown(container, { getText, t }) — builds custom-styled dropdown
//
// Semantic exports (including Typst) are generated from the canonical Core
// Document AST. This keeps Mobile output aligned with desktop/Core behavior.

import Logger from '../core/logger.js';
import { isPandocAvailable } from './pandoc-init.js';
import { ICONS } from '../constants.js';

// ── Export format definitions ──
// action: 'render' = MathJax SVG/PNG, 'core' = Core semantic conversion,
// 'pandoc' = formats that still need pandoc.wasm.
export const EXPORT_FORMATS = [
  { id: 'png',      action: 'render', ext: 'png',  mime: 'image/png',       label: 'PNG' },
  { id: 'svg',      action: 'render', ext: 'svg',  mime: 'image/svg+xml',   label: 'SVG' },
  { id: 'latex',    action: 'core',   ext: 'tex',  mime: 'text/plain',      label: 'LaTeX' },
  { id: 'mathml',   action: 'core',   ext: 'mml',  mime: 'application/mathml+xml', label: 'MathML' },
  { id: 'markdown', action: 'core',   ext: 'md',   mime: 'text/markdown',   label: 'Markdown' },
  { id: 'html',     action: 'core',   ext: 'html', mime: 'text/html',       label: 'HTML' },
  { id: 'typst',    action: 'core',   ext: 'typ',  mime: 'text/plain',      label: 'Typst' },
  { id: 'docx',     action: 'pandoc', ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word' },
  { id: 'plain',    action: 'pandoc', ext: 'txt',  mime: 'text/plain',      label: 'Plain Text' },
];

/**
 * Get available export formats based on pandoc availability.
 * Core and image formats remain available when pandoc is not downloaded.
 */
export async function getAvailableFormats() {
  const pandocReady = await isPandocAvailable();
  if (pandocReady) return EXPORT_FORMATS;
  return EXPORT_FORMATS.filter(f => f.action !== 'pandoc');
}

/**
 * Check if pandoc is needed but not available.
 */
export async function isPandocNeeded(formatId) {
  const fmt = EXPORT_FORMATS.find(f => f.id === formatId);
  if (!fmt || fmt.action !== 'pandoc') return false;
  return !(await isPandocAvailable());
}

export function getFormatLabel(fmt, t) {
  const key = 'export.format.' + fmt.id;
  if (t) {
    const val = t(key);
    // t() returns the key string itself when not found (i18n not loaded yet);
    // fall back to hardcoded label in that case.
    if (val && val !== key) return val;
  }
  return fmt.label;
}

const PANDOC_FORMAT_MAP = {
  latex: 'latex',
  mathml: 'html+mathml',
  markdown: 'markdown+tex_math_dollars',
  html: 'html',
  docx: 'docx',
  plain: 'plain',
};

// ── Pandoc WASM lazy loader (DOCX/plain compatibility formats) ──
let _pandocApi = null;
let _pandocLoading = false;
let _pandocWaiters = [];

async function initPandoc() {
  if (_pandocApi) return _pandocApi;
  if (_pandocLoading) {
    return new Promise(resolve => { _pandocWaiters.push(resolve); });
  }
  _pandocLoading = true;
  try {
    // Self-contained pandoc loader that imports core.js directly (pure JS,
    // vite-plugin-wasm doesn't touch it) and fetches pandoc.wasm from /pandoc.wasm.
    // This bypasses vite-plugin-wasm's generated fetch path that fails in Capacitor.
    const { initPandocWasm } = await import('./pandoc-init.js');
    _pandocApi = await initPandocWasm();
    _pandocWaiters.forEach(r => r(_pandocApi));
    _pandocWaiters = [];
    return _pandocApi;
  } catch (e) {
    Logger.error('EXPORT', 'Pandoc WASM init failed', e);
    throw e;
  } finally {
    _pandocLoading = false;
  }
}

// ── Core export handler ──
export async function exportLatex(latex, fmt, ocrResult = null) {
  if (!latex || !latex.trim()) return;
  Logger.info('EXPORT', 'Exporting as ' + fmt.id);

  if (fmt.action === 'render') {
    await _exportImage(latex, fmt);
  } else if (fmt.action === 'core') {
    await _exportCore(latex, fmt, ocrResult);
  } else {
    await _exportPandoc(latex, fmt);
  }
}

const CORE_FORMAT_MAP = {
  latex: 'latex',
  mathml: 'mathml',
  markdown: 'markdown_block',
  html: 'html',
  typst: 'typst',
};

async function _exportCore(latex, fmt, ocrResult) {
  const coreFormat = CORE_FORMAT_MAP[fmt.id];
  if (!coreFormat) throw new Error(`Unsupported Core export format: ${fmt.id}`);
  const { convertLatexWithCore, convertOcrResult } = await import('../core/core-runtime.js');
  const artifact = ocrResult?.blocks
    ? await convertOcrResult(ocrResult, coreFormat)
    : await convertLatexWithCore(latex, coreFormat);
  if (!artifact.text?.trim()) {
    throw new Error(`Core returned an empty ${fmt.id} artifact`);
  }
  const blob = new Blob([artifact.text], { type: `${fmt.mime};charset=utf-8` });
  const { saveFile } = await import('./share.js');
  await saveFile(blob, `formula.${fmt.ext}`);
  Logger.info('EXPORT', `Core ${fmt.id} export ${artifact.sizeBytes || blob.size} bytes`);
}

async function _exportImage(latex, fmt) {
  const { renderLatexToSvgs, combineSvgs, svgToPngBlob } = await import('../ui/result.js');
  const svgs = await renderLatexToSvgs(latex);
  if (!svgs || svgs.length === 0) { Logger.warn('EXPORT', 'MathJax rendered no SVGs'); return; }
  const composite = combineSvgs(svgs);
  if (!composite) return;
  const { saveFile } = await import('./share.js');

  if (fmt.id === 'png') {
    const blob = await svgToPngBlob(composite);
    if (blob) await saveFile(blob, 'formula.png');
  } else if (fmt.id === 'svg') {
    const svgStr = new XMLSerializer().serializeToString(composite);
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svgStr], { type: 'image/svg+xml' });
    await saveFile(blob, 'formula.svg');
  }
}

async function _exportPandoc(latex, fmt) {
  const to = PANDOC_FORMAT_MAP[fmt.id];
  if (!to) { Logger.error('EXPORT', 'Unknown pandoc format: ' + fmt.id); return; }

  // Show loading indicator during WASM compilation (first use only)
  let loadingEl = null;
  if (!_pandocApi) {
    loadingEl = document.createElement('div');
    loadingEl.className = 'modal-overlay';
    loadingEl.innerHTML = `<div class="modal-content" style="text-align:center;padding:2rem;">
      <div style="margin-bottom:0.5rem;">${ICONS.loading}</div>
      <div style="font-size:0.9rem;color:var(--fg);">正在初始化 Pandoc 引擎...</div>
      <div style="font-size:0.75rem;color:var(--muted);margin-top:0.3rem;">首次使用需编译 WASM，后续将缓存</div>
    </div>`;
    document.body.appendChild(loadingEl);
  }

  try {
    const pandoc = await initPandoc();
    // Binary formats (docx etc) must use output-file to get raw bytes
    const isBinary = fmt.id === 'docx';
    const opts = isBinary
      ? { from: 'latex', to, standalone: false, 'output-file': 'stdout' }
      : { from: 'latex', to, standalone: false };
    const result = await pandoc.convert(opts, latex, {});
    let blob;
    if (isBinary) {
      const outFile = result.files?.['stdout'];
      if (outFile) { blob = new Blob([outFile], { type: fmt.mime }); }
      else { Logger.warn('EXPORT', 'Pandoc returned no docx binary'); return; }
    } else {
      const text = result.stdout || '';
      if (!text.trim()) { Logger.warn('EXPORT', 'Pandoc returned empty for ' + fmt.id); return; }
      blob = new Blob([text], { type: fmt.mime + ';charset=utf-8' });
    }
    const { saveFile } = await import('./share.js');
    await saveFile(blob, 'formula.' + fmt.ext);
  } finally {
    if (loadingEl) loadingEl.remove();
  }
}

async function _exportTypst(latex) {
  const text = latexToTypst(latex);
  if (!text.trim()) { Logger.warn('EXPORT', 'Typst conversion returned empty'); return; }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const { saveFile } = await import('./share.js');
  await saveFile(blob, 'formula.typ');
}

// ═══════════════════════════════════════════════════════════════
//  LaTeX → Typst converter (pure JS, no pandoc dependency)
// ═══════════════════════════════════════════════════════════════

// Typst 在数学模式下的大部分符号与 LaTeX 不同：
// - $...$ 定界符保留相同
// - ^ 和 _ 用于上下标
// - 结构命令不同：\frac{a}{b} → a / b
// - 符号名不同：\alpha → alpha, \infty → infinity
// - \begin{cases} → cases(...), \begin{matrix} → mat(...)

// ── LaTeX → Typst symbol table ──
const SYMBOLS = {
  // Greek lowercase
  '\\alpha':'alpha','\\beta':'beta','\\gamma':'gamma','\\delta':'delta',
  '\\epsilon':'epsilon','\\varepsilon':'epsilon','\\zeta':'zeta','\\eta':'eta',
  '\\theta':'theta','\\vartheta':'theta','\\iota':'iota','\\kappa':'kappa',
  '\\lambda':'lambda','\\mu':'mu','\\nu':'nu','\\xi':'xi','\\omicron':'omicron',
  '\\pi':'pi','\\varpi':'pi','\\rho':'rho','\\varrho':'rho',
  '\\sigma':'sigma','\\varsigma':'sigma','\\tau':'tau','\\upsilon':'upsilon',
  '\\phi':'phi','\\varphi':'phi','\\chi':'chi','\\psi':'psi','\\omega':'omega',
  // Greek uppercase
  '\\Gamma':'Gamma','\\Delta':'Delta','\\Theta':'Theta',
  '\\Lambda':'Lambda','\\Xi':'Xi','\\Pi':'Pi',
  '\\Sigma':'Sigma','\\Upsilon':'Upsilon','\\Phi':'Phi',
  '\\Psi':'Psi','\\Omega':'Omega',
  // Arrows
  '\\rightarrow':'arrow.r','\\Rightarrow':'arrow.r.double',
  '\\leftarrow':'arrow.l','\\Leftarrow':'arrow.l.double',
  '\\leftrightarrow':'arrow.l.r','\\Leftrightarrow':'arrow.l.r.double',
  '\\mapsto':'arrow.maps.to','\\longmapsto':'arrow.maps.to.long',
  '\\to':'arrow.r','\\gets':'arrow.l',
  '\\Longrightarrow':'arrow.r.double.long','\\longrightarrow':'arrow.r.long',
  '\\Longrightarrow':'arrow.r.double.long',
  '\\Longleftrightarrow':'arrow.l.r.double.long',
  // Relations
  '\\leq':'lt.eq','\\ge':'gt.eq','\\geq':'gt.eq',
  '\\leqslant':'lt.eq','\\geqslant':'gt.eq',
  '\\neq':'not.eq','\\ne':'not.eq',
  '\\approx':'approx','\\simeq':'approx','\\cong':'equiv','\\equiv':'equiv',
  '\\sim':'sim','\\propto':'prop',
  '\\subset':'subset','\\supset':'supset',
  '\\subseteq':'subset.eq','\\supseteq':'supset.eq',
  '\\subsetneq':'subset.neq','\\supsetneq':'supset.neq',
  '\\in':'in','\\notin':'not.in','\\ni':'ni',
  '\\perp':'bot','\\parallel':'parallel',
  '\\ll':'ll','\\gg':'gg','\\prec':'prec','\\succ':'succ',
  '\\preceq':'prec.eq','\\succeq':'succ.eq','\\doteq':'doteq',
  // Operators
  '\\times':'times','\\div':'div','\\pm':'plus.minus','\\mp':'minus.plus',
  '\\cdot':'cdot','\\star':'star','\\ast':'ast','\\circ':'circle','\\bullet':'bullet',
  '\\cup':'union','\\cap':'inter','\\vee':'or','\\wedge':'and',
  '\\oplus':'o.plus','\\ominus':'o.minus','\\otimes':'o.times','\\oslash':'o.slash',
  '\\odot':'o.dot',
  '\\bigcup':'union.big','\\bigcap':'inter.big',
  '\\sum':'sum','\\prod':'product','\\coprod':'coproduct',
  '\\int':'integral','\\iint':'integral.double','\\iiint':'integral.triple',
  '\\oint':'integral.contour',
  '\\nabla':'nabla','\\partial':'partial','\\emptyset':'emptyset','\\varnothing':'emptyset',
  '\\infty':'infinity','\\exists':'exists','\\forall':'forall','\\neg':'not','\\lnot':'not',
  // Functions
  '\\log':'log','\\ln':'ln','\\lg':'lg',
  '\\sin':'sin','\\cos':'cos','\\tan':'tan','\\cot':'cot','\\sec':'sec','\\csc':'csc',
  '\\arcsin':'arcsin','\\arccos':'arccos','\\arctan':'arctan',
  '\\sinh':'sinh','\\cosh':'cosh','\\tanh':'tanh',
  '\\det':'det','\\dim':'dim','\\hom':'hom','\\ker':'ker',
  '\\max':'max','\\min':'min','\\Pr':'Pr','\\sup':'sup','\\inf':'inf',
  '\\lim':'lim','\\limsup':'lim.sup','\\liminf':'lim.inf',
  '\\arg':'arg','\\deg':'deg',
  // Dots & spacing
  '\\ldots':'..','\\cdots':'..','\\vdots':'vdots','\\ddots':'dots',
  '\\,':' thin ','\\:':' med ','\\;':' thick ',
  '\\quad':' quad ','\\qquad':' quad ',
  // Misc symbols
  '\\Box':'square.stroked','\\square':'square.stroked',
  '\\triangle':'triangle','\\angle':'angle',
  '\\surd':'sqrt','\\prime':"'",
  '\\hbar':'h.bar','\\ell':'ell','\\Re':'Re','\\Im':'Im',
  '\\aleph':'aleph','\\nabla':'nabla','\\diamond':'diamond',
  '\\langle':'langle','\\rangle':'rangle',
  '\\lfloor':'floor.l','\\rfloor':'floor.r',
  '\\lceil':'ceil.l','\\rceil':'ceil.r',
  '\\lbrace':'{','\\rbrace':'}',
  '\\|':'||',
  '\\_':'_','\\%':'%','\\&':'and',
  '\\{':'{','\\}':'}','\\$':'$','\\#':'#',
};

const SORTED_SYMBOL_KEYS = Object.keys(SYMBOLS).sort((a, b) => b.length - a.length);
const SYMBOL_PATTERN = new RegExp(
  SORTED_SYMBOL_KEYS.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + '(?![a-zA-Z])',
  'g'
);

/**
 * Segment mixed text+$...$ input for partial conversion.
 * Returns [{ type: 'text'|'formula', content: string }]
 */
function segmentMixedInput(input) {
  const segs = [];
  // Try display math $$...$$ first, then inline $...$
  let remaining = input;
  while (remaining.length) {
    const disp = remaining.startsWith('$$');
    const delim = disp ? '$$' : '$';
    if (disp || remaining[0] === '$') {
      const closeAt = remaining.indexOf(delim, disp ? 2 : 1);
      if (closeAt !== -1) {
        segs.push({ type: 'text', content: disp ? '' : '' }); // text before (empty)
        segs.push({ type: 'formula', content: remaining.slice(disp ? 2 : 1, closeAt) });
        remaining = remaining.slice(closeAt + delim.length);
        continue;
      }
    }
    // Find next $ in remaining
    const nextDollar = remaining.indexOf('$');
    if (nextDollar === -1) {
      segs.push({ type: 'text', content: remaining });
      break;
    }
    if (nextDollar > 0) {
      segs.push({ type: 'text', content: remaining.slice(0, nextDollar) });
    }
    // Check for $$
    if (nextDollar + 1 < remaining.length && remaining[nextDollar + 1] === '$') {
      // It's display math
      const closeAt2 = remaining.indexOf('$$', nextDollar + 2);
      if (closeAt2 !== -1) {
        segs.push({ type: 'formula', content: remaining.slice(nextDollar + 2, closeAt2) });
        remaining = remaining.slice(closeAt2 + 2);
      } else {
        segs.push({ type: 'text', content: remaining.slice(nextDollar) });
        break;
      }
    } else {
      // Inline $
      const closeAt3 = remaining.indexOf('$', nextDollar + 1);
      if (closeAt3 !== -1) {
        segs.push({ type: 'formula', content: remaining.slice(nextDollar + 1, closeAt3) });
        remaining = remaining.slice(closeAt3 + 1);
      } else {
        segs.push({ type: 'text', content: remaining.slice(nextDollar) });
        break;
      }
    }
  }
  // Merge adjacent text segments
  const merged = [];
  for (const seg of segs) {
    if (seg.type === 'text' && merged.length > 0 && merged[merged.length - 1].type === 'text') {
      merged[merged.length - 1].content += seg.content;
    } else {
      merged.push(seg);
    }
  }
  return merged;
}

/**
 * Convert raw LaTeX formula body to Typst math expression.
 * Does NOT include $...$ delimiters.
 */
function formulaToTypst(formula) {
  let f = (formula || '').trim();
  if (!f) return '';
  // Strip any $ delimiters inside the formula body
  f = f.replace(/\$/g, '');
  // Preprocess simplifications
  f = preprocess(f);
  // Structural conversions (order matters)
  f = convertCases(f);
  f = convertMatrices(f);
  f = convertFrac(f);
  f = convertSqrt(f);
  f = convertBinom(f);
  f = convertUndersetOverset(f);
  f = convertTextCommands(f);
  f = convertUnderOverline(f);
  f = convertAccents(f);
  f = convertLimits(f);
  f = stripNoise(f);
  // Symbol substitution
  f = f.replace(SYMBOL_PATTERN, match => SYMBOLS[match] || match);
  // Cleanup
  f = f.replace(/\s{2,}/g, ' ');
  return f.trim();
}

function preprocess(f) {
  let s = f;
  // \textcolor{color}{content} → content
  s = s.replace(/\\textcolor\s*\{[^}]*\}\{([^}]*)\}/g, '$1');
  // \color{color} → strip
  s = s.replace(/\\color\s*\{[^}]*\}\s*/g, '');
  // \stackrel{a}{b} → b (approximate)
  s = s.replace(/\\stackrel\s*\{[^}]*\}\{([^}]*)\}/g, '$1');
  // \cfrac → \frac
  s = s.replace(/\\cfrac/g, '\\frac');
  // \sideset{}{}\∑ → ∑
  s = s.replace(/\\sideset\{[^}]*\}\{[^}]*\}/g, '');
  // \varnothing → \emptyset
  s = s.replace(/\\varnothing\b/g, '\\emptyset');
  // #? → \square.stroked
  s = s.replace(/#\?/g, '\\square.stroked');
  // \displaylines{...} → just inner content
  s = s.replace(/\\displaylines\s*\{/g, '');
  // Known pandoc-unsupported but handled directly: strip partial
  s = s.replace(/\\{3,}/g, '\\\\');
  return s;
}

function convertCases(f) {
  return f.replace(/\\begin\{cases\}\s*([\s\S]*?)\s*\\end\{cases\}/g, (_, content) => {
    const lines = content.split('\\\\').map(l => l.trim()).filter(Boolean);
    const parts = lines.map(line => {
      const cols = line.split('&').map(c => formulaToTypst(c.trim()));
      if (cols.length >= 2) return '(' + cols[0] + ', if ' + cols[1] + ')';
      return '(' + cols[0] + ')';
    });
    return 'cases(' + parts.join(', ') + ')';
  });
}

function convertMatrices(f) {
  return f.replace(/\\begin\{([a-zA-Z*]+)\}\s*([\s\S]*?)\s*\\end\{\1\}/g, (_, env, content) => {
    const rows = content.split('\\\\').map(l => l.trim()).filter(Boolean);
    const r = rows.map(row => '(' + row.split('&').map(c => formulaToTypst(c.trim())).join(', ') + ')');
    return 'mat(' + r.join(', ') + ')';
  });
}

function convertFrac(f) {
  return f.replace(/\\(?:d)?frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, (_, num, den) => {
    const n = formulaToTypst(num);
    const d = formulaToTypst(den);
    return '(' + n + ') / (' + d + ')';
  });
}

function convertSqrt(f) {
  return f.replace(/\\sqrt\s*(?:\[([^}]*)\])?\s*\{([^}]*)\}/g, (_, n, body) => {
    const b = formulaToTypst(body);
    return n ? 'root(' + b + ', ' + n.trim() + ')' : 'sqrt(' + b + ')';
  });
}

function convertBinom(f) {
  return f.replace(/\\binom\s*\{([^}]*)\}\{([^}]*)\}/g, (_, a, b) =>
    'binom(' + formulaToTypst(a) + ', ' + formulaToTypst(b) + ')');
}

function convertUndersetOverset(f) {
  let s = f;
  s = s.replace(/\\underset\s*\{([^}]*)\}\{([^}]*)\}/g, (_, below, main) =>
    formulaToTypst(main) + '_{' + formulaToTypst(below) + '}');
  s = s.replace(/\\overset\s*\{([^}]*)\}\{([^}]*)\}/g, (_, above, main) =>
    formulaToTypst(main) + '^{' + formulaToTypst(above) + '}');
  return s;
}

function convertTextCommands(f) {
  return f.replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|mathbb|mathscr)\s*\{([^}]*)\}/g, '$1');
}

function convertUnderOverline(f) {
  let s = f;
  s = s.replace(/\\underline\s*\{([^}]*)\}/g, (_, b) => 'underline(' + formulaToTypst(b) + ')');
  s = s.replace(/\\overline\s*\{([^}]*)\}/g, (_, b) => 'overline(' + formulaToTypst(b) + ')');
  return s;
}

function convertAccents(f) {
  let s = f;
  s = s.replace(/\\vec\s*\{([^}]*)\}/g, (_, b) => 'arrow(' + formulaToTypst(b) + ')');
  s = s.replace(/\\hat\s*\{([^}]*)\}/g, (_, b) => 'hat(' + formulaToTypst(b) + ')');
  s = s.replace(/\\tilde\s*\{([^}]*)\}/g, (_, b) => 'tilde(' + formulaToTypst(b) + ')');
  s = s.replace(/\\bar\s*\{([^}]*)\}/g, (_, b) => 'bar(' + formulaToTypst(b) + ')');
  s = s.replace(/\\dot\s*\{([^}]*)\}/g, (_, b) => 'dot(' + formulaToTypst(b) + ')');
  s = s.replace(/\\ddot\s*\{([^}]*)\}/g, (_, b) => 'dot.double(' + formulaToTypst(b) + ')');
  return s;
}

function convertLimits(f) {
  // \operatorname{...} → name
  let s = f.replace(/\\operatorname\s*\{([^}]*)\}/g, '$1');
  // \limits / \nolimits → strip
  s = s.replace(/\\limits\s*/g, '');
  return s.replace(/\\nolimits\s*/g, '');
}

function stripNoise(f) {
  let s = f;
  // \left, \right, \bigl, \bigr, \big, \Big, \biggl, \biggr
  s = s.replace(/\\(?:left|right|middle|big[lr]?|Big[lr]?|big[lr]?|Big[lr]?)\s*/g, '');
  // \displaystyle, \textstyle
  s = s.replace(/\\(?:displaystyle|textstyle)\s*/g, '');
  // \tag, \label, \nonumber, \notag
  s = s.replace(/\\tag\s*\{[^}]*\}/g, '');
  s = s.replace(/\\label\s*\{[^}]*\}/g, '');
  s = s.replace(/\\nonumber\s*/g, '');
  s = s.replace(/\\notag\s*/g, '');
  return s;
}

/**
 * Convert mixed LaTeX to Typst (pure JS, no pandoc).
 *
 * Splits on $...$/$$...$$, converts formula segments via formulaToTypst(),
 * leaves text segments unchanged. Output wraps formulas in $...$ delimiters.
 */
export function latexToTypst(input) {
  const text = (input || '').trim();
  if (!text) return '';

  const segments = segmentMixedInput(text);
  const result = segments.map(seg => {
    if (seg.type === 'text') return seg.content;
    const converted = formulaToTypst(seg.content);
    return '$' + converted + '$';
  });

  return result.join('');
}

// ── Dropdown factory ──

export function createExportDropdown(container, { getText, getResult, t }) {
  const _t = t || (k => k);
  const wrap = document.createElement('div');
  wrap.className = 'export-dropdown-wrap';

  const btn = document.createElement('button');
  btn.className = 'export-dropdown-btn';
  btn.type = 'button';
  btn.textContent = _t('export.trigger');
  wrap.appendChild(btn);

  const list = document.createElement('div');
  list.className = 'export-dropdown-list';

  // Rebuild items on each open to reflect current pandoc availability
  async function rebuildItems() {
    list.innerHTML = '';
    const formats = await getAvailableFormats();
    formats.forEach(fmt => {
      const item = document.createElement('div');
      item.className = 'export-dropdown-item';
      item.textContent = getFormatLabel(fmt, _t);
      item.dataset.fmt = fmt.id;

      item.addEventListener('pointerdown', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeExportDropdowns();

        const text = getText();
        if (!text || !text.trim()) return;

        btn.textContent = _t('export.exporting');
        btn.disabled = true;

        try {
          await exportLatex(text, fmt, getResult?.() || null);
        } catch (err) {
          Logger.error('EXPORT', 'Export via dropdown failed', err);
        } finally {
          btn.textContent = _t('export.trigger');
          btn.disabled = false;
        }
      });

      list.appendChild(item);
    });
  }
  wrap.appendChild(list);

  btn.addEventListener('pointerdown', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = list.classList.contains('show');
    closeExportDropdowns();
    if (!isOpen) {
      await rebuildItems();
      list.classList.add('show');
      btn.classList.add('open');
    }
  });

  container.appendChild(wrap);
}

function closeExportDropdowns() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.export-dropdown-list.show').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('.export-dropdown-btn.open').forEach(el => el.classList.remove('open'));
}

// Global outside-click to close dropdowns (browser only)
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.export-dropdown-wrap')) closeExportDropdowns();
  });
}
