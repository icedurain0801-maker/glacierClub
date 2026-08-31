const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { Q1AnalysisRunner } = require('./q1DailyAnalysisRunner');
const { previousBeijingDay } = require('./businessDay');
const { loadRuntimeEnv } = require('../../server/src/runtimeEnv');
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
    .replace(/Bearer\s+[^\s,;}]+/gi, 'Bearer [redacted]');
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
        await refreshAuth({ source: options.source, account: options.account });
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
  return {
    posts: number(collected.posts ?? summary.posts ?? imported.posts),
    comments: number(collected.comments ?? summary.comments ?? imported.comments) + number(collected.replies ?? summary.replies ?? imported.replies),
    inserted: number(imported.inserted),
    changed: number(imported.changed)
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
function buildDailyReport({ sourceId, window, summary = {}, analysis = null, phase = null, error = null, skipped = false } = {}) {
  const counts = importCounts(summary);
  const contentTotal = number(summary.import?.analysisEligibleIds?.length || summary.contents?.total || summary.contents?.posts + summary.contents?.comments);
  const analysisSummary = analysisCounts(contentTotal, analysis || summary.analysis || {});
  const status = skipped ? 'skipped_duplicate' : isManualVerification(error) ? 'awaiting_manual_verification' : error ? 'failed' : (summary.status === 'collection_partial' || summary.completeness?.complete === false) ? 'incomplete' : summary.status === 'import_partial' ? (analysisSummary.complete ? 'completed_partial' : 'incomplete') : analysisSummary.complete ? 'completed' : 'incomplete';
  return {
    sourceId: sourceId || null,
    businessDate: window?.businessDate || summary.window || null,
    publishedFrom: window?.publishedFrom || summary.publishedFrom || null,
    publishedTo: window?.publishedTo || summary.publishedTo || null,
    posts: counts.posts,
    commentsReplies: counts.comments,
    inserted: counts.inserted,
    changed: counts.changed,
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
async function writeReport(outDir, report) {
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'daily-report.json'), JSON.stringify(report, null, 2), 'utf8');
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
async function runQ1Daily({ sourceId, outDir, python, crawlerArgs = [], now = new Date(), runnerOptions = {}, log = console.log, crawler = runCrawler, analysisRunner = Q1AnalysisRunner } = {}) {
  if (!sourceId) throw new Error('sourceId is required');
  const window = yesterdayWindow(now);
  const lock = await acquireDailyLock(sourceId, window.businessDate, runnerOptions.lockDir);
  if (!lock) {
    const report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary: await importedContentSummary(outDir), skipped: true }));
    return { businessDate: window.businessDate, outDir, skipped: true, duplicate: true, report };
  }
  let production = null;
  try {
    let summary = await importedContentSummary(outDir);
    if (summary.window === window.businessDate && ['collection_completed', 'analysis_completed', 'completed', 'running', 'analysis_running'].includes(summary.status)) {
      const report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary, analysis: summary.analysis, skipped: true }));
      return { businessDate: window.businessDate, outDir, skipped: true, report };
    }
    try {
      production = typeof runnerOptions.productionFactory === 'function'
        ? await runnerOptions.productionFactory(sourceId)
        : await createProductionQ1Preflight(sourceId);
      await runQ1Preflight({ ...production, ...runnerOptions, source: runnerOptions.source || production.source, account: runnerOptions.account || production.account, connector: runnerOptions.connector || production.connector, ai: runnerOptions.ai || production.ai, credentialContext: runnerOptions.credentialContext || production.credentialContext, preflight: runnerOptions.preflight || production.preflight, refreshAuth: runnerOptions.refreshAuth || production.refreshAuth });
    } catch (error) {
      const report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary, phase: 'preflight', error }));
      throw Object.assign(error, { report });
    }
    try {
      await crawler({ python, args: ['--source-id', sourceId, '--since', window.publishedFromIso, '--until', window.publishedToIso, '--out', outDir, '--import-to-server', ...crawlerArgs], log: safeLog(log) });
      summary = await importedContentSummary(outDir);
    } catch (error) {
      const report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary, phase: error.failurePhase || 'collection', error }));
      throw Object.assign(error, { report });
    }
    const incompleteFeeds = Array.isArray(summary.incompleteFeeds) ? summary.incompleteFeeds : (Array.isArray(summary.truncatedFeeds) ? summary.truncatedFeeds : []);
    const status = String(summary.status || '').toLowerCase();
    const importPartial = status === 'import_partial';
    // import_partial：部分导入批次失败但已有内容入库，继续分析已导入内容；
    // collection_partial / truncatedFeeds 非空 / 显式 incomplete 才阻断。
    if (status === 'collection_partial' || (incompleteFeeds.length > 0 && !importPartial) || summary.completeness?.complete === false) {
      const error = preflightError('Q1_COLLECTION_INCOMPLETE', 'Q1 collection did not cover the complete business window', { incompleteFeeds: incompleteFeeds.length });
      const report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary, phase: 'collection', error }));
      throw Object.assign(error, { report });
    }
    const contentIds = [...new Set(summary?.import?.analysisEligibleIds || [])];
    await persistBatchMetadata(outDir, sourceId, window, contentIds, { status: 'running', submitted: contentIds.length });
    let report;
    try {
      const analysis = await new analysisRunner({ sourceId, contentIds, ...window, log: safeLog(log), ...runnerOptions }).run();
      summary = await persistBatchMetadata(outDir, sourceId, window, contentIds, analysis);
      report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary, analysis }));
    } catch (error) {
      summary = await importedContentSummary(outDir);
      report = await writeReport(outDir, buildDailyReport({ sourceId, window, summary, analysis: summary.analysis, phase: 'analysis', error }));
      throw Object.assign(error, { report });
    }
    return { businessDate: window.businessDate, outDir, analysis: summary.analysis, report };
  } finally {
    await lock.release();
    if (production?.close) await production.close();
  }
}
if (require.main === module) {
  const sourceId = process.env.Q1_SOURCE_ID;
  const now = new Date();
  const businessDate = yesterdayWindow(now).businessDate;
  const outDir = process.env.Q1_DAILY_OUT_DIR || path.resolve(process.cwd(), '.temp', `q1-daily-${businessDate}`);
  runQ1Daily({ sourceId, outDir }).then(result => console.log(JSON.stringify(result.report || result))).catch(error => { console.error(`[q1-daily] ${sanitizeMessage(error.message)}`); if (error.report) console.error(JSON.stringify(error.report)); process.exitCode = 1; });
}
module.exports = { yesterdayWindow, runCrawler, runQ1Daily, runQ1Preflight, defaultQ1Preflight, createProductionQ1Preflight, sanitizeMessage, buildDailyReport, analysisCounts };
