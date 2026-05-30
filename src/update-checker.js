// Update checker — fetches latest release from GitHub, shows changelog modal

const REPO_API = 'https://api.github.com/repos/strangelion/LaTeXSnipper_mobile/releases/latest';
const CHECK_INTERVAL = 12 * 60 * 60 * 1000;

let _currentVersion = null;

function _showToast(text) {
  document.querySelector('.toast-popup')?.remove();
  const el = document.createElement('div');
  el.className = 'toast-popup';
  el.innerHTML = `<p>${text}</p><button class="toast-close">确定</button>`;
  document.body.appendChild(el);
  el.querySelector('.toast-close').addEventListener('click', () => el.remove());
  el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
}

function _showUpdateDialog(version, url, body) {
  document.querySelector('.update-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'update-overlay';

  const releaseNotes = body
    ? body.replace(/### /g, '\n### ').replace(/## /g, '\n## ').replace(/!?\[.*?\]\(.*?\)/g, '').trim()
    : '暂无更新说明。';

  overlay.innerHTML = `
    <div class="update-dialog">
      <div class="update-dialog-header">
        <h3>v${version} 新版本</h3>
        <button class="update-dialog-close">&times;</button>
      </div>
      <div class="update-dialog-body">${releaseNotes}</div>
      <div class="update-dialog-footer">
        <button class="ocr-btn secondary" id="updateCancel">取消</button>
        <a href="${url}" target="_blank" rel="noopener" class="ocr-btn" id="updateGo" style="text-align:center;text-decoration:none;">更新</a>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.update-dialog-close').addEventListener('click', close);
  overlay.querySelector('#updateCancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

// ── Fetch latest release ──

async function _fetchLatest() {
  const resp = await fetch(REPO_API, { headers: { Accept: 'application/vnd.github.v3+json' } });
  if (!resp.ok) return null;
  const data = await resp.json();
  return {
    version: (data.tag_name || '').replace(/^v/, ''),
    url: data.html_url,
    body: data.body || '',
  };
}

function _isNewer(newVer, curVer) {
  const a = newVer.split('.').map(Number);
  const b = curVer.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

// ── Background auto-check ──

let _autoCheckTimer = null;

async function _autoCheck() {
  try {
    const pref = localStorage.getItem('latexsnipper-autoUpdate');
    if (pref === 'false' || pref === null) return;
  } catch (_) {}

  try {
    const lastCheck = parseInt(localStorage.getItem('latexsnipper-lastUpdateCheck'), 10) || 0;
    if (Date.now() - lastCheck < CHECK_INTERVAL) return;
  } catch (_) {}

  const info = await _fetchLatest();
  if (!info || !_isNewer(info.version, _currentVersion)) return;

  try { localStorage.setItem('latexsnipper-lastUpdateCheck', String(Date.now())); } catch (_) {}

  _showUpdateDialog(info.version, info.url, info.body);
}

export function initUpdateChecker(currentVersion) {
  _currentVersion = currentVersion;
  _autoCheckTimer = setTimeout(_autoCheck, 30000);
}

// ── Manual check (settings button) ──

export async function checkForUpdateNow() {
  try {
    const info = await _fetchLatest();
    try { localStorage.setItem('latexsnipper-lastUpdateCheck', String(Date.now())); } catch (_) {}

    if (!info) {
      _showToast('无法连接到更新服务器，请检查网络后重试。');
      return { found: false, error: true };
    }
    if (!_isNewer(info.version, _currentVersion)) {
      _showToast('已是最新版本');
      return { found: false, current: _currentVersion };
    }

    _showUpdateDialog(info.version, info.url, info.body);
    return { found: true, version: info.version, url: info.url };
  } catch (e) {
    _showToast('检查更新失败: ' + (e.message || '网络错误'));
    return { found: false, error: true };
  }
}
