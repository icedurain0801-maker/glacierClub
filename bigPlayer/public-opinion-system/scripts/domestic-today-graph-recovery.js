'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { SOURCE_ID, ACCOUNT_ID, WINDOW_START } = require('../worker/src/domesticTodayRecovery');
const { recoverDomesticFeed } = require('../worker/src/domesticTodayFeedRecovery');
const { recoverDomesticComments } = require('../worker/src/domesticTodayCommentRecovery');
const { domesticGraphRepository } = require('../worker/src/domesticTodayGraphRepository');
const { inspectDomesticSchema } = require('../worker/src/domesticTodayRepository');
const { domesticDetailConnector } = require('../server/src/connectors/domesticTodayDetailConnector');
const RELEASE = 'C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1';
const ROOT = path.resolve(__dirname, '../../..', '.temp/domestic-today-recovery-20261009');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function runtime() {
  return { Repository: require(path.join(RELEASE, 'server/src/db/repository.js')).Repository,
    Base: require(path.join(RELEASE, 'server/src/connectors/bigPlayerH5Connector.js')).BigPlayerH5Connector,
    CredentialContext: require(path.join(RELEASE, 'server/src/services/credentialContext.js')).CredentialContext };
}
function inventory() {
  runtime(); return Object.fromEntries(Object.keys(require.cache).sort().map(file => [file, sha(file)]));
}
function outputAllowed(file) {
  if (!path.isAbsolute(file || '') || fs.existsSync(file)) fail('DOMESTIC_NEW_OUTPUT_REQUIRED');
  const relative = path.relative(ROOT, file); if (relative.startsWith('..') || path.isAbsolute(relative)) fail('DOMESTIC_OUTPUT_SCOPE');
}
async function main(args = process.argv.slice(2)) {
  if (args.length !== 2 || !['--build-plan', '--approved-plan'].includes(args[0]) || !path.isAbsolute(args[1])) fail('DOMESTIC_GRAPH_PLAN_REQUIRED');
  const files = inventory();
  if (args[0] === '--build-plan') {
    outputAllowed(args[1]);
    fs.writeFileSync(args[1], JSON.stringify({ approved: false, mode: 'feed', feedKey: null, postId: null, commentId: null,
      sourceId: SOURCE_ID, accountId: ACCOUNT_ID, publishedFrom: WINDOW_START, publishedTo: '2026-10-09T04:31:29.177Z',
      maxPages: 1, output: path.join(ROOT, 'graph-first-execution.json'), expectedIdentity: 'root@localhost',
      envFile: 'C:/ProgramData/PublicOpinion/config/public-opinion.env', files, cliSha256: sha(__filename) }, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ status: 'GRAPH_PLAN_BUILT_NO_IO', files: Object.keys(files).length })); return;
  }
  const plan = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  if (plan.approved !== true || plan.cliSha256 !== sha(__filename) || JSON.stringify(plan.files) !== JSON.stringify(files)
    || plan.envFile !== 'C:/ProgramData/PublicOpinion/config/public-opinion.env' || plan.expectedIdentity !== 'root@localhost'
    || !['feed', 'comments'].includes(plan.mode)) fail('DOMESTIC_GRAPH_APPROVAL_INVALID');
  outputAllowed(plan.output); process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1'; process.loadEnvFile(plan.envFile);
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
  if (process.env.DATABASE_URL || process.env.DB_HOST !== '127.0.0.1' || Number(process.env.DB_PORT) !== 3306 || process.env.DB_NAME !== 'public_opinion') fail('DOMESTIC_DB_TARGET_MISMATCH');
  const { Repository, Base, CredentialContext } = runtime(), repo = new Repository({ ...process.env, DB_POOL_SIZE: '3' });
  let report, phase = 'identity_read';
  try {
    const [identity] = await repo.query('SELECT CURRENT_USER() AS identity,DATABASE() AS db');
    if (identity.identity !== plan.expectedIdentity || identity.db !== 'public_opinion') fail('DOMESTIC_IDENTITY_MISMATCH');
    phase = 'source_account_read'; const [source] = await repo.query('SELECT s.*,g.region_code FROM po_sources s JOIN po_games g ON g.id=s.game_id WHERE s.id=?', [SOURCE_ID]);
    const account = await repo.getAccount(ACCOUNT_ID); await inspectDomesticSchema(repo);
    const Connector = domesticDetailConnector(Base), connector = new Connector({}, { credentialContext: new CredentialContext({ repo }) });
    connector.feedMaxPages = 500; connector.feedNoNewPageBudget = 10000;
    plan.analysisVersion = process.env.AI_ANALYSIS_LIGHT_VERSION || process.env.AI_ANALYSIS_VERSION || 'sentiment-v1';
    const signal = AbortSignal.timeout(240000);
    const operation = plan.mode === 'feed' ? recoverDomesticFeed : recoverDomesticComments;
    report = await operation({ repo: domesticGraphRepository(repo), connector, source, account, plan, signal, onPhase: value => { phase = value; } });
  } catch (error) { report = { status: 'FAILED_GRAPH', phase,
    storePhase: /^[a-z_]+$/.test(error.recoveryPhase || '') ? error.recoveryPhase : null,
    operation: Number.isSafeInteger(error.recoveryOperation) ? error.recoveryOperation : null,
    errorCode: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'DOMESTIC_GRAPH_FAILED' }; }
  finally { await repo.pool.end(); }
  fs.writeFileSync(plan.output, JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify(report));
  if (report.status === 'FAILED_GRAPH') process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.code || 'DOMESTIC_GRAPH_FAILED'); process.exitCode = 1; });
module.exports = { main, inventory };
