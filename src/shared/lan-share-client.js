// Client for the desktop LAN sharing server.

function normalizeBaseUrl(baseUrl) {
  const value = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(value)) throw new Error('LAN URL must start with http:// or https://');
  return value;
}

function pinQuery(pin) {
  const value = String(pin || '').trim();
  if (!/^\d{6}$/.test(value)) throw new Error('PIN must be 6 digits');
  return encodeURIComponent(value);
}

export async function fetchLanHistory(baseUrl, pin) {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/history?pin=${pinQuery(pin)}`;
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`LAN pull failed: HTTP ${resp.status}`);
  return resp.json();
}

export async function pushLanHistory(baseUrl, pin, historyPackage) {
  const url = `${normalizeBaseUrl(baseUrl)}/api/v1/history/import?pin=${pinQuery(pin)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(historyPackage),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.ok === false) {
    throw new Error(data.error || `LAN push failed: HTTP ${resp.status}`);
  }
  return data;
}
