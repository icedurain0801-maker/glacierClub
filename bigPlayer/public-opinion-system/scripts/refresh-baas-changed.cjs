const fs = require('node:fs');
const { BaasClient, readToken, syncChanged, saveState } = require('../worker/src/baasLiveWriter');
const { publishMetadata } = require('../server/src/services/baasReadMetadata');
(async () => {
  process.loadEnvFile('C:/ProgramData/PublicOpinion/config/public-opinion.env');
  const { Repository } = require('../server/src/db/repository'); const repo = new Repository(); let lock;
  try {
    lock = await repo.pool.getConnection();
    const [rows] = await lock.query("SELECT GET_LOCK('po_baas_live_writer',10) acquired");
    if (!Number(rows[0].acquired)) throw Object.assign(new Error('Writer busy'), { code: 'BAAS_WRITER_BUSY' });
    const file = 'C:/ProgramData/PublicOpinion/data/baas-live/state.json'; const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    const client = new BaasClient(readToken('C:/ProgramData/PublicOpinion/config/baas-data-token.dpapi')); await client.verify();
    let examined = 0, written = 0;
    for (let batch = 0; batch < 200; batch++) {
      const result = await syncChanged({ repo, client, state, save: state => saveState(file, state) });
      examined += result.examined; written += result.written;
      console.log(JSON.stringify({ phase: 'refresh-changed', examined, written }));
      if (result.examined < 50) break;
      if (batch === 199) throw Object.assign(new Error('Too many changes'), { code: 'BAAS_CHANGE_BACKLOG' });
    }
    const metadata = await publishMetadata({ repo, token: client.token, contentIds: Object.keys(state.hashes).sort(), previousHash: state.metadataHash });
    state.metadataHash = metadata.hash; saveState(file, state);
    console.log(JSON.stringify({ phase: 'refresh-completed', examined, written, metadataWritten: metadata.written }));
  } finally { if (lock) { try { await lock.query("SELECT RELEASE_LOCK('po_baas_live_writer')"); } finally { lock.release(); } } await repo.pool.end(); }
})().catch(error => { console.error(JSON.stringify({ status: 'failed', code: error.code || `BAAS_HTTP_${error.status || 'ERROR'}` })); process.exitCode = 1; });
