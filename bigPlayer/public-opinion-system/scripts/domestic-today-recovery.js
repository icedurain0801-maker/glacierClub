'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { recoverDomesticToday, SOURCE_ID, ACCOUNT_ID, WINDOW_START } = require('../worker/src/domesticTodayRecovery');
const { domesticDetailConnector } = require('../server/src/connectors/domesticTodayDetailConnector');
const { domesticRepository, inspectDomesticSchema } = require('../worker/src/domesticTodayRepository');
const RELEASE = 'C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1';
const ROOT = path.resolve(__dirname, '../../..', '.temp/domestic-today-recovery-20261009');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fail = code => { throw Object.assign(new Error(code), { code }); };
function loadRuntime() {
  const { Repository } = require(path.join(RELEASE, 'server/src/db/repository.js'));
  const { BigPlayerH5Connector } = require(path.join(RELEASE, 'server/src/connectors/bigPlayerH5Connector.js'));
  const { CredentialContext } = require(path.join(RELEASE, 'server/src/services/credentialContext.js'));
  return { Repository, BigPlayerH5Connector, CredentialContext };
}
function inventory() {
  loadRuntime();
  // Actual resolved modules, including package code, rather than a reused manifest.
  return Object.fromEntries(Object.keys(require.cache).sort().map(file => [file, sha(file)]));
}
function checkOutput(file) {
  if (!path.isAbsolute(file || '') || fs.existsSync(file)) fail('DOMESTIC_OUTPUT_INVALID');
  const relative = path.relative(ROOT, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail('DOMESTIC_OUTPUT_INVALID');
}
async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || !['--build-plan', '--approved-plan'].includes(argv[0]) || !path.isAbsolute(argv[1])) fail('DOMESTIC_EXPLICIT_PLAN_REQUIRED');
  if (argv[0] === '--build-plan') {
    const files = inventory();
    const plan = { approved: false, sourceId: SOURCE_ID, accountId: ACCOUNT_ID,
      publishedFrom: WINDOW_START, publishedTo: '2026-10-09T04:31:29.177Z', maxPages: 1,
      expectedIdentity: 'root@localhost', envFile: 'C:/ProgramData/PublicOpinion/config/public-opinion.env',
      output: path.join(ROOT, 'first-segment-execution.json'), files, cliSha256: sha(__filename) };
    checkOutput(argv[1]); fs.writeFileSync(argv[1], JSON.stringify(plan, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ status: 'PLAN_BUILT_NO_IO', files: Object.keys(files).length, plan: argv[1] })); return;
  }
  const plan = JSON.parse(fs.readFileSync(argv[1], 'utf8'));
  if (plan.approved !== true || plan.cliSha256 !== sha(__filename)
    || plan.envFile !== 'C:/ProgramData/PublicOpinion/config/public-opinion.env' || plan.expectedIdentity !== 'root@localhost') fail('DOMESTIC_APPROVED_PLAN_REQUIRED');
  checkOutput(plan.output);
  const files = inventory();
  if (JSON.stringify(files) !== JSON.stringify(plan.files)) fail('DOMESTIC_INVENTORY_MISMATCH');
  // Enforce strict TLS in this owned process only, including after loading the
  // legacy environment. Never edit the shared environment or running Worker.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
  process.loadEnvFile(plan.envFile);
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
  if (process.env.DATABASE_URL
    || process.env.DB_HOST !== '127.0.0.1' || Number(process.env.DB_PORT) !== 3306 || process.env.DB_NAME !== 'public_opinion') fail('DOMESTIC_DB_TARGET_MISMATCH');
  const { Repository, BigPlayerH5Connector, CredentialContext } = loadRuntime();
  const repo = new Repository({ ...process.env, DB_POOL_SIZE: '3' });
  let report, phase = 'identity_read';
  try {
    const [[identity]] = await repo.pool.query('SELECT CURRENT_USER() AS identity,DATABASE() AS db,UTC_TIMESTAMP(3) AS now');
    if (identity.identity !== plan.expectedIdentity || identity.db !== 'public_opinion') fail('DOMESTIC_IDENTITY_MISMATCH');
    phase = 'source_account_read';
    const rows = await repo.query('SELECT s.*,g.region_code FROM po_sources s JOIN po_games g ON g.id=s.game_id WHERE s.id=?', [SOURCE_ID]);
    const source = rows[0], account = await repo.getAccount(ACCOUNT_ID);
    phase = 'schema_read'; await inspectDomesticSchema(repo);
    plan.analysisVersion = process.env.AI_ANALYSIS_LIGHT_VERSION || process.env.AI_ANALYSIS_VERSION || 'sentiment-v1';
    const credentialContext = new CredentialContext({ repo });
    const Connector = domesticDetailConnector(BigPlayerH5Connector);
    // Existing token only. No coordinator, login refresh or external source factory.
    const connector = new Connector({ ...process.env, BIGPLAYER_H5_FEED_MAX_PAGES: '500', BIGPLAYER_H5_FEED_NO_NEW_PAGE_BUDGET: '10000' }, { credentialContext });
    connector.feedMaxPages = 500; connector.feedNoNewPageBudget = 10000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 240000);
    try { report = await recoverDomesticToday({ repo: domesticRepository(repo), connector, source, account, plan, signal: controller.signal,
      onPhase: value => { phase = value; } }); }
    finally { clearTimeout(timer); }
  } catch (error) { report = { status: 'FAILED_TODAY', phase, errorCode: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'DOMESTIC_EXECUTION_FAILED' }; }
  finally { await repo.pool.end(); }
  fs.writeFileSync(plan.output, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(report));
  if (report.status === 'FAILED_TODAY') process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.code || 'DOMESTIC_FAILED'); process.exitCode = 1; });
module.exports = { main, inventory };
