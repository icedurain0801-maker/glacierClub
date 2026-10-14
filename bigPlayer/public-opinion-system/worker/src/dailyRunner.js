const { previousBeijingDay } = require('./businessDay');
const { schedulerMode, requireExplicitSchedulerMode } = require('./schedulerMode');
const {
  buildDeps,
  checkAuthorization,
  isManualVerification,
  processPersistentAnalysisJobs,
  profileSpec,
  runBounded,
  runSource
} = require('./worker');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const ACTIVE_STATUSES = ['pending', 'running', 'retryable'];
const SUCCESS_SYNC_STATUSES = new Set(['completed', 'completed_full', 'completed_authorized_scope']);
const DEFAULT_DAILY_TIMEOUT_MS = 60 * 60 * 1000;
const DAILY_PROGRESS_CHECK_INTERVAL_MS = 60 * 1000;
const DAILY_STALL_THRESHOLD_MS = 15 * 60 * 1000;
const DAILY_PHASES = new Set(['preflight', 'collecting', 'draining_commits', 'draining_analysis', 'completed']);
const COUNT_FIELDS = ['ready', 'skipped', 'total', 'active', 'pending', 'running', 'retryable', 'completed', 'failed', 'discovered', 'stored', 'fetched', 'inserted', 'changed', 'comments', 'analyzed', 'alerted'];
const UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS = 'UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS';

function legacyScheduledGate({ mode = process.env.UNIFIED_SOURCE_SCHEDULER_MODE, triggerType = 'scheduled' } = {}) {
  if (triggerType !== 'scheduled' || schedulerMode({ UNIFIED_SOURCE_SCHEDULER_MODE: mode }) !== 'enabled') return null;
  return { status: 'skipped', reasonCode: UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS };
}

const ACTIVE_DAILY_ANALYSIS_SCOPES = new Set();
const CLAIM_LOCK_RETRY_MAX_ATTEMPTS = 3;
const CLAIM_LOCK_RETRY_BASE_MS = 100;

function analysisScopeKey(window) {
  return `${new Date(window.publishedFrom).toISOString()}:${new Date(window.publishedTo).toISOString()}`;
}

function isDailyAnalysisScopeActive(scope = {}) {
  if (!scope.publishedFrom || !scope.publishedTo) return false;
  return ACTIVE_DAILY_ANALYSIS_SCOPES.has(analysisScopeKey(scope));
}

function registerDailyAnalysisScope(window) {
  const key = analysisScopeKey(window);
  ACTIVE_DAILY_ANALYSIS_SCOPES.add(key);
  return () => ACTIVE_DAILY_ANALYSIS_SCOPES.delete(key);
}

function isClaimLockError(error) {
  return ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'LOCK_DEADLOCK', 'LOCK_TIMEOUT'].includes(error?.code || error?.cause?.code);
}

function stableClaimLockError(error) {
  const wrapped = new Error('analysis job claim could not obtain a database lock');
  wrapped.code = 'ANALYSIS_CLAIM_LOCK_CONFLICT';
  wrapped.cause = error;
  return wrapped;
}

function clockNow(deps) { return typeof deps?.clock === 'function' ? deps.clock() : Date.now(); }
function sanitizeCounts(counts = {}) {
  return Object.fromEntries(COUNT_FIELDS.filter(key => Number.isFinite(Number(counts[key]))).map(key => [key, Number(counts[key])]));
}
function emitProgress(deps, event) {
  if (!DAILY_PHASES.has(event.phase)) return;
  const now = clockNow(deps);
  const payload = {
    status: 'daily_progress',
    phase: event.phase,
    businessDate: deps.businessDate,
    elapsedMs: Math.max(0, now - Number(deps.dailyStartedAt || now)),
    remainingMs: deps.deadlineAt == null ? null : Math.max(0, Number(deps.deadlineAt) - now)
  };
  if (event.code) payload.code = String(event.code);
  if (event.collectionStatus) payload.collectionStatus = String(event.collectionStatus);
  if (event.sources) payload.sources = event.sources.map(item => ({ sourceId: item.sourceId, status: item.status, ...sanitizeCounts(item) }));
  if (event.sourceCounts) payload.sourceCounts = sanitizeCounts(event.sourceCounts);
  if (event.taskCounts) payload.taskCounts = sanitizeCounts(event.taskCounts);
  if (event.jobCounts) payload.jobCounts = sanitizeCounts(event.jobCounts);
  const serialized = JSON.stringify(payload);
  if (typeof deps?.emitter === 'function') deps.emitter(serialized);
  else console.log(serialized);
}

function deadlineError() {
  const error = new Error('daily run timed out before all bounded work completed');
  error.code = 'DAILY_RUN_TIMEOUT';
  return error;
}

function assertDeadline(deps) {
  if (deps?.deadlineAt != null && clockNow(deps) >= deps.deadlineAt) throw deadlineError();
}

function activeCount(counts = {}) {
  return ACTIVE_STATUSES.reduce((sum, status) => sum + Number(counts[status] || 0), 0);
}

async function enqueueWindow(deps, window) {
  const spec = profileSpec(deps.ai, 'light');
  let total = 0;
  const maxBatches = Math.max(1, Number(deps.dailyAnalysisMaxBatches || process.env.DAILY_ANALYSIS_MAX_BATCHES || 20));
  for (let batch = 0; batch < maxBatches; batch += 1) {
    assertDeadline(deps);
    const count = await deps.repo.enqueueMissingAnalysis({
      profile: 'light',
      version: spec.version,
      publishedFrom: window.publishedFrom,
      publishedTo: window.publishedTo,
      limit: 500,
      force: false
    });
    total += count;
    if (count < 500) return total;
  }
  return total;
}

function enqueueOnlyDeps(deps, window) {
  return {
    ...deps,
    repo: new Proxy(deps.repo, {
      get(target, property) {
        if (property === 'claimAnalysisJobs') return async () => [];
        if (property === 'enqueueMissingAnalysis') return input => target.enqueueMissingAnalysis({ ...input, publishedFrom: window.publishedFrom, publishedTo: window.publishedTo, force: false });
        return target[property];
      }
    })
  };
}

async function runAnalysisPump(deps, window, { timeoutMs, idleMs, keepAlive = true, sourceId } = {}) {
  const startedAt = clockNow(deps);
  const configuredTimeout = Number(timeoutMs || process.env.DAILY_ANALYSIS_TIMEOUT_MS || 2 * 60 * 60 * 1000);
  const limitMs = Math.max(1000, Math.min(configuredTimeout, deps.deadlineAt == null ? configuredTimeout : Math.max(1000, deps.deadlineAt - clockNow(deps))));
  const waitMs = Math.max(1, Number(idleMs || process.env.DAILY_ANALYSIS_IDLE_MS || 1000));
  const scope = { publishedFrom: window.publishedFrom, publishedTo: window.publishedTo, ...(sourceId ? { sourceId } : {}) };
  let analyzed = 0; let alerted = 0; let stopClaiming = false; let collectionComplete = !keepAlive; let inFlight = null;
  const stop = () => { stopClaiming = true; };
  const complete = () => { collectionComplete = true; };
  const pumpDeps = {
    ...deps,
    repo: new Proxy(deps.repo, {
      get(target, property) {
        if (property === 'claimAnalysisJobs') return input => stopClaiming ? [] : target.claimAnalysisJobs({ ...input, ...scope });
        if (property === 'enqueueMissingAnalysis') return input => target.enqueueMissingAnalysis({ ...input, ...scope, force: false });
        return target[property];
      }
    })
  };
  const pump = (async () => {
    for (;;) {
      if (stopClaiming) break;
      if (clockNow(deps) - startedAt >= limitMs || (deps.deadlineAt != null && clockNow(deps) >= deps.deadlineAt)) { stopClaiming = true; break; }
      await enqueueWindow(pumpDeps, window);
      const [light, deep] = await Promise.all([
        deps.repo.countAnalysisJobs({ profile: 'light', version: profileSpec(deps.ai, 'light').version, ...scope }),
        deps.repo.countAnalysisJobs({ profile: 'deep', version: profileSpec(deps.ai, 'deep').version, ...scope })
      ]);
      const active = activeCount(light) + activeCount(deep);
      if (!active) {
        if (collectionComplete) break;
        await sleep(waitMs);
        continue;
      }
      try {
        let result;
        for (let attempt = 0; ; attempt += 1) {
          try {
            inFlight = processPersistentAnalysisJobs(pumpDeps, null, [], scope);
            result = await inFlight;
            break;
          } catch (error) {
            if (!isClaimLockError(error) || attempt + 1 >= CLAIM_LOCK_RETRY_MAX_ATTEMPTS) throw (isClaimLockError(error) ? stableClaimLockError(error) : error);
            await sleep(CLAIM_LOCK_RETRY_BASE_MS * 2 ** attempt);
          } finally {
            inFlight = null;
          }
        }
        analyzed += Number(result?.analyzed || 0); alerted += Number(result?.alerted || 0);
        if (!result?.analyzed) await sleep(waitMs);
      } catch (error) {
        if (error.code !== 'ANALYSIS_CLAIM_LOCK_CONFLICT') throw error;
        await sleep(waitMs);
      }
    }
    if (inFlight) await inFlight;
    return { sourceId: sourceId || null, analyzed, alerted, stopped: stopClaiming, completed: collectionComplete && !stopClaiming };
  })();
  pump.catch(() => {});
  return { stop, complete, done: pump };
}

async function analyzeWindow(deps, window, options = {}) {
  assertDeadline(deps);
  const pump = await runAnalysisPump(deps, window, { ...options, keepAlive: false });
  return pump.done;
}

function startProgressWatchdog(deps, sources) {
  let lastProgressAt = clockNow(deps); let previous = ''; let checking = false; let stalled = false;
  const setIntervalFn = deps.setInterval || setInterval; const clearIntervalFn = deps.clearInterval || clearInterval;
  const timer = setIntervalFn(async () => {
    if (checking) return;
    checking = true;
    try {
      const snapshots = [];
      for (const { source } of sources) {
        const run = await deps.repo.getLatestSyncRunForSource(source.id, {});
        snapshots.push({ sourceId: source.id, status: run?.status || 'unknown', discovered: Number(run?.discovered_count || 0), stored: Number(run?.stored_count || 0), fetched: Number(run?.fetched_count || 0), inserted: Number(run?.inserted_count || 0), changed: Number(run?.changed_count || 0), comments: Number(run?.comment_count || 0), updatedAt: run?.updated_at || null });
      }
      const serialized = JSON.stringify(snapshots);
      emitProgress(deps, { phase: 'collecting', sources: snapshots });
      if (serialized !== previous) { previous = serialized; lastProgressAt = clockNow(deps); stalled = false; }
      else if (!stalled && clockNow(deps) - lastProgressAt >= DAILY_STALL_THRESHOLD_MS) {
        stalled = true;
        emitProgress(deps, { phase: 'collecting', code: 'DAILY_NO_PROGRESS', sources: snapshots });
      }
    } catch (error) { emitProgress(deps, { phase: 'collecting', code: 'DAILY_PROGRESS_CHECK_FAILED' }); }
    finally { checking = false; }
  }, DAILY_PROGRESS_CHECK_INTERVAL_MS);
  timer.unref?.();
  return () => clearIntervalFn(timer);
}

async function preflightSources(deps) {
  const sources = await deps.repo.listEnabledSources();
  const ready = [];
  const skipped = [];
  for (const source of sources) {
    const connector = deps.connectors[source.platform];
    if (!connector) {
      skipped.push({ sourceId: source.id, platform: source.platform, status: 'unsupported', reason: 'CONNECTOR_NOT_FOUND' });
      continue;
    }
    const account = await deps.repo.getDefaultAccount({ sourceId: source.id, gameId: source.game_id, platform: source.platform });
    if (!account) {
      skipped.push({ sourceId: source.id, platform: source.platform, status: 'unauthorized', reason: 'ACCOUNT_NOT_FOUND' });
      continue;
    }
    const gate = await checkAuthorization(deps.repo, source, connector, {
      account,
      credentialContext: deps.credentialContext,
      loginSessionClient: deps.loginSessionClient
    });
    if (!gate.authorized) {
      const reason = gate.reason || 'UNAUTHORIZED';
      skipped.push({
        sourceId: source.id,
        platform: source.platform,
        status: isManualVerification({ code: reason }) ? 'awaiting_manual_verification' : 'unauthorized',
        reason
      });
      continue;
    }
    const commentsSupported = typeof connector.hasSourceCapability !== 'function' || connector.hasSourceCapability('comments', source);
    ready.push({ source, commentsSupported });
  }
  return { ready, skipped };
}

async function runDaily(deps, {
  now = new Date(),
  dryRun = false,
  triggerType = 'scheduled',
  unifiedSchedulerMode = process.env.UNIFIED_SOURCE_SCHEDULER_MODE
} = {}) {
  const gate = legacyScheduledGate({ mode: unifiedSchedulerMode, triggerType });
  if (gate) return gate;
  deps = deps || buildDeps();
  const window = previousBeijingDay(now);
  let releaseDailyAnalysisScope = null;
  const lockName = `po-daily-${window.businessDate}`;
  let locked = false;
  let analysisLocked = false;
  try {
    await deps.repo.health();
    if (!deps.ai?.configured?.('light')) {
      const error = new Error('AI light analysis is not configured');
      error.code = 'AI_ANALYSIS_NOT_CONFIGURED';
      throw error;
    }
    locked = await deps.repo.acquireAdvisoryLock(lockName, 0);
    if (!locked) {
      const error = new Error(`daily run for ${window.businessDate} is already active`);
      error.code = 'DAILY_RUN_ALREADY_ACTIVE';
      throw error;
    }

    const preflight = await preflightSources(deps);
    const summary = {
      businessDate: window.businessDate,
      timezone: window.timezone,
      publishedFrom: window.publishedFromIso,
      publishedTo: window.publishedToIso,
      readySources: preflight.ready.length,
      skippedSources: preflight.skipped
    };
    if (dryRun) return { ...summary, dryRun: true };

    analysisLocked = await deps.repo.acquireAdvisoryLock('po-analysis-consumer', 60);
    if (!analysisLocked) throw Object.assign(new Error('analysis consumer is active'), { code: 'ANALYSIS_SCOPE_BUSY' });

    const dailyStartedAt = clockNow(deps);
    releaseDailyAnalysisScope = registerDailyAnalysisScope(window);
    const scopedDeps = {
      ...deps,
      businessDate: window.businessDate,
      dailyStartedAt,
      analysisScope: { publishedFrom: window.publishedFrom, publishedTo: window.publishedTo },
      collectionWindow: { publishedFrom: window.publishedFrom, publishedTo: window.publishedTo, dailyBounded: true },
      refreshAllComments: false,
      deadlineAt: dailyStartedAt + Math.max(1000, Number(process.env.DAILY_RUN_TIMEOUT_MS || DEFAULT_DAILY_TIMEOUT_MS)),
      commentParentLimit: Number(process.env.DAILY_COMMENT_PARENT_LIMIT || 100),
      commentPageBudget: Number(process.env.DAILY_COMMENT_PAGE_BUDGET || 5),
      dailyAnalysisMaxBatches: Number(process.env.DAILY_ANALYSIS_MAX_BATCHES || 20)
    };
    emitProgress(scopedDeps, { phase: 'preflight', sourceCounts: { ready: preflight.ready.length, skipped: preflight.skipped.length, total: preflight.ready.length + preflight.skipped.length } });
    const awaitingVerification = preflight.skipped.filter(item => item.status === 'awaiting_manual_verification');
    if (awaitingVerification.length) {
      const collectionStatus = 'awaiting_manual_verification';
      emitProgress(scopedDeps, { phase: 'completed', collectionStatus, sourceCounts: { ready: preflight.ready.length, skipped: preflight.skipped.length, total: preflight.ready.length + preflight.skipped.length } });
      return {
        ...summary,
        dryRun: false,
        collectionStatus,
        sources: [],
        incompleteSources: awaitingVerification,
        contents: null,
        analysis: { analyzed: 0, alerted: 0, stopped: true, completed: false, skipped: true }
      };
    }
    const pumps = new Map(preflight.ready.map(({ source }) => [source.id, null]));
    for (const { source } of preflight.ready) pumps.set(source.id, await runAnalysisPump(scopedDeps, window, { keepAlive: true, sourceId: source.id }));
    const collectionDeps = enqueueOnlyDeps(scopedDeps, window);
    const stopProgressWatchdog = startProgressWatchdog(scopedDeps, preflight.ready);
    const collectionErrors = [];
    try {
      emitProgress(scopedDeps, { phase: 'collecting', sourceCounts: { ready: preflight.ready.length, skipped: preflight.skipped.length } });
      await runBounded(preflight.ready, deps.sourceConcurrency || 1, async ({ source }) => {
        try {
          await runSource(collectionDeps, source);
        } catch (error) {
          collectionErrors.push({ sourceId: source.id, error });
          pumps.get(source.id)?.stop();
          emitProgress(scopedDeps, { phase: 'collecting', code: error.code || 'COLLECTION_FAILED', sources: [{ sourceId: source.id, status: 'failed' }] });
        }
      });
    } finally {
      stopProgressWatchdog();
    }

    emitProgress(scopedDeps, { phase: 'draining_commits' });
    const latestRuns = [];
    for (const { source, commentsSupported } of preflight.ready) {
      const run = await deps.repo.getLatestSyncRunForSource(source.id, {});
      latestRuns.push({ sourceId: source.id, platform: source.platform, commentsSupported, status: run?.status || 'unknown', errorCode: run?.error_code || null, discovered: Number(run?.discovered_count || 0), stored: Number(run?.stored_count || 0), fetched: Number(run?.fetched_count || 0), inserted: Number(run?.inserted_count || 0), changed: Number(run?.changed_count || 0), comments: Number(run?.comment_count || 0) });
      const pump = pumps.get(source.id);
      if (SUCCESS_SYNC_STATUSES.has(latestRuns.at(-1).status) && commentsSupported) pump?.complete();
      else pump?.stop();
    }
    const incomplete = latestRuns.filter(item => !SUCCESS_SYNC_STATUSES.has(item.status) || !item.commentsSupported);
    const collectionStatus = incomplete.length || collectionErrors.length ? 'collection_failed' : 'collection_completed';
    emitProgress(scopedDeps, { phase: 'draining_analysis', collectionStatus, sources: latestRuns });
    const pumpResults = await Promise.all([...pumps.values()].map(pump => pump.done));
    const pumpResult = pumpResults.reduce((total, result) => ({ analyzed: total.analyzed + Number(result?.analyzed || 0), alerted: total.alerted + Number(result?.alerted || 0), stopped: total.stopped || Boolean(result?.stopped), completed: total.completed && Boolean(result?.completed) }), { analyzed: 0, alerted: 0, stopped: false, completed: true });
    const analysis = { ...pumpResult, skipped: false };
    const contents = collectionStatus === 'collection_failed' ? null : await deps.repo.countContentsByType(window);
    emitProgress(scopedDeps, { phase: 'completed', collectionStatus, sourceCounts: { total: latestRuns.length, failed: incomplete.length + collectionErrors.length }, jobCounts: { analyzed: pumpResult.analyzed, alerted: pumpResult.alerted } });
    return { ...summary, dryRun: false, collectionStatus, sources: latestRuns, incompleteSources: incomplete, contents, analysis };
  } finally {
    if (typeof releaseDailyAnalysisScope === 'function') releaseDailyAnalysisScope();
    if (analysisLocked) await deps.repo.releaseAdvisoryLock('po-analysis-consumer');
    if (locked) await deps.repo.releaseAdvisoryLock(lockName);
  }
}

async function main() {
  let deps = null;
  try {
    const mode = requireExplicitSchedulerMode(process.env);
    const gate = legacyScheduledGate({ mode });
    if (gate) {
      console.log(JSON.stringify(gate));
      return;
    }
    deps = buildDeps();
    const result = await runDaily(deps, { dryRun: process.argv.includes('--dry-run') });
    console.log(JSON.stringify(result));
    if (!result.dryRun && ['collection_failed', 'awaiting_manual_verification'].includes(result.collectionStatus)) process.exitCode = 2;
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', code: error.code || 'DAILY_RUN_FAILED', message: error.message }));
    process.exitCode = 1;
  } finally {
    if (deps?.repo?.pool?.end) await deps.repo.pool.end();
  }
}

if (require.main === module) main();

module.exports = { activeCount, analyzeWindow, enqueueWindow, enqueueOnlyDeps, runAnalysisPump, preflightSources, runDaily, legacyScheduledGate, isDailyAnalysisScopeActive, registerDailyAnalysisScope, isClaimLockError, stableClaimLockError };
