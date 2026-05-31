// Splash screen progress — self-contained, no dom-refs dependency

const MODEL_WEIGHTS = {
  '分词器': 2,
  '编码器模型': 50,
  '文字检测': 6,
  '中文OCR': 10,
  '原生引擎': 1,
  '加载模型': 50,
  '就绪': 0,
};

let splashProgress = {}; // modelName -> pct (0-100, -1=cached)

export function updateSplash(modelName, pct) {
  const el = document.getElementById('splash');
  if (!el) return;
  splashProgress[modelName] = pct;

  // Compute weighted overall progress
  // Only sum weights for which we have actually received progress updates
  let totalWeight = 0, weightedSum = 0;
  for (const [name, weight] of Object.entries(MODEL_WEIGHTS)) {
    const p = splashProgress[name];
    if (p !== undefined) {
      totalWeight += weight;
      weightedSum += weight * Math.max(0, p) / 100;
    }
  }
  // If no weights have reported yet, fall back to the full weight denominator
  // so progress never jumps from a low value to a high one as models report in
  const overall = totalWeight > 0
    ? Math.round(weightedSum / totalWeight * 100)
    : 0;

  const fill = document.getElementById('splashProgressFill');
  const label = document.getElementById('splashProgressLabel');
  const pctEl = document.getElementById('splashProgressPct');
  if (fill) fill.style.width = overall + '%';
  if (pctEl) pctEl.textContent = overall + '%';

  if (pct < 0) {
    if (label) label.textContent = modelName;
  } else if (pct < 0) {
    if (label) label.textContent = modelName + ' (已缓存)';
  } else if (pct === 100) {
    if (label) label.textContent = modelName + ' ✓';
  } else if (pct >= 0) {
    if (label) label.textContent = modelName + '… ' + Math.round(pct) + '%';
  }

  // Update model tags
  const container = document.getElementById('splashModels');
  if (container) {
    let tag = container.querySelector(`[data-model="${modelName}"]`);
    if (!tag) {
      tag = document.createElement('span');
      tag.className = 'splash-model-tag';
      tag.dataset.model = modelName;
      tag.textContent = modelName;
      container.appendChild(tag);
    }
    tag.classList.remove('splash-model-tag--loaded', 'splash-model-tag--error');
    if (pct === 100 || pct < 0) tag.classList.add('splash-model-tag--loaded');
  }
}

export function hideSplash() {
  const el = document.getElementById('splash');
  if (!el || el.classList.contains('splash--hidden')) return;
  el.classList.add('splash--hidden');
  setTimeout(() => { if (el.parentNode) el.remove(); }, 600);
}
