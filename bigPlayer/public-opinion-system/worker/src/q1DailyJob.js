const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { Q1AnalysisRunner } = require('./q1DailyAnalysisRunner');
const { previousBeijingDay, beijingDayWindow } = require('./businessDay');
const { loadRuntimeEnv } = require('../../server/src/runtimeEnv');
const { schedulerMode, requireExplicitSchedulerMode } = require('./schedulerMode');
const UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS = 'UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS';

function legacyScheduledGate({ mode = process.env.UNIFIED_SOURCE_SCHEDULER_MODE, triggerType = 'scheduled' } = {}) {
  if (triggerType !== 'scheduled' || schedulerMode({ UNIFIED_SOURCE_SCHEDULER_MODE: mode }) !== 'enabled') return null;
  return { status: 'skipped', reasonCode: UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS };
}
const { Repository } = require('../../server/src/db/repository');
const { BigPlayerH5Connector, parseSourceConfig } = require('../../server/src/connectors/bigPlayerH5Connector');
const { CredentialContext } = require('../../server/src/services/credentialContext');
const { LoginSessionClient } = require('../../server/src/services/loginSessionClient');
const { AuthRefreshCoordinator } = require('../../server/src/services/authRefreshCoordinator');
const { AiAnalyzer } = require('../../server/src/integrations/aiAnalyzer');

function yesterdayWindow(now = new Date()) {
  const value = previousBeijingDay(now);
  return { publishedFrom: value.publishedFrom, publishedTo: value.publishedTo, publishedFromIso: value.publishedFromIso, publishedToIso: value.publishedToIso, businessDate: value.businessDate };
}
async function importedContentSummary(outDir) {
  try { return JSON.parse(await fs.readFile(path.join(outDir, 'summary.json'), 'utf8')); } catch (_) { return {}; }
}
function sanitizeMessage(value) {
  let message = String(value || '');
  const sensitiveKey = '(?:authorization|cookie|token|password|secret|api[-_ ]?key|apikey)';
  const quotedValue = "(?:\\\\.|[^\\\"'])*";
  const unquotedValue = '[^\\s,;}&]+';
  message = message
    .replace(new RegExp(`([\\\"']?${sensitiveKey}[\\\"']?\\s*[:=]\\s*)[\\\"']${quotedValue}[\\\"']`, 'gi'), '$1[redacted]')
    .replace(new RegExp(`([\\\"']?${sensitiveKey}[\\\"']?\\s*[:=]\\s*)${unquotedValue}`, 'gi'), '$1[redacted]')
    .replace(/([?&](?:authorization|cookie|token|password|secret|api[-_ ]?key|apikey)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/Bearer\s+[^\s,;}]+/gi, 'Bearer [redacted]')
    .replace(/(?:credential-value-\d+)/gi, '[redacted]')
    .replace(/\b[A-Za-z0-9_-]*token-secret\b/gi, '[redacted]');
  return message.slice(0, 500);
}

function safeLog(log = console.log) {
  return value => log(sanitizeMessage(value));
}
function errorCode(error) { return error?.code || error?.cause?.code || error?.details?.cause || 'Q1_DAILY_FAILED'; }
const AUTH_FAILURE_CODES = new Set(['UNAUTHORIZED', 'PERMISSION_DENIED']);
const MANUAL_VERIFICATION_CODES = new Set([
  'MANUAL_VERIFICATION_REQUIRED', 'AUTH_REFRESH_CHALLENGE_REQUIRED', 'LOGIN_CHALLENGE_REQUIRED',
  'SMS_VERIFICATION_REQUIRED', 'IMAGE_VERIFICATION_REQUIRED', 'CAPTCHA_REQUIRED',
  'QR_CODE_REQUIRED', 'DEVICE_CONFIRMATION_REQUIRED', 'CHALLENGE_REQUIRED'
]);
function normalizedReasonCode(reason) {
  const value = String(reason || '').trim();
  if (MANUAL_VERIFICATION_CODES.has(value) || value === 'awaiting_manual_verification' || value === 'manual_verification' || /(?:VERIFICATION|CAPTCHA|CHALLENGE|QR_CODE|DEVICE_CONFIRMATION).*REQUIRED/i.test(value)) return 'AUTH_REFRESH_CHALLENGE_REQUIRED';
  if (AUTH_FAILURE_CODES.has(value)) return value;
  return 'UNAUTHORIZED';
}
function isAuthFailure(error) {
  if (error?.details?.normalizedReason) return false;
  return AUTH_FAILURE_CODES.has(errorCode(error));
}
function isManualVerification(error) { return MANUAL_VERIFICATION_CODES.has(errorCode(error)) || ['awaiting_manual_verification', 'manual_verification'].includes(String(error?.status || error?.code || '')) || errorCode(error) === 'AUTH_REFRESH_CHALLENGE_REQUIRED'; }
function preflightError(code, message, details = {}) { const error = new Error(message); error.code = code; error.details = details; return error; }
function normalizeAuthRefreshFailure(error) {
  if (error?.code !== 'AUTH_REFRESH_CREDENTIAL_NOT_CONFIGURED') return error;
  return preflightError('UNAUTHORIZED', 'Q1 API token was rejected; reauthorization is required', { cause: error.code });
}
async function defaultQ1Preflight({ source, account, connector, credentialContext, ai, probe = true } = {}) {
  if (!source?.id) throw preflightError('SOURCE_NOT_CONFIGURED', 'Q1 source is required');
  if (!account?.id) throw preflightError('ACCOUNT_NOT_CONFIGURED', 'Q1 account is required');
  if (!connector) throw preflightError('CONNECTOR_NOT_CONFIGURED', 'Q1 connector is required');
  if (!credentialContext) throw preflightError('CREDENTIAL_CONTEXT_REQUIRED', 'Q1 credential context is required');
  if (!ai || typeof ai.configured !== 'function' || !ai.configured('light')) throw preflightError('AI_NOT_CONFIGURED', 'AI light profile is not configured');
  const config = typeof connector.installationHealth === 'function' ? await connector.installationHealth(source) : { installed: true, configured: true };
  if (config.installed === false && config.configured === false) throw preflightError('CONNECTOR_NOT_CONFIGURED', config.reason || 'Q1 connector is not configured');
  if (!probe) return { sourceId: source.id, accountId: account.id, connector: source.platform || null, probed: false };
  const health = await connector.accountHealth({ ...source, account: { ...account }, id: account.id, account_id: account.id, credentialContext });
  if (!health?.configured || health.authorized === false) {
    const code = normalizedReasonCode(health?.code || health?.reason);
    throw preflightError(code, code === 'AUTH_REFRESH_CHALLENGE_REQUIRED' ? 'manual login verification is required' : 'Q1 authorization probe failed', { authorized: false, reason: health?.reason || null, normalizedReason: !health?.code });
  }
  return { sourceId: source.id, accountId: account.id, connector: source.platform || null, probed: true };
}
async function runQ1Preflight(options = {}) {
  const preflight = options.preflight || defaultQ1Preflight;
  const refreshAuth = options.refreshAuth || options.connector?.authRefreshCoordinator?.refresh;
  let retried = false;
  while (true) {
    try { return await preflight(options); }
    catch (error) {
      if (!retried && isAuthFailure(error) && typeof refreshAuth === 'function') {
        retried = true;
        try { await refreshAuth({ source: options.source, account: options.account }); }
        catch (refreshError) { throw normalizeAuthRefreshFailure(refreshError); }
        continue;
      }
      throw error;
    }
  }
}
async function createProductionQ1Preflight(sourceId, env = process.env) {
  loadRuntimeEnv();
  const repo = new Repository();
  const source = (await repo.query('SELECT * FROM po_sources WHERE id=?', [sourceId]))[0] || null;
  if (!source) { const error = new Error('Q1 source not found'); error.code = 'SOURCE_NOT_FOUND'; throw error; }
  const account = typeof repo.getDefaultAccount === 'function' ? await repo.getDefaultAccount({ sourceId }) : null;
  if (!account) { const error = new Error('Q1 account not found'); error.code = 'ACCOUNT_NOT_FOUND'; throw error; }
  const credentialContext = new CredentialContext({ repo, env });
  const loginSessionClient = new LoginSessionClient(env);
  const authRefreshCoordinator = new AuthRefreshCoordinator({ repo, loginSessionClient, env });
  const connector = new BigPlayerH5Connector(env, { credentialContext, authRefreshCoordinator });
  const ai = new AiAnalyzer(env);
  const preflight = async () => defaultQ1Preflight({ source, account, connector, credentialContext, ai });
  const refreshAuth = ({ source: boundSource = source, account: boundAccount = account }) => authRefreshCoordinator.refresh({ source: boundSource, account: boundAccount });
  return { source, account, connector, credentialContext, loginSessionClient, authRefreshCoordinator, ai, preflight, refreshAuth, close: async () => { if (repo.pool?.end) await repo.pool.end(); } };
}

function number(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function importCounts(summary = {}) {
  const collected = summary.collection || summary.collected || {};
  const imported = summary.import || {};
  const eligibleIds = Array.isArray(imported.analysisEligibleIds) ? [...new Set(imported.analysisEligibleIds.map(String))] : [];
  const uniquePosts = number(collected.uniquePosts ?? collected.posts ?? summary.uniquePosts ?? summary.posts ?? imported.posts);
  const rawPosts = number(collected.rawPosts ?? summary.rawPosts ?? uniquePosts);
  const comments = number(collected.comments ?? summary.comments ?? imported.comments);
  const replies = number(collected.replies ?? summary.replies ?? imported.replies);
  const databaseTotal = number(imported.items ?? imported.total ?? summary.databaseTotal);
  return {
    rawPosts,
    uniquePosts,
    posts: uniquePosts,
    comments,
    replies,
    commentsReplies: comments + replies,
    databaseTotal,
    inserted: number(imported.inserted),
    changed: number(imported.changed),
    unchanged: number(imported.unchanged),
    failedBatches: number(imported.failedBatches),
    failedItems: number(imported.failedItems),
    analysisEligibleTotal: eligibleIds.length
  };
}
function analysisCounts(contentTotal, analysis = {}) {
  const light = (analysis.passes || []).find(pass => pass.profile === 'light')?.counts || {};
  const deep = (analysis.passes || []).find(pass => pass.profile === 'deep')?.counts || {};
  const total = number(analysis.total || contentTotal);
  const completed = number(analysis.completed ?? analysis.analyzed ?? light.completed);
  const failed = number(analysis.failed ?? number(light.failed) + number(deep.failed));
  const pending = number(analysis.pending ?? light.pending);
  const running = number(analysis.running ?? light.running);
  const retryable = number(analysis.retryable ?? light.retryable);
  return { total, completed, pending, running, retryable, failed, complete: total > 0 && completed >= total && pending === 0 && running === 0 && retryable === 0 && failed === 0 };
}
function normalizeAuditScope(scope = {}) {
  return {
    regionCode: scope.regionCode || scope.region_code || null,
    externalCommunity: scope.externalCommunity || scope.external_community || null,
    internalGameId: scope.gameId || scope.game_id || null,
    internalCommunityId: scope.communityId || scope.community_id || null
  };
}
function buildDailyReport({ sourceId, window, summary = {}, analysis = null, phase = null, error = null, skipped = false, scope = {} } = {}) {
  const counts = importCounts(summary);
  const contentTotal = counts.analysisEligibleTotal || number(summary.contents?.total || summary.contents?.posts + summary.contents?.comments);
  const analysisSummary = analysisCounts(contentTotal, analysis || summary.analysis || {});
  const status = skipped ? 'skipped_duplicate' : isManualVerification(error) ? 'awaiting_manual_verification' : error ? 'failed' : (summary.status === 'collection_partial' || summary.completeness?.complete === false) ? 'incomplete' : summary.status === 'import_partial' ? (analysisSummary.complete ? 'completed_partial' : 'incomplete') : analysisSummary.complete ? 'completed' : 'incomplete';
  return {
    sourceId: sourceId || null,
    ...normalizeAuditScope(scope),
    businessDate: window?.businessDate || summary.window || null,
    publishedFrom: window?.publishedFrom || summary.publishedFrom || null,
    publishedTo: window?.publishedTo || summary.publishedTo || null,
    posts: counts.posts,
    rawPosts: counts.rawPosts,
    uniquePosts: counts.uniquePosts,
    commentsReplies: counts.commentsReplies,
    comments: counts.comments,
    replies: counts.replies,
    databaseTotal: counts.databaseTotal,
    inserted: counts.inserted,
    changed: counts.changed,
    unchanged: counts.unchanged,
    failedBatches: counts.failedBatches,
    failedItems: counts.failedItems,
    analysisEligibleTotal: counts.analysisEligibleTotal,
    analysisTotal: analysisSummary.total,
    analysisCompleted: analysisSummary.completed,
    analysisPending: analysisSummary.pending,
    analysisRunning: analysisSummary.running,
    analysisRetryable: analysisSummary.retryable,
    analysisFailed: analysisSummary.failed,
    complete: analysisSummary.complete,
    status,
    ...(phase ? { failurePhase: phase } : {}),
    ...(error ? { errorCode: error.code || 'Q1_DAILY_FAILED', error: sanitizeMessage(error.message) } : {})
  };
}
function phaseCounts(summary = {}, analysis = null) {
  const counts = importCounts(summary);
  if (analysis) {
    const result = analysisCounts(counts.analysisEligibleTotal || number(summary.contents?.total), analysis);
    return { ...counts, analysisTotal: result.total, analysisCompleted: result.completed, analysisPending: result.pending, analysisRunning: result.running, analysisRetryable: result.retryable, analysisFailed: result.failed };
  }
  return counts;
}
function phaseLog(log, phase, status, summary, analysis, extra = {}) {
  safeLog(log)(JSON.stringify({ task: 'q1-daily', phase, status, counts: phaseCounts(summary, analysis), ...extra }));
}

async function readJsonFile(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) { return null; }
}
async function writeReport(outDir, report) {
  await fs.mkdir(outDir, { recursive: true });
  const target = path.join(outDir, 'daily-report.json');
  const existing = await readJsonFile(target);
  if (report.status === 'failed' && existing?.status === 'completed' && existing.complete === true) return report;
  const temp = path.join(outDir, `.daily-report.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  try {
    await fs.writeFile(temp, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
  return report;
}
async function acquireDailyLock(sourceId, businessDate, lockDir = path.resolve(process.cwd(), '.temp', 'q1-daily-locks')) {
  await fs.mkdir(lockDir, { recursive: true });
  const file = path.join(lockDir, `${String(sourceId).replace(/[^a-zA-Z0-9_-]/g, '_')}-${businessDate}.lock`);
  try {
    const handle = await fs.open(file, 'wx');
    await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    return { file, release: async () => { await handle.close(); await fs.rm(file, { force: true }); } };
  } catch (error) {
    if (error.code === 'EEXIST') return null;
    throw error;
  }
}
async function persistBatchMetadata(outDir, sourceId, window, contentIds, analysis) {
  const summary = await importedContentSummary(outDir);
  const next = { ...summary, sourceId, publishedFrom: window.publishedFrom, publishedTo: window.publishedTo, window: window.businessDate, analysis: { ...(summary.analysis || {}), ...(analysis || {}) }, updatedAt: new Date().toISOString() };
  await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(next, null, 2), 'utf8');
  return next;
}
function runCrawler({ script = path.resolve(__dirname, '../../scripts/q1_crawler.py'), python = process.env.PYTHON || 'python', args = [], log = console.log } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const output = [];
    const capture = chunk => { const text = String(chunk); output.push(...text.split(/\r?\n/).filter(Boolean)); };
    child.stdout.on('data', capture); child.stderr.on('data', chunk => { for (const line of String(chunk).split(/\r?\n/).filter(Boolean)) log(safeLog(log)(line)); });
    child.on('error', reject); child.on('close', code => {
      if (code === 0) { for (const line of output) log(sanitizeMessage(line)); resolve(); return; }
      let structured = null;
      for (const line of output) { try { const parsed = JSON.parse(line); if (parsed && typeof parsed === 'object' && parsed.errorCode) structured = parsed; } catch (_) {} }
      const error = new Error(sanitizeMessage(structured?.message || structured?.reason || `Q1 crawler exited with ${code}`));
      error.code = structured?.errorCode || 'Q1_CRAWLER_FAILED';
      error.details = structured?.details || {};
      error.failurePhase = structured?.failurePhase || 'collection';
      error.exitCode = code;
      reject(error);
    });
  });
}
async function runQ1Daily(options = {}) {
  const {
    sourceId,
    outDir,
    python,
    crawlerArgs = [],
    now = new Date(),
    businessDate,
    scope = {},
    runnerOptions = {},
    log = console.log,
    crawler = runCrawler,
    analysisRunner = Q1AnalysisRunner,
    triggerType = 'scheduled',
    unifiedSchedulerMode = process.env.UNIFIED_SOURCE_SCHEDULER_MODE
  } = options;
  const gate = legacyScheduledGate({ mode: unifiedSchedulerMode, triggerType });
  if (gate) return gate;
  if (!sourceId) throw new Error('sourceId is required');
  const window = businessDate ? beijingDayWindow(businessDate) : yesterdayWindow(now);
  const lock = await acquireDailyLock(sourceId, window.businessDate, runnerOptions.lockDir);
  if (!lock) {
    const report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary: await importedContentSummary(outDir), skipped: true, scope }));
    return { businessDate: window.businessDate, outDir, skipped: true, duplicate: true, report };
  }
  let production = null;
  let summary = await importedContentSummary(outDir);
  phaseLog(log, 'target', 'running', summary, null, { sourceId, businessDate: window.businessDate });
  try {
    phaseLog(log, 'target', 'completed', summary, null, { sourceId, businessDate: window.businessDate });
    if (summary.window === window.businessDate && ['collection_completed', 'analysis_completed', 'completed', 'running', 'analysis_running'].includes(summary.status)) {
      const report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary, analysis: summary.analysis, skipped: true, scope }));
      return { businessDate: window.businessDate, outDir, skipped: true, report };
    }
    try {
      phaseLog(log, 'preflight', 'running', summary, null, { sourceId, businessDate: window.businessDate });
      production = typeof runnerOptions.productionFactory === 'function'
        ? await runnerOptions.productionFactory(sourceId)
        : await createProductionQ1Preflight(sourceId);
      await runQ1Preflight({ ...production, ...runnerOptions, source: runnerOptions.source || production.source, account: runnerOptions.account || production.account, connector: runnerOptions.connector || production.connector, ai: runnerOptions.ai || production.ai, credentialContext: runnerOptions.credentialContext || production.credentialContext, preflight: runnerOptions.preflight || production.preflight, refreshAuth: runnerOptions.refreshAuth || production.refreshAuth });
      phaseLog(log, 'preflight', 'completed', summary, null, { sourceId, businessDate: window.businessDate });
    } catch (error) {
      phaseLog(log, 'preflight', 'failed', summary, null, { sourceId, businessDate: window.businessDate, errorCode: errorCode(error) });
      const report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary, phase: 'preflight', error, scope }));
      throw Object.assign(error, { report });
    }
    try {
      phaseLog(log, 'fetch', 'running', summary, null, { sourceId, businessDate: window.businessDate });
      await crawler({ python, args: ['--source-id', sourceId, '--since', window.publishedFromIso, '--until', window.publishedToIso, '--out', outDir, '--import-to-server', ...crawlerArgs], log: safeLog(log) });
      summary = await importedContentSummary(outDir);
      phaseLog(log, 'fetch', 'completed', summary, null, { sourceId, businessDate: window.businessDate });
      phaseLog(log, 'import', 'completed', summary, null, { sourceId, businessDate: window.businessDate });
    } catch (error) {
      phaseLog(log, 'fetch', 'failed', summary, null, { sourceId, businessDate: window.businessDate, errorCode: errorCode(error) });
      phaseLog(log, 'import', 'failed', summary, null, { sourceId, businessDate: window.businessDate, errorCode: errorCode(error) });
      const report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary, phase: error.failurePhase || 'collection', error, scope }));
      throw Object.assign(error, { report });
    }
    const incompleteFeeds = Array.isArray(summary.incompleteFeeds) ? summary.incompleteFeeds : (Array.isArray(summary.truncatedFeeds) ? summary.truncatedFeeds : []);
    const status = String(summary.status || '').toLowerCase();
    const importPartial = status === 'import_partial';
    // import_partial：部分导入批次失败但已有内容入库，继续分析已导入内容；
    // collection_partial / truncatedFeeds 非空 / 显式 incomplete 才阻断。
    if (status === 'collection_partial' || (incompleteFeeds.length > 0 && !importPartial) || summary.completeness?.complete === false) {
      const error = preflightError('Q1_COLLECTION_INCOMPLETE', 'Q1 collection did not cover the complete business window', { incompleteFeeds: incompleteFeeds.length });
      phaseLog(log, 'completion', 'failed', summary, null, { sourceId, businessDate: window.businessDate, errorCode: error.code });
      const report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary, phase: 'collection', error, scope }));
      throw Object.assign(error, { report });
    }
    const contentIds = [...new Set(summary?.import?.analysisEligibleIds || [])];
    await persistBatchMetadata(outDir, sourceId, window, contentIds, { status: 'running', submitted: contentIds.length });
    let report;
    phaseLog(log, 'analysis', 'running', summary, null, { sourceId, businessDate: window.businessDate });
    try {
      const analysis = await new analysisRunner({ sourceId, contentIds, ...window, scope, log: safeLog(log), ...runnerOptions, manualClaim: triggerType === 'manual' }).run();
      summary = await persistBatchMetadata(outDir, sourceId, window, contentIds, analysis);
      phaseLog(log, 'analysis', 'completed', summary, analysis, { sourceId, businessDate: window.businessDate });
      report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary, analysis, scope }));
      phaseLog(log, 'completion', report.complete === true && ['completed', 'completed_partial'].includes(report.status) ? 'completed' : 'failed', summary, analysis, { sourceId, businessDate: window.businessDate, proof: report.complete === true });
    } catch (error) {
      summary = await importedContentSummary(outDir);
      phaseLog(log, 'analysis', 'failed', summary, summary.analysis, { sourceId, businessDate: window.businessDate, errorCode: errorCode(error) });
      phaseLog(log, 'completion', 'failed', summary, summary.analysis, { sourceId, businessDate: window.businessDate, errorCode: errorCode(error) });
      report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary, analysis: summary.analysis, phase: 'analysis', error, scope }));
      throw Object.assign(error, { report });
    }
    return { businessDate: window.businessDate, outDir, analysis: summary.analysis, report };
  } finally {
    await lock.release();
    if (production?.close) await production.close();
  }
}
function resolveDefaultOutDir(now = new Date()) {
  const businessDate = yesterdayWindow(now).businessDate;
  return process.env.Q1_DAILY_OUT_DIR || path.resolve(__dirname, '..', '..', '.temp', `q1-daily-${businessDate}`);
}

function isDryRun() {
  return process.argv.includes('--dry-run') || process.env.Q1_DAILY_DRY_RUN === '1';
}

function printDryRun() {
  const sourceId = process.env.Q1_SOURCE_ID;
  if (!sourceId) {
    console.error('Q1_SOURCE_ID is required');
    process.exitCode = 2;
    return;
  }
  console.log(JSON.stringify({
    dryRun: true,
    sourceId,
    cwd: process.cwd(),
    entrypoint: __filename,
    outDir: resolveDefaultOutDir()
  }));
}

async function main() {
  try {
    loadRuntimeEnv();
    const mode = requireExplicitSchedulerMode(process.env);
    const gate = legacyScheduledGate({ mode });
    if (gate) {
      console.log(JSON.stringify(gate));
      return;
    }
    if (isDryRun()) {
      printDryRun();
      return;
    }
    const sourceId = process.env.Q1_SOURCE_ID;
    const now = new Date();
    const outDir = resolveDefaultOutDir(now);
    const result = await runQ1Daily({ sourceId, outDir });
    console.log(JSON.stringify(result.report || result));
  } catch (error) {
    if (error?.code === 'UNIFIED_SCHEDULER_MODE_UNSET' || error?.code === 'UNIFIED_SCHEDULER_MODE_INVALID') {
      console.error(JSON.stringify({ status: 'failed', code: error.code, message: error.message }));
    } else {
      console.error(`[q1-daily] ${sanitizeMessage(error.message)}`);
      if (error.report) console.error(JSON.stringify(error.report));
    }
    process.exitCode = 1;
  }
}

if (require.main === module) main();
module.exports = { yesterdayWindow, runCrawler, runQ1Daily, runQ1Preflight, defaultQ1Preflight, createProductionQ1Preflight, sanitizeMessage, buildDailyReport, normalizeAuditScope, analysisCounts, resolveDefaultOutDir, beijingDayWindow, writeReport, legacyScheduledGate };
