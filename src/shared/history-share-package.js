// Portable history package format shared with the desktop app.

export const HISTORY_SHARE_SCHEMA = 'latexsnipper.share.history.v1';

function entryId(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function buildHistoryPackage(records, source = 'mobile') {
  const now = Date.now();
  const seen = new Set();
  const entries = [];
  for (const record of records || []) {
    const latex = String(record?.latex || '').trim();
    if (!latex || seen.has(latex)) continue;
    seen.add(latex);
    entries.push({
      id: record.id ? String(record.id) : entryId(latex),
      latex,
      title: record.title || '',
      contentType: record.contentType || record.type || 'formula',
      renderTag: record.renderTag || 'latex',
      favorite: Boolean(record.favorite),
      confidence: Number.isFinite(record.confidence) ? record.confidence : 1,
      source: record.source || source,
      createdAt: Number.isFinite(record.createdAt) ? record.createdAt : now,
    });
  }
  return {
    schema: HISTORY_SHARE_SCHEMA,
    version: 1,
    source,
    exportedAt: now,
    entries,
  };
}

export function parseHistoryPackage(payload) {
  const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
  if (!data || data.schema !== HISTORY_SHARE_SCHEMA || !Array.isArray(data.entries)) {
    throw new Error('Unsupported history package');
  }
  return data;
}

export function packageToRecords(payload) {
  const pkg = parseHistoryPackage(payload);
  return pkg.entries
    .map(item => ({
      latex: String(item?.latex || '').trim(),
      confidence: Number.isFinite(item?.confidence) ? item.confidence : 1,
      type: item?.contentType || 'formula',
      source: item?.source || pkg.source || 'shared',
      favorite: Boolean(item?.favorite),
      createdAt: Number.isFinite(item?.createdAt) ? item.createdAt : Date.now(),
    }))
    .filter(item => item.latex);
}
