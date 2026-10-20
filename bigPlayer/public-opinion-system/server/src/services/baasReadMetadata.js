const crypto = require('node:crypto');
const { BaasClient } = require('./baasDataClient');
const COLLECTION = 'po_read_metadata_v1';
const hash = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
// No source config, credentials, account metadata or raw payloads enter the cloud read model.
async function collectMetadata(repo, contentIds) {
  const result = {
    games: await repo.query('SELECT id,name,kind,region_code,external_id FROM po_games ORDER BY id'),
    communities: await repo.query('SELECT id,game_id,name,status,sort_order,external_id FROM po_communities ORDER BY id'),
    sources: await repo.query('SELECT id,game_id,community_id,platform,display_name,enabled,frequency_seconds FROM po_sources ORDER BY id'),
    accounts: await repo.query('SELECT id,account_name FROM po_accounts ORDER BY id'),
    handlings: [], analysisJobs: [], translationJobs: [], quality: [], alerts: [], alertLinks: []
  };
  for (let offset = 0; offset < contentIds.length; offset += 200) {
    const ids = contentIds.slice(offset, offset + 200);
    const slots = ids.map(() => '?').join(',');
    for (const [key, sql] of [
      ['handlings', `SELECT content_id,handling_method,handling_note,handled_by_name,handled_at FROM po_content_handlings WHERE content_id IN (${slots}) ORDER BY content_id`],
      ['analysisJobs', `SELECT id,content_id,analysis_profile,analysis_version,status,error_code,error_message,updated_at FROM po_analysis_jobs WHERE content_id IN (${slots}) ORDER BY content_id,id`],
      ['translationJobs', `SELECT id,content_id,target_language,translation_version,content_fingerprint,status,error_code,updated_at FROM po_translation_jobs WHERE content_id IN (${slots}) ORDER BY content_id,id`],
      ['quality', `SELECT * FROM po_quality_candidates WHERE content_id IN (${slots}) ORDER BY id`],
      ['alertLinks', `SELECT alert_id,content_id FROM po_alert_contents WHERE content_id IN (${slots}) ORDER BY alert_id,content_id`]
    ]) result[key].push(...await repo.query(sql, ids));
  }
  const alertIds = [...new Set(result.alertLinks.map(link => link.alert_id))].sort();
  for (let offset = 0; offset < alertIds.length; offset += 200) {
    const ids = alertIds.slice(offset, offset + 200);
    result.alerts.push(...await repo.query(`SELECT * FROM po_alerts WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids));
  }
  return result;
}
function metadataChunks(metadata) {
  const chunks = [];
  for (const [table, rows] of Object.entries(metadata)) {
    let batch = []; let bytes = 0;
    const flush = () => { if (!batch.length) return; const data = { table, rows: batch }; chunks.push({ id: hash(data), data }); batch = []; bytes = 0; };
    for (const row of rows) {
      const size = Buffer.byteLength(JSON.stringify(row));
      if (size > 180000) throw Object.assign(new Error('Metadata row exceeds safe size'), { code: 'BAAS_METADATA_TOO_LARGE' });
      if (bytes + size > 180000) flush();
      batch.push(row); bytes += size + 1;
    }
    flush();
  }
  return chunks;
}
async function publishMetadata({ repo, token, contentIds, previousHash, client }) {
  const metadata = await collectMetadata(repo, contentIds);
  const chunks = metadataChunks(metadata);
  const manifest = { schemaVersion: 1, chunks: chunks.map(({ id, data }) => ({ id, table: data.table })), coverageFrom: '2026-10-12T00:00:00+08:00', trackedContents: contentIds.length };
  const manifestHash = hash(manifest);
  if (manifestHash === previousHash) return { hash: manifestHash, written: 0 };
  client ||= new BaasClient(token, undefined, COLLECTION);
  // Immutable chunks followed by a manifest commit keep readers on a complete generation.
  for (const chunk of chunks) {
    try { await client.request('GET', `v1/collections/${COLLECTION}/docs/${chunk.id}`); }
    catch (error) { if (error.status !== 404) throw error; await client.put(chunk.id, chunk.data); }
  }
  await client.put('current', manifest);
  return { hash: manifestHash, written: chunks.length + 1 };
}
module.exports = { COLLECTION, collectMetadata, metadataChunks, publishMetadata };
