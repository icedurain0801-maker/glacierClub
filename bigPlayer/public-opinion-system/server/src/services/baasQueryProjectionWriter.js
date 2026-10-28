const { collectMetadata } = require('./baasReadMetadata');
const { BaasReadRepository } = require('./baasReadRepository');
const { project, COLLECTION } = require('../../../shared/cloudQueryProjection');
const { BaasClient } = require('./baasDataClient');
const crypto = require('node:crypto');
const { topicsForRow } = require('./topicClassifier');
function stable(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
async function revisionsFor(repo, ids) {
  if (!ids.length) return {};
  const slots = ids.map(() => '?').join(',');
  const rows = await repo.query(`SELECT c.id,c.fingerprint,MAX(c.last_seen_at) seen,MAX(a.analyzed_at) analyzed,MAX(j.updated_at) jobs,MAX(t.updated_at) translated,MAX(h.handled_at) handled,MAX(h.handled_by_name) handled_by_name FROM po_contents c LEFT JOIN po_analyses a ON a.content_id=c.id LEFT JOIN po_analysis_jobs j ON j.content_id=c.id LEFT JOIN po_content_translations t ON t.content_id=c.id LEFT JOIN po_content_handlings h ON h.content_id=c.id WHERE c.id IN (${slots}) GROUP BY c.id,c.fingerprint`, ids);
  return Object.fromEntries(rows.map(row => [row.id, crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex')]));
}
async function buildDocuments(repo, ids) {
  if (!ids.length) return [];
  const slots = ids.map(() => '?').join(',');
  const [contents, analyses, translations, metadata] = await Promise.all([
    repo.query(`SELECT c.*,s.platform FROM po_contents c JOIN po_sources s ON s.id=c.source_id WHERE c.id IN (${slots})`, ids),
    repo.query(`SELECT * FROM po_analyses WHERE content_id IN (${slots})`, ids),
    repo.query(`SELECT * FROM po_content_translations WHERE content_id IN (${slots})`, ids),
    collectMetadata(repo, ids)
  ]);
  const group = records => { const map = new Map(); for (const row of records) { const list = map.get(row.content_id) || []; list.push(row); map.set(row.content_id, list); } return map; };
  const a = group(analyses), t = group(translations), docs = new Map();
  for (const content of contents) {
    let originalType = null;
    try { const raw = typeof content.raw_payload === 'string' ? JSON.parse(content.raw_payload) : content.raw_payload; if ([0, 1, '0', '1'].includes(raw?.type)) originalType = Number(raw.type); } catch {}
    docs.set(content.id, { content, originalType, analyses: a.get(content.id) || [], translations: t.get(content.id) || [] });
  }
  return new BaasReadRepository().project({ docs, metadata }).map(row => project({ ...row, topics: row.sentiment ? topicsForRow(row) : [] }));
}
async function publishDocuments({ repo, token, ids, client, concurrency = 2 }) {
  client ||= new BaasClient(token, undefined, COLLECTION);
  // Capture before reading the snapshot so a concurrent write is retried on the next sync.
  const revisions = await revisionsFor(repo, ids);
  const rows = await buildDocuments(repo, ids);
  const existing = await client.request('POST', `v1/collections/${COLLECTION}/query`, { where: { id: { $in: ids } }, limit: Math.min(500, ids.length), with_total: true });
  const before = new Map((existing.docs || []).map(doc => [doc.id, JSON.stringify(stable(doc.data))]));
  let offset = 0, written = 0, stopped = false;
  const results = await Promise.allSettled(Array.from({ length: Math.min(4, Math.max(1, concurrency)) }, async () => {
    while (offset < rows.length && !stopped) { const row = rows[offset++]; try { if (before.get(row.id) !== JSON.stringify(stable(row))) await client.put(row.id, row); written++; } catch (e) { stopped = true; throw e; } }
  }));
  const failure = results.find(result => result.status === 'rejected'); if (failure) throw failure.reason;
  return { examined: ids.length, written, revisions, missingIds: ids.filter(id => !rows.some(row => row.id === id)), digest: crypto.createHash('sha256').update(rows.map(row => row.id).sort().join('\n')).digest('hex') };
}
module.exports = { buildDocuments, publishDocuments, revisionsFor };
