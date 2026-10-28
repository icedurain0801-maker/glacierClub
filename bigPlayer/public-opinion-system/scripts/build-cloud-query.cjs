'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { BaasClient, readToken } = require('../server/src/services/baasDataClient');
const { publishDocuments } = require('../server/src/services/baasQueryProjectionWriter');
const { COLLECTION, VERSION } = require('../shared/cloudQueryProjection');
const { COLLECTION: METADATA } = require('../server/src/services/baasReadMetadata');
const root = 'C:/ProgramData/PublicOpinion/data/baas-query';
const file = path.join(root, 'build-state.json');
const digest = ids => crypto.createHash('sha256').update([...ids].sort().join('\n')).digest('hex');
function save(state) { fs.mkdirSync(root, { recursive: true }); const temporary = file + '.tmp'; fs.writeFileSync(temporary, JSON.stringify(state)); fs.renameSync(temporary, file); }
async function run() {
  process.env.PUBLIC_OPINION_SERVICE_MODE = '1'; process.env.PUBLIC_OPINION_ENV_FILE = 'C:/ProgramData/PublicOpinion/config/public-opinion.env';
  require('../server/src/runtimeEnv').loadRuntimeEnv();
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
  const { Repository } = require('../server/src/db/repository'); const repo = new Repository();
  const phase = process.argv[2] || 'inspect';
  let lock;
  try {
    if (phase === 'inspect') { const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null; console.log(JSON.stringify(state ? { phase, count: state.ids.length, position: state.position, status: state.status } : { phase, status: 'not_initialized' })); return; }
    lock = await repo.pool.getConnection();
    const [rows] = await lock.query("SELECT GET_LOCK('po_baas_query_builder',0) acquired");
    if (!Number(rows[0].acquired)) throw Object.assign(new Error('Query builder already running'), { code: 'BAAS_QUERY_BUILD_BUSY' });
    const token = readToken('C:/ProgramData/PublicOpinion/config/baas-data-token.dpapi');
    const client = new BaasClient(token, undefined, COLLECTION), metadataClient = new BaasClient(token, undefined, METADATA);
    await client.verify();
    let state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
    if (phase === 'prepare') {
      if (state) throw Object.assign(new Error('Preserve existing build progress'), { code: 'BAAS_QUERY_BUILD_EXISTS' });
      const live = JSON.parse(fs.readFileSync('C:/ProgramData/PublicOpinion/data/baas-live/state.json'));
      const ids = Object.keys(live.hashes).sort();
      if (!ids.length) throw new Error('No cloud content IDs');
      state = { schemaVersion: VERSION, ids, position: 0, idsDigest: digest(ids), status: 'building', startedAt: new Date().toISOString() };
      save(state); await metadataClient.put('query-current', { schemaVersion: VERSION, status: 'building', expectedCount: ids.length, idsDigest: state.idsDigest });
      console.log(JSON.stringify({ phase, count: ids.length, status: state.status })); return;
    }
    if (!state || digest(state.ids) !== state.idsDigest) throw Object.assign(new Error('Invalid build checkpoint'), { code: 'BAAS_QUERY_BUILD_INVALID' });
    if (phase === 'build' || phase === 'repair') {
      const cursor = phase === 'repair' ? 'revisionPosition' : 'position'; state[cursor] ||= 0;
      const maxBatches = Math.max(1, Number(process.argv[3]) || 1); const stopAt = Math.min(state.ids.length, state[cursor] + maxBatches * 50);
      while (state[cursor] < stopAt) {
        const ids = state.ids.slice(state[cursor], Math.min(stopAt, state[cursor] + 50));
        let result;
        for (let attempt = 0; attempt < 3; attempt++) {
          try { result = await publishDocuments({ repo, token, ids, client, concurrency: 2 }); break; }
          catch (e) { if (attempt === 2 || ![429, 500, 502, 503, 504].includes(e.status) && !['BAAS_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT'].includes(e.code)) throw e; await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt)); }
        }
        if (result.missingIds.length || result.written !== ids.length) throw Object.assign(new Error('Missing source data'), { code: 'BAAS_QUERY_BUILD_INCOMPLETE' });
        state[cursor] += ids.length; state.revisions = { ...(state.revisions || {}), ...result.revisions }; save(state);
        console.log(JSON.stringify({ phase, written: state[cursor], total: state.ids.length }));
      }
      return;
    }
    if (phase === 'verify') {
      if (state.position !== state.ids.length) throw Object.assign(new Error('Build not finished'), { code: 'BAAS_QUERY_BUILD_INCOMPLETE' });
      if (state.ids.some(id => !state.revisions?.[id])) throw Object.assign(new Error('Revisions require repair before activation'), { code: 'BAAS_QUERY_BUILD_REPAIR_REQUIRED' });
      const result = await client.request('POST', `v1/collections/${COLLECTION}/query`, { limit: 1, with_total: true, where: { schemaVersion: VERSION } });
      if (result.total !== state.ids.length) throw Object.assign(new Error('Count mismatch'), { code: 'BAAS_QUERY_BUILD_COUNT_MISMATCH' });
      // Every expected ID was acknowledged under that ID; equal total excludes extra documents.
      const marker = { schemaVersion: VERSION, status: 'ready', expectedCount: state.ids.length, idsDigest: state.idsDigest, verifiedAt: new Date().toISOString() };
      await metadataClient.put('query-current', marker); state.status = 'ready'; state.verifiedAt = marker.verifiedAt; save(state); console.log(JSON.stringify(marker)); return;
    }
    throw new Error('Unknown phase');
  } finally { if (lock) { try { await lock.query("SELECT RELEASE_LOCK('po_baas_query_builder')"); } finally { lock.release(); } } await repo.pool.end(); }
}
if (require.main === module) run().catch(e => { console.error(JSON.stringify({ status: 'failed', code: /^[A-Z0-9_]+$/.test(e.code || '') ? e.code : 'BAAS_QUERY_BUILD_FAILED' })); process.exitCode = 1; });
module.exports = { digest };
