// Welcome Dialog — first-launch引导用户下载模型或使用外部API
import { isReady, getLocal, STORAGE_KEYS, refreshManifests, downloadVariant, getAllVariants, MODEL_CATEGORIES, getSources } from '../model-manager.js';
import { t } from '../lang/i18n.js';
import { ICONS } from '../constants.js';
import { OcrNative, isNativeOcrAvailable } from '../native/ocr-native.js';

/**
 * Check if first launch and show welcome dialog if needed.
 * Returns true if models are ready, false if user chose to skip.
 */
export async function checkFirstLaunch() {
  const hasLaunched = localStorage.getItem('ls_has_launched');
  if (hasLaunched) {
    return isReady(getLocal(STORAGE_KEYS.MANIFESTS, []));
  }

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay welcome-overlay';
    overlay.innerHTML = `
      <div class="welcome-dialog">
        <div class="welcome-icon">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="48" height="48">
            <rect x="6" y="6" width="36" height="36" rx="8"/>
            <path d="M16 18h16M16 24h12M16 30h8"/>
          </svg>
        </div>
        <h2>欢迎使用 LaTeXSnipper</h2>
        <p class="welcome-desc">本应用需要 OCR 模型才能使用本地识别功能。</p>
        <p class="welcome-desc">模型不内置在应用中，您可以：</p>
        <ul class="welcome-list">
          <li>从官方源下载推荐模型</li>
          <li>导入自己的模型包</li>
          <li>稍后在设置中管理</li>
        </ul>
        <div class="welcome-actions">
          <button class="welcome-btn primary" id="welcome-download">立即下载</button>
          <button class="welcome-btn secondary" id="welcome-external">使用外部API</button>
          <button class="welcome-btn ghost" id="welcome-skip">稍后设置</button>
        </div>
        <div id="welcome-progress" style="display:none;margin-top:1rem;">
          <div style="font-size:0.8rem;color:var(--muted);margin-bottom:0.3rem;" id="welcome-progress-label">准备中...</div>
          <div style="width:100%;height:6px;background:var(--border-color,#e5e7eb);border-radius:3px;overflow:hidden;">
            <div id="welcome-progress-fill" style="height:100%;width:0%;background:linear-gradient(90deg,var(--accent,#3b82f6),#a78bfa);border-radius:3px;transition:width 0.3s;"></div>
          </div>
          <div style="font-size:0.7rem;color:var(--muted);margin-top:0.2rem;" id="welcome-progress-pct">0%</div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // ── Auto-download all models ──
    overlay.querySelector('#welcome-download').addEventListener('click', async () => {
      const downloadBtn = overlay.querySelector('#welcome-download');
      const externalBtn = overlay.querySelector('#welcome-external');
      const skipBtn = overlay.querySelector('#welcome-skip');
      const progressWrap = overlay.querySelector('#welcome-progress');
      const progressLabel = overlay.querySelector('#welcome-progress-label');
      const progressFill = overlay.querySelector('#welcome-progress-fill');
      const progressPct = overlay.querySelector('#welcome-progress-pct');

      // Disable buttons during download
      downloadBtn.disabled = true;
      downloadBtn.textContent = '刷新清单中...';
      externalBtn.disabled = true;
      skipBtn.disabled = true;
      if (progressWrap) progressWrap.style.display = '';

      // Start notification
      if (isNativeOcrAvailable()) {
        OcrNative.showNotification('下载模型中', 0, 100);
      }

      try {
        // Step 1: Refresh manifests
        if (progressLabel) progressLabel.textContent = '正在获取模型清单...';
        if (progressFill) progressFill.style.width = '10%';
        if (progressPct) progressPct.textContent = '10%';
        await refreshManifests();

        const manifests = getLocal(STORAGE_KEYS.MANIFESTS, []);
        const allVars = getAllVariants(manifests);
        const sources = getSources();
        const defaultSource = sources.find(s => s.builtin) || sources[0];
        if (!defaultSource) throw new Error('No source available');

        // Step 2: Download each category
        const categories = MODEL_CATEGORIES;
        const totalCategories = categories.length;
        let completed = 0;

        for (const cat of categories) {
          const catInfo = allVars[cat];
          if (!catInfo?.variants?.length) continue;
          const variant = catInfo.variants[0]; // first variant
          if (!variant.zipFile) continue;

          const catPct = Math.round(((completed + 0.5) / totalCategories) * 100);
          if (progressLabel) progressLabel.textContent = `下载 ${cat}...`;
          if (progressFill) progressFill.style.width = catPct + '%';
          if (progressPct) progressPct.textContent = catPct + '%';

          try {
            await downloadVariant(defaultSource.id, cat, variant.id, variant, (info) => {
              if (info.downloading && info.total > 0) {
                const dlPct = Math.round(info.downloaded / info.total * 100);
                const overallPct = Math.round(((completed + dlPct / 100) / totalCategories) * 100);
                if (progressFill) progressFill.style.width = overallPct + '%';
                if (progressPct) progressPct.textContent = overallPct + '%';
                if (progressLabel) progressLabel.textContent = `下载 ${cat} (${(info.downloaded / 1024 / 1024).toFixed(1)}/${(info.total / 1024 / 1024).toFixed(1)} MB)`;
                if (isNativeOcrAvailable()) {
                  OcrNative.showNotification(`下载 ${cat}`, overallPct, 100);
                }
              }
            });
            completed++;
          } catch (err) {
            console.warn(`[welcome] Failed to download ${cat}:`, err.message);
          }
        }

        // Done
        if (progressFill) progressFill.style.width = '100%';
        if (progressPct) progressPct.textContent = '100%';
        if (progressLabel) progressLabel.textContent = '下载完成！正在加载模型...';
        if (downloadBtn) downloadBtn.textContent = '✓ 完成';
        if (isNativeOcrAvailable()) {
          OcrNative.showNotification('模型下载完成', 100, 100);
        }

        localStorage.setItem('ls_has_launched', '1');
        setTimeout(() => {
          overlay.remove();
          if (isNativeOcrAvailable()) OcrNative.hideNotification();
          resolve(true);
        }, 1500);

      } catch (err) {
        console.error('[welcome] Download failed:', err);
        if (progressLabel) progressLabel.textContent = '下载失败：' + err.message;
        if (progressFill) progressFill.style.width = '0%';
        if (downloadBtn) {
          downloadBtn.textContent = '重试';
          downloadBtn.disabled = false;
        }
        externalBtn.disabled = false;
        skipBtn.disabled = false;
        if (isNativeOcrAvailable()) OcrNative.hideNotification();
      }
    });

    overlay.querySelector('#welcome-external').addEventListener('click', () => {
      overlay.remove();
      localStorage.setItem('ls_has_launched', '1');
      const engineSelect = document.getElementById('setEngineSelect');
      if (engineSelect) {
        engineSelect.value = 'external';
        engineSelect.dispatchEvent(new Event('change'));
      }
      resolve(false);
    });

    overlay.querySelector('#welcome-skip').addEventListener('click', () => {
      overlay.remove();
      localStorage.setItem('ls_has_launched', '1');
      resolve(false);
    });
  });
}
