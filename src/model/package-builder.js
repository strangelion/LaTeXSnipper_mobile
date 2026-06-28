// Package Builder — in-app tool to create model packages
import { MODEL_CATEGORIES, importFromZip } from './model-manager.js';

const CAT_LABELS = {
  'formula-det': '公式检测',
  'formula-rec': '公式识别',
  'text-det': '文字检测',
  'text-rec': '文字识别',
};

/**
 * Open the package builder dialog.
 */
export function openPackageBuilder() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content package-builder">
      <h3>创建模型包</h3>

      <label>包名称</label>
      <input type="text" id="pkg-name" placeholder="我的模型包" />

      <label>版本</label>
      <input type="text" id="pkg-version" placeholder="1.0.0" value="1.0.0" />

      <label>来源URL (可选)</label>
      <input type="text" id="pkg-url" placeholder="https://github.com/..." />

      <div id="pkg-categories">
        ${MODEL_CATEGORIES.map(cat => `
          <div class="pkg-category" data-category="${cat}">
            <h4>${CAT_LABELS[cat]} (可选)</h4>
            <div class="file-drop-zone" data-category="${cat}">
              拖入.onnx文件或点击选择
              <input type="file" accept=".onnx" multiple class="file-input" data-category="${cat}" />
            </div>
            <div class="file-list" data-category="${cat}"></div>
          </div>
        `).join('')}
      </div>

      <div class="pkg-summary">
        总大小: <span id="pkg-total-size">0</span>
      </div>

      <div class="modal-actions">
        <button id="pkg-cancel">取消</button>
        <button id="pkg-export">导出ZIP</button>
        <button id="pkg-install">直接安装</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  initPackageBuilder(overlay);
}

function initPackageBuilder(overlay) {
  const filesByCategory = {};
  let totalSize = 0;

  // File input handlers
  overlay.querySelectorAll('.file-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const cat = input.dataset.category;
      const newFiles = Array.from(e.target.files);
      if (!filesByCategory[cat]) filesByCategory[cat] = [];
      filesByCategory[cat].push(...newFiles);
      updateFileList(overlay, cat, filesByCategory[cat]);
      totalSize = Object.values(filesByCategory).flat().reduce((s, f) => s + f.size, 0);
      overlay.querySelector('#pkg-total-size').textContent = formatSize(totalSize);
    });

    const dropZone = overlay.querySelector(`.file-drop-zone[data-category="${input.dataset.category}"]`);
    dropZone?.addEventListener('click', () => input.click());
  });

  // Drag and drop
  overlay.querySelectorAll('.file-drop-zone').forEach(zone => {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const cat = zone.dataset.category;
      const newFiles = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.onnx'));
      if (!filesByCategory[cat]) filesByCategory[cat] = [];
      filesByCategory[cat].push(...newFiles);
      updateFileList(overlay, cat, filesByCategory[cat]);
      totalSize = Object.values(filesByCategory).flat().reduce((s, f) => s + f.size, 0);
      overlay.querySelector('#pkg-total-size').textContent = formatSize(totalSize);
    });
  });

  // Cancel
  overlay.querySelector('#pkg-cancel').addEventListener('click', () => overlay.remove());

  // Export ZIP
  overlay.querySelector('#pkg-export').addEventListener('click', async () => {
    await exportPackage(overlay, filesByCategory, 'zip');
  });

  // Install directly
  overlay.querySelector('#pkg-install').addEventListener('click', async () => {
    await exportPackage(overlay, filesByCategory, 'install');
  });
}

function updateFileList(overlay, category, files) {
  const list = overlay.querySelector(`.file-list[data-category="${category}"]`);
  list.innerHTML = files.map((f, i) => `
    <div class="file-item">
      <span>${f.name} (${formatSize(f.size)})</span>
      <button class="btn-remove-file" data-category="${category}" data-index="${i}">×</button>
    </div>
  `).join('');

  list.querySelectorAll('.btn-remove-file').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.category;
      const idx = parseInt(btn.dataset.index);
      files[cat].splice(idx, 1);
      updateFileList(overlay, cat, files[cat]);
    });
  });
}

async function exportPackage(overlay, filesByCategory, mode) {
  const name = overlay.querySelector('#pkg-name').value || 'custom-model-pack';
  const version = overlay.querySelector('#pkg-version').value || '1.0.0';
  const url = overlay.querySelector('#pkg-url').value;

  // Build manifest
  const manifest = {
    sourceId: 'custom-' + Date.now(),
    sourceLabel: name,
    version: version,
    baseUrl: url || '',
    categories: {},
  };

  for (const [cat, files] of Object.entries(filesByCategory)) {
    if (files.length === 0) continue;
    manifest.categories[cat] = {
      label: CAT_LABELS[cat],
      required: false,
      default: files[0].name.replace('.onnx', ''),
      variants: files.map(f => ({
        id: f.name.replace('.onnx', ''),
        label: f.name.replace('.onnx', ''),
        files: [f.name],
        sizeBytes: f.size,
      })),
    };
  }

  // Dynamically import JSZip
  let JSZip;
  try {
    const mod = await import('jszip');
    JSZip = mod.default || mod.JSZip;
  } catch {
    JSZip = window.JSZip;
  }
  if (!JSZip) {
    alert('JSZip not available');
    return;
  }

  const zip = new JSZip();
  zip.file('model-manifest.json', JSON.stringify(manifest, null, 2));

  for (const [cat, files] of Object.entries(filesByCategory)) {
    for (const file of files) {
      const data = await file.arrayBuffer();
      zip.file(`${cat}/${file.name}`, data);
    }
  }

  if (mode === 'zip') {
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-v${version}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  } else {
    const blob = await zip.generateAsync({ type: 'blob' });
    const zipFile = new File([blob], `${name}-v${version}.zip`);
    await importFromZip(zipFile);
    alert('模型包已安装');
  }

  overlay.remove();
}

function formatSize(bytes) {
  if (!bytes) return '0';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}
