'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { loadOriginals, root, sha } = require('./overseas-real-artifact-audit');
async function main() {
  if (process.argv[2] !== '--execute') throw Object.assign(new Error('explicit bounded execution required'), { code: 'EXECUTION_FLAG_REQUIRED' });
  require('../server/src/runtimeEnv').loadRuntimeEnv();
  const { Repository } = require('../server/src/db/repository');
  const { AiAnalyzer } = require('../server/src/integrations/aiAnalyzer');
  const { importSample } = require('../worker/src/overseasSampleImport');
  const originals = loadOriginals(), repo = new Repository({ ...process.env, DB_POOL_SIZE: '1' });
  const evidencePath = path.join(root, '.temp', `overseas-real-sample-import-${Date.now()}.json`);
  // Reserve a receipt before any write. Existing receipt files are never replaced.
  fs.writeFileSync(evidencePath, JSON.stringify({ status: 'INTENT', artifactSha256: originals.artifacts[1].sha256 }), { flag: 'wx' });
  let result;
  try {
    result = await importSample({ repo, items: originals.items, artifactSha: originals.artifacts[1].sha256,
      analysisVersion: new AiAnalyzer(process.env).profiles.light.version,
      translationVersion: process.env.AI_TRANSLATION_VERSION || 'translation-v1' });
  } catch (e) {
    try { fs.writeFileSync(evidencePath, JSON.stringify({ status: e.code === 'OVERSEAS_SAMPLE_COMMIT_UNKNOWN' ? 'COMMIT_UNKNOWN' : 'NO_GO', errorCode: e.code || 'IMPORT_FAILED', diagnostic: e.diagnostic, rollbackUnknown: Boolean(e.rollbackUnknown), artifactSha256: originals.artifacts[1].sha256 }, null, 2)); } catch {}
    throw e;
  } finally { try { await repo.pool.end(); } catch {} }
  try {
    fs.writeFileSync(evidencePath, JSON.stringify({ ...result, originalArtifacts: originals.artifacts,
      implementationSha256: sha(fs.readFileSync(require.resolve('../worker/src/overseasSampleImport'))) }, null, 2) + '\n');
    console.log(JSON.stringify({ ...result, evidencePath, evidenceSha256: sha(fs.readFileSync(evidencePath)) }, null, 2));
  } catch {
    console.error(JSON.stringify({ status: 'COMMITTED_EVIDENCE_FAILED', sourceId: result.sourceId, artifactSha256: result.artifactSha256, runIds: result.runIds, evidencePath }));
    process.exitCode = 1;
  }
}
if (require.main === module) main().catch(e => { console.error(JSON.stringify({ status: 'NO_GO', errorCode: e.code || 'IMPORT_FAILED', diagnostic: e.diagnostic })); process.exitCode = 1; });
module.exports = { main };
