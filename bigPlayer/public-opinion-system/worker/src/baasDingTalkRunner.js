const fs = require('node:fs/promises');
const path = require('node:path');
const { BaasDingTalk } = require('../../server/src/services/baasDingTalk');
const { dispatchCollections } = require('./collectionDingTalk');
async function dispatch({ repo, service = new BaasDingTalk({ repo }), ...options }) {
  return dispatchCollections({ repo, service, ...options });
}
async function main() {
  process.env.PUBLIC_OPINION_SERVICE_MODE ||= '1';
  process.env.PUBLIC_OPINION_ENV_FILE ||= path.join(require('node:fs').realpathSync.native(path.join(process.env.ProgramData || 'C:/ProgramData', 'PublicOpinion')), 'config', 'public-opinion.env');
  require('../../server/src/runtimeEnv').loadRuntimeEnv();
  const { Repository } = require('../../server/src/db/repository'); const repo = new Repository(); const service = new BaasDingTalk({ repo }); let conn;
  try {
    conn = await repo.pool.getConnection(); const [[lock]] = await conn.query("SELECT GET_LOCK('po_baas_dingtalk_dispatch',0) acquired"); if (!Number(lock.acquired)) return;
    const result = await dispatch({ repo, service }); await fs.mkdir(service.directory, { recursive: true }); await fs.writeFile(path.join(service.directory, 'last-run.json'), JSON.stringify(result)); console.log(JSON.stringify(result));
  } catch (error) {
    const result = { checkedAt: new Date().toISOString(), error: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'BAAS_DINGTALK_DISPATCH_FAILED' };
    await fs.mkdir(service.directory, { recursive: true }); await fs.writeFile(path.join(service.directory, 'last-run.json'), JSON.stringify(result)); console.error(JSON.stringify(result)); process.exitCode = 1;
  } finally { if (conn) { try { await conn.query("SELECT RELEASE_LOCK('po_baas_dingtalk_dispatch')"); } finally { conn.release(); } } await repo.pool.end(); }
}
if (require.main === module) main();
module.exports = { dispatch, main };
