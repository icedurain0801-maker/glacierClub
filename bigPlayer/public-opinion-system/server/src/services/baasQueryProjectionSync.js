const fs = require('node:fs');
const { revisionsFor, publishDocuments } = require('./baasQueryProjectionWriter');
const { BaasClient } = require('./baasDataClient');
const { COLLECTION, VERSION } = require('../../../shared/cloudQueryProjection');
const { COLLECTION: METADATA } = require('./baasReadMetadata');
const file = 'C:/ProgramData/PublicOpinion/data/baas-query/build-state.json';
async function synchronize({ repo, token, contentIds, limit = 100 }) {
  if (!fs.existsSync(file)) return { status: 'not_initialized' };
  let lock;
  try {
    lock = await repo.pool.getConnection(); const [rows] = await lock.query("SELECT GET_LOCK('po_baas_query_builder',0) acquired");
    if (!Number(rows[0].acquired)) return { status: 'building' };
    const state = JSON.parse(fs.readFileSync(file));
    if (state.status !== 'ready') return { status: 'building' };
    const changed = [];
    for (let offset = 0; offset < contentIds.length && changed.length < limit; offset += 200) {
      const ids = contentIds.slice(offset, offset + 200), revisions = await revisionsFor(repo, ids);
      for (const id of ids) if (revisions[id] && revisions[id] !== state.revisions?.[id]) changed.push(id);
    }
    const selected = changed.slice(0, limit);
    if (selected.length) {
      const result = await publishDocuments({ repo, token, ids: selected, client: new BaasClient(token, undefined, COLLECTION) });
      if (result.missingIds.length) throw Object.assign(new Error('Incomplete query projection'), { code: 'BAAS_QUERY_BUILD_INCOMPLETE' });
      state.revisions = { ...(state.revisions || {}), ...result.revisions };
      state.ids = [...new Set([...state.ids, ...selected])].sort(); state.position = state.ids.length;
      state.idsDigest = require('node:crypto').createHash('sha256').update(state.ids.join('\n')).digest('hex');
      const temporary = file + '.tmp'; fs.writeFileSync(temporary, JSON.stringify(state)); fs.renameSync(temporary, file);
      await new BaasClient(token, undefined, METADATA).put('query-current', { schemaVersion: VERSION, status: 'ready', expectedCount: state.ids.length, idsDigest: state.idsDigest, verifiedAt: new Date().toISOString() });
    }
    return { status: 'success', examined: contentIds.length, updated: selected.length };
  } finally { if (lock) { try { await lock.query("SELECT RELEASE_LOCK('po_baas_query_builder')"); } finally { lock.release(); } } }
}
module.exports = { synchronize };
