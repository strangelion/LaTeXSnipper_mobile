// Model Settings UI — renders model management section in settings page
import {
  getSources, addSource, removeSource, getActiveModels, setActiveModel,
  getInstalledModels, markUninstalled, getAllVariants, refreshManifests,
  downloadVariant, MODEL_CATEGORIES, getLocal, STORAGE_KEYS
} from '../model-manager.js';
import { showZipImportDialog, showFileImportDialog } from './model-import.js';
import { openPackageBuilder } from './package-builder.js';
import { t } from '../lang/i18n.js';
import { OcrNative, isNativeOcrAvailable } from '../native/ocr-native.js';
import { showProgress, hideProgress } from './status.js';

const CAT_LABELS = {
  'formula-det': '公式检测',
  'formula-rec': '公式识别',
  'text-det': '文字检测',
  'text-rec': '文字识别',
};

/**
 * Initialize the model management section in settings.
 */
export function initModelSettings() {
  const section = document.getElementById('modelManagement');
  if (!section) return;

  // Expose refresh function for import dialog to call
  section.__refresh = () => renderModelSettings(section);
  renderModelSettings(section);
}

async function renderModelSettings(container) {
  const manifests = getLocal(STORAGE_KEYS.MANIFESTS, []);
  const active = getActiveModels();
  const installed = getInstalledModels();
  const allVariants = getAllVariants(manifests);

  let html = `
    <div class="model-section">
      <h4>${t('model.sources')}</h4>
      <div id="model-sources-list">
        ${getSources().map(s => `
          <div class="source-item">
            <span>${s.label} ${s.builtin ? t('model.builtin') : ''}</span>
            ${s.builtin ? '' : `<button class="ocr-btn secondary btn-remove-source" data-id="${s.id}" style="font-size:0.75rem;padding:0.3rem 0.6rem;">${t('model.delete')}</button>`}
          </div>
        `).join('')}
      </div>
      <div class="add-source-form">
        <input type="text" id="new-source-url" placeholder="${t('model.sourceUrl')}" class="set-input" style="flex:1;" />
        <button id="btn-add-source" class="ocr-btn secondary" style="white-space:nowrap;">${t('model.addSource')}</button>
      </div>
    </div>

    <div class="model-section">
      <h4>${t('model.currentModels')}</h4>
      ${MODEL_CATEGORIES.map(cat => {
        const catVariants = allVariants[cat]?.variants || [];
        const activeVariant = active[cat];
        return `
          <div class="model-category" data-category="${cat}">
            <div class="cat-header">
              <span class="cat-name">${CAT_LABELS[cat] || cat}</span>
              <span class="cat-status ${catVariants.some(v => installed[cat]?.[v.id]) ? 'installed' : 'not-installed'}">
                ${catVariants.some(v => installed[cat]?.[v.id]) ? '✓' : '✗'}
              </span>
            </div>
            <div class="cat-variants">
              ${catVariants.map(v => {
                const isCurrent = activeVariant?.variantId === v.id;
                const isVariantInstalled = !!installed[cat]?.[v.id];
                return `
                  <div class="variant-item ${isCurrent ? 'active' : ''}">
                    <label>
                      <input type="radio" name="cat-${cat}" value="${v.id}"
                        data-source="${v.sourceId}"
                        ${isCurrent ? 'checked' : ''} />
                      ${v.label} (${formatSize(v.sizeBytes)})
                    </label>
                    ${isVariantInstalled
                      ? `<button class="ocr-btn secondary btn-delete-variant" data-cat="${cat}" data-vid="${v.id}" style="font-size:0.75rem;padding:0.3rem 0.6rem;">${t('model.delete')}</button>`
                      : `<button class="ocr-btn primary btn-download-variant" data-cat="${cat}" data-vid="${v.id}" data-source="${v.sourceId}" style="font-size:0.75rem;padding:0.3rem 0.6rem;">${t('model.download')}</button>`
                    }
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="model-section">
      <h4>${t('model.import')}</h4>
      <div style="display:flex;gap:0.5rem;">
        <button id="btn-import-zip" class="ocr-btn secondary" style="flex:1;">${t('model.importZip')}</button>
        <button id="btn-import-file" class="ocr-btn secondary" style="flex:1;">${t('model.importFile')}</button>
      </div>
    </div>

    <div class="model-section">
      <button id="btn-refresh-manifests" class="ocr-btn secondary" style="width:100%;">${t('model.refresh')}</button>
    </div>
  `;

  container.innerHTML = html;
  bindEvents(container);
}

function bindEvents(container) {
  // Source management
  container.querySelector('#btn-add-source')?.addEventListener('click', async () => {
    const url = container.querySelector('#new-source-url').value;
    if (!url) return;
    try {
      const id = 'custom-' + Date.now();
      addSource({ id, label: new URL(url).hostname, url });
      await refreshManifests();
      renderModelSettings(container);
    } catch (err) {
      alert('添加失败: ' + err.message);
    }
  });

  container.querySelectorAll('.btn-remove-source').forEach(btn => {
    btn.addEventListener('click', () => {
      removeSource(btn.dataset.id);
      renderModelSettings(container);
    });
  });

  // Model selection
  container.querySelectorAll('input[name^="cat-"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      const category = radio.name.replace('cat-', '');
      const variantId = radio.value;
      const sourceId = radio.dataset.source;
      setActiveModel(category, sourceId, variantId);

      if (isNativeOcrAvailable()) {
        try {
          // Sync active variant to Java SharedPreferences
          await window.NativeOcr?.setActiveModel(category, variantId);
          await OcrNative.reloadModels();
          const start = Date.now();
          while (Date.now() - start < 30000) {
            const status = await OcrNative.getStatus();
            if (status === 'ready') break;
            await new Promise(r => setTimeout(r, 500));
          }
          try {
            const statusRaw = await OcrNative.getModelStatus();
            window.__nativeModelStatus = typeof statusRaw === 'string' ? JSON.parse(statusRaw) : statusRaw;
          } catch (_) {}
        } catch (_) {}
        renderModelSettings(container);
      }
    });
  });

  // Download buttons
  container.querySelectorAll('.btn-download-variant').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { cat, vid, source } = btn.dataset;
      const manifests = getLocal(STORAGE_KEYS.MANIFESTS, []);
      const allVars = getAllVariants(manifests);
      const variant = allVars[cat]?.variants.find(v => v.id === vid);
      if (!variant) return;

      const catLabel = t(`model.cat_${cat}`) || cat;
      btn.disabled = true;
      btn.textContent = t('model.downloading');
      showProgress(`${t('model.downloading')} ${catLabel}...`, 0);

      // Start notification bar progress
      if (isNativeOcrAvailable()) {
        OcrNative.showNotification(`${t('model.downloading')} ${catLabel}`, 0, 100);
      }

      try {
        await downloadVariant(source, cat, vid, variant, (info) => {
          // Update button text
          if (info.downloading && info.total > 0) {
            const pct = Math.round(info.downloaded / info.total * 100);
            btn.textContent = `${pct}%`;
            showProgress(`${t('model.downloading')} ${catLabel}`, pct);
            if (isNativeOcrAvailable()) {
              OcrNative.showNotification(`${t('model.downloading')} ${catLabel}`, pct, 100);
            }
          } else if (info.verifying) {
            btn.textContent = 'SHA256...';
            showProgress('SHA256...', 100);
            if (isNativeOcrAvailable()) {
              OcrNative.showNotification('SHA256...', 100, 100);
            }
          } else if (info.verified) {
            btn.textContent = t('model.downloading');
          } else if (info.file && info.total > 0) {
            btn.textContent = `${info.downloaded}/${info.total}`;
          }
        });
        hideProgress();
        if (isNativeOcrAvailable()) OcrNative.hideNotification();
        renderModelSettings(container);
      } catch (err) {
        hideProgress();
        if (isNativeOcrAvailable()) OcrNative.hideNotification();
        btn.textContent = t('model.downloadFailed');
        setTimeout(() => { btn.disabled = false; btn.textContent = t('model.download'); }, 2000);
      }
    });
  });

  // Delete buttons
  container.querySelectorAll('.btn-delete-variant').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { cat, vid } = btn.dataset;
      showConfirmModal(
        `${t('model.deleteConfirm')} ${CAT_LABELS[cat]} - ${vid}？`,
        async () => {
          if (window.NativeOcr?.deleteModel) {
            await window.NativeOcr.deleteModel(cat, vid);
          }
          markUninstalled(cat, vid);
          renderModelSettings(container);
        }
      );
    });
  });

  // Import buttons
  container.querySelector('#btn-import-zip')?.addEventListener('click', showZipImportDialog);
  container.querySelector('#btn-import-file')?.addEventListener('click', showFileImportDialog);
  container.querySelector('#btn-create-package')?.addEventListener('click', openPackageBuilder);

  // Refresh
  container.querySelector('#btn-refresh-manifests')?.addEventListener('click', async () => {
    await refreshManifests();
    renderModelSettings(container);
  });
}

function formatSize(bytes) {
  if (!bytes) return '?';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(0) + 'MB';
}

function showConfirmModal(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <p style="margin:0 0 1rem;font-size:0.9rem;color:var(--fg);">${message}</p>
      <div class="modal-actions">
        <button class="ocr-btn secondary" id="confirm-cancel">${t('btn.cancel')}</button>
        <button class="ocr-btn primary" id="confirm-ok" style="background:#ef4444;">${t('btn.confirm')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#confirm-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#confirm-ok').onclick = () => { overlay.remove(); onConfirm(); };
}
