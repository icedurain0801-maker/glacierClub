// 内存向量索引，按 version_id 分组。启动加载全部；后续增删同步。
const db = require('../config/db');

// versionId -> Array<{entryId, vec:Float32Array}>
const store = new Map();

function _get(versionId) {
  if (!store.has(versionId)) store.set(versionId, []);
  return store.get(versionId);
}

async function loadAll() {
  store.clear();
  const [rows] = await db.query('SELECT version_id, entry_id, embedding FROM kb_vectors');
  for (const r of rows) {
    let vec;
    try { vec = Float32Array.from(JSON.parse(r.embedding)); } catch { continue; }
    _get(r.version_id).push({ entryId: r.entry_id, vec });
  }
}

function add(versionId, entryId, embeddingArray) {
  _get(versionId).push({ entryId, vec: Float32Array.from(embeddingArray) });
}

function removeEntry(versionId, entryId) {
  const arr = _get(versionId);
  const idx = arr.findIndex(x => x.entryId === entryId);
  if (idx >= 0) arr.splice(idx, 1);
}

function removeDocument(versionId, entryIds) {
  const set = new Set(entryIds);
  const arr = _get(versionId);
  store.set(versionId, arr.filter(x => !set.has(x.entryId)));
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// 检索：仅在同 versionId 内做（隔离保证）
function search(versionId, queryVec, topK = 10) {
  const arr = _get(versionId);
  const qv = Float32Array.from(queryVec);
  const scored = arr.map(x => ({ entryId: x.entryId, score: cosine(qv, x.vec) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

module.exports = { loadAll, add, removeEntry, removeDocument, search, _store: store };
