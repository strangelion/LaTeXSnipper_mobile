// History module — IndexedDB storage for OCR results
import { openDB } from 'idb';

const DB_NAME = 'latexsnipper-history';
const DB_VERSION = 1;
const STORE_NAME = 'results';

let db = null;

async function getDB() {
  if (db) return db;
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('favorite', 'favorite');
      }
    },
  });
  return db;
}

export async function addResult({ latex, confidence, type = 'formula', source = 'file' }) {
  const database = await getDB();
  await database.add(STORE_NAME, {
    latex,
    confidence,
    type,
    source,
    favorite: false,
    createdAt: Date.now(),
  });
}

export async function getAllResults({ filter = 'all' } = {}) {
  const database = await getDB();
  const all = await database.getAllFromIndex(STORE_NAME, 'createdAt');
  all.reverse();
  if (filter === 'favorites') return all.filter(r => r.favorite);
  return all;
}

export async function toggleFavorite(id) {
  const database = await getDB();
  const record = await database.get(STORE_NAME, id);
  if (record) {
    record.favorite = !record.favorite;
    await database.put(STORE_NAME, record);
    return record.favorite;
  }
  return false;
}

export async function deleteResult(id) {
  const database = await getDB();
  await database.delete(STORE_NAME, id);
}

export async function clearHistory() {
  const database = await getDB();
  const all = await database.getAll(STORE_NAME);
  const tx = database.transaction(STORE_NAME, 'readwrite');
  for (const record of all) {
    await tx.store.delete(record.id);
  }
  await tx.done;
}

export async function getResultCount() {
  const database = await getDB();
  return await database.count(STORE_NAME);
}
