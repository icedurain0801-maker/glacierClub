const fs = require('node:fs');
const { BaasClient, readToken } = require('../server/src/services/baasDataClient');
const { publishMetadata, COLLECTION } = require('../server/src/services/baasReadMetadata');
const { saveState } = require('../worker/src/baasLiveWriter');
(async () => {
  process.loadEnvFile('C:/ProgramData/PublicOpinion/config/public-opinion.env');
  const { Repository } = require('../server/src/db/repository');
  const repo = new Repository(); let lock;
  try {
    lock = await repo.pool.getConnection();
    const [rows] = await lock.query("SELECT GET_LOCK('po_baas_live_writer',10) acquired");
    if (!Number(rows[0].acquired)) throw Object.assign(new Error('Another writer is running'), { code: 'BAAS_WRITER_BUSY' });
    const file = 'C:/ProgramData/PublicOpinion/data/baas-live/state.json';
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    const token = readToken('C:/ProgramData/PublicOpinion/config/baas-data-token.dpapi');
    const client = new BaasClient(token); await client.verify();
    await client.request('PUT', 'v1/app/collections', [{ collection: COLLECTION, acl: 'private', audit: true }]);
    const result = await publishMetadata({ repo, token, contentIds: Object.keys(state.hashes).sort() });
    state.metadataHash = result.hash; saveState(file, state);
    console.log(JSON.stringify({ phase: 'cloud-read-metadata-published', ...result, contents: Object.keys(state.hashes).length }));
  } finally {
    if (lock) { try { await lock.query("SELECT RELEASE_LOCK('po_baas_live_writer')"); } finally { lock.release(); } }
    await repo.pool.end();
  }
})().catch(error => { console.error(JSON.stringify({ status: 'failed', code: error.code || `BAAS_HTTP_${error.status || 'ERROR'}` })); process.exitCode = 1; });
