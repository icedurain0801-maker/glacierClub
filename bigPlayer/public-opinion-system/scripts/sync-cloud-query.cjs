'use strict';
process.env.PUBLIC_OPINION_SERVICE_MODE = '1';
process.env.PUBLIC_OPINION_ENV_FILE = 'C:/ProgramData/PublicOpinion/config/public-opinion.env';
require('../server/src/runtimeEnv').loadRuntimeEnv();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
const fs = require('node:fs');
const { Repository } = require('../server/src/db/repository');
const { readToken } = require('../server/src/services/baasDataClient');
const { synchronize } = require('../server/src/services/baasQueryProjectionSync');
async function run() {
  const repo = new Repository();
  try {
    const token = readToken('C:/ProgramData/PublicOpinion/config/baas-data-token.dpapi');
    for (let round = 0; round < 10; round++) {
      const state = JSON.parse(fs.readFileSync('C:/ProgramData/PublicOpinion/data/baas-live/state.json'));
      const result = await synchronize({ repo, token, contentIds: Object.keys(state.hashes).sort() });
      console.log(JSON.stringify({ round, ...result }));
      if (result.status !== 'success' || !result.updated) break;
    }
  } finally { await repo.pool.end(); }
}
run().catch(e => { console.error(JSON.stringify({ status: 'failed', code: e.code || 'QUERY_SYNC_FAILED' })); process.exitCode = 1; });
