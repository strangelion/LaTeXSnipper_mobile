// Model Import UI — handles ZIP and file import with auto-detection
import { importFromZip, importSingleFile, MODEL_CATEGORIES, getActiveModels } from './model-manager.js';
import { analyzeOnnx } from './model-analyzer.js';
import { t } from '../core/i18n.js';
import { OcrNative, isNativeOcrAvailable } from '../ocr/ocr-native.js';
import Logger from '../core/logger.js';

/**
 * Show import dialog for ZIP files.
 */
export function showZipImportDialog() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const progress = createProgressOverlay('正在导入模型包...');
    let processed = 0;
    try {
      const result = await importFromZip(file, (info) => {
        processed++;
        const pct = Math.round((processed / info.total) * 100);
        progress.update(`${info.file} (${info.processed}/${info.total})`, pct);
      });
      progress.done(`成功导入 ${result.fileCount} 个文件`);
    } catch (err) {
      progress.error('导入失败: ' + err.message);
    }
  };
  input.click();
}

/**
 * Show import dialog for individual .onnx files.
 * User must select category and variant name.
 */
export function showFileImportDialog() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.onnx';
  input.multiple = true;
  input.onchange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    if (files.length === 1) {
      showSingleFileImportDialog(files[0]);
    } else {
      await batchImportFiles(files);
    }
  };
  input.click();
}

function showSingleFileImportDialog(file) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <h3>${t('model.importFile')}</h3>
      <p>${file.name} (${formatSize(file.size)})</p>

      <label>${t('model.category')}</label>
      <select id="import-category">
        ${MODEL_CATEGORIES.map(c => `<option value="${c}">${t('model.cat_' + c)}</option>`).join('')}
      </select>

      <label>${t('model.variantName')}</label>
      <input type="text" id="import-variant" value="${file.name.replace('.onnx', '')}" />

      <div class="modal-actions">
        <button class="ocr-btn secondary" id="import-cancel">${t('btn.cancel')}</button>
        <button class="ocr-btn primary" id="import-confirm">${t('btn.import')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#import-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#import-confirm').onclick = async () => {
    const category = overlay.querySelector('#import-category').value;
    const variantId = overlay.querySelector('#import-variant').value;
    overlay.remove();

    const progress = createProgressOverlay(t('model.importing'));
    try {
      await importSingleFile(file, category, variantId);
      progress.done(t('model.importSuccess', { count: 1 }));
    } catch (err) {
      progress.error(t('model.importFailed', { msg: err.message }));
    }
  };
}

async function batchImportFiles(files) {
  const overlay = createProgressOverlay(t('model.importing'));
  let imported = 0;

  for (const file of files) {
    try {
      const data = await file.arrayBuffer();
      const analysis = analyzeOnnx(data);
      const category = analysis.category !== 'unknown' ? analysis.category : 'formula-rec';
      const variantId = file.name.replace('.onnx', '');

      await importSingleFile(file, category, variantId);
      imported++;
      overlay.update(`${file.name} (${imported}/${files.length})`);
    } catch (err) {
      console.warn('Failed to import:', file.name, err);
    }
  }

  overlay.done(t('model.importSuccess', { count: imported }));
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function createProgressOverlay(message) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content">
      <p class="modal-status">${message}</p>
      <div class="modal-progress">
        <div class="modal-progress-bar"><div class="modal-progress-fill"></div></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const fill = overlay.querySelector('.modal-progress-fill');
  return {
    update(msg, pct) {
      overlay.querySelector('.modal-status').textContent = msg;
      if (pct !== undefined && fill) fill.style.width = pct + '%';
    },
    done(msg) {
      overlay.querySelector('.modal-status').textContent = msg;
      overlay.querySelector('.modal-status').className = 'modal-status success';
      if (fill) { fill.style.width = '100%'; fill.style.background = '#22c55e'; }
      // Refresh model settings if visible
      const section = document.getElementById('modelManagement');
      if (section && section.__refresh) section.__refresh();

      // Sync active variants to Java and reload
      if (isNativeOcrAvailable()) {
        (async () => {
          try {
            const active = getActiveModels();
            for (const cat of MODEL_CATEGORIES) {
              if (active[cat]?.variantId) {
                await window.NativeOcr?.setActiveModel(cat, active[cat].variantId);
              }
            }
            Logger.info('import', 'Active variants synced to Java');
          } catch (e) {
            Logger.error('import', 'Failed to sync active variants', e);
          }
          try {
            Logger.info('import', 'Reloading models...');
            await OcrNative.reloadModels();
            // Wait for reload to complete
            const start = Date.now();
            while (Date.now() - start < 60000) {
              await new Promise(r => setTimeout(r, 1000));
              const status = await OcrNative.getStatus();
              if (status === 'ready') {
                Logger.info('import', 'Models reloaded successfully');
                break;
              }
            }
            const statusRaw = await OcrNative.getModelStatus();
            window.__nativeModelStatus = typeof statusRaw === 'string' ? JSON.parse(statusRaw) : statusRaw;
            Logger.info('import', 'Model status: ' + JSON.stringify(window.__nativeModelStatus));
          } catch (e) {
            Logger.error('import', 'Failed to reload models', e);
          }
        })();
      }

      setTimeout(() => overlay.remove(), 2000);
    },
    error(msg) {
      overlay.querySelector('.modal-status').textContent = msg;
      overlay.querySelector('.modal-status').className = 'modal-status error';
      setTimeout(() => overlay.remove(), 3000);
    },
  };
}
