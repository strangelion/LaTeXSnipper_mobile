// Status bar + progress bar
import { els } from './dom-refs.js';
import { ICONS } from '../constants.js';

export function setStatus(type, text, showSpin) {
  if (!els.statusIcon || !els.statusText || !els.spinner) return;
  els.statusIcon.innerHTML = ICONS[type] || ICONS.loading;
  els.statusText.textContent = text;
  els.spinner.classList.toggle('show', showSpin);
}

export function showError(msg) {
  if (!els.errorMsg) return;
  els.errorMsg.style.display = 'block';
  els.errorMsg.textContent = msg;
  setStatus('error', '加载失败', false);
}

export function showProgress(label, pct) {
  if (!els.progressWrap) return;
  els.progressWrap.classList.add('show');
  if (els.progressFile) els.progressFile.textContent = label;
  if (pct >= 0 && els.progressFill) {
    els.progressFill.style.width = pct + '%';
    if (els.progressPercent) els.progressPercent.textContent = pct + '%';
  }
}

export function hideProgress() {
  if (els.progressWrap) els.progressWrap.classList.remove('show');
}
