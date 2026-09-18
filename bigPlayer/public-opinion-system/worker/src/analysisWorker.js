const { buildDeps, processAnalysisBacklog } = require('./worker');
const { isDailyAnalysisScopeActive } = require('./dailyRunner');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 定期清理 po_quality_candidates 中不再满足现行筛选条件的残留行。
// cleanupInvalidQualityCandidates 是全表 JOIN DELETE，开销不小，按时间间隔节流（默认 30 分钟一次）。
const QUALITY_CLEANUP_INTERVAL_MS = Math.max(60_000, Number(process.env.QUALITY_CLEANUP_INTERVAL_MS || 30 * 60_000));
let lastQualityCleanupAt = 0;
let qualityCleanupRunning = false;
let backlogRunning = false;

async function maybeCleanupQualityCandidates(repo) {
  if (qualityCleanupRunning) return;
  const now = Date.now();
  if (now - lastQualityCleanupAt < QUALITY_CLEANUP_INTERVAL_MS) return;
  lastQualityCleanupAt = now;
  qualityCleanupRunning = true;
  try {
    const removed = await repo.cleanupInvalidQualityCandidates();
    if (removed) console.log(new Date().toISOString(), `quality-candidate cleanup removed=${removed}`);
  } catch (error) {
    console.error(new Date().toISOString(), 'quality-candidate cleanup failed:', error?.code || 'CLEANUP_FAILED');
  } finally {
    qualityCleanupRunning = false;
  }
}

async function runBacklogIteration(deps, processFn = processAnalysisBacklog, { scope = null } = {}) {
  const activeScope = scope || deps?.analysisScope;
  if (activeScope && isDailyAnalysisScopeActive(activeScope)) return { skipped: true, reason: 'daily_scope_active' };
  if (backlogRunning) return { skipped: true, reason: 'already_running' };
  backlogRunning = true;
  let locked = false;
  try {
    if (typeof deps.repo?.acquireAdvisoryLock !== 'function') return { skipped: true, reason: 'analysis_gate_unavailable' };
    locked = await deps.repo.acquireAdvisoryLock('po-analysis-consumer', 0);
    if (!locked) return { skipped: true, reason: 'analysis_scope_active' };
    return await processFn(deps);
  } finally {
    try { if (locked) await deps.repo.releaseAdvisoryLock('po-analysis-consumer'); }
    finally { backlogRunning = false; }
  }
}

async function runAnalysisLoop(deps, { sleepFn = sleep, signal, processFn = processAnalysisBacklog, log = console.log } = {}) {
  const idleMs = Math.max(100, Number(process.env.AI_ANALYSIS_WORKER_IDLE_MS || 1000));
  let nextMetricsAt = 0;
  while (!signal?.aborted) {
    let result;
    try {
      result = await runBacklogIteration(deps, processFn);
    } catch (error) {
      console.error(new Date().toISOString(), 'backlog iteration failed:', error?.code || 'ANALYSIS_ITERATION_FAILED');
      await sleepFn(idleMs);
      continue;
    }
    log(JSON.stringify({ task: 'analysis-worker', at: new Date().toISOString(), analyzed: result?.analyzed || 0, skipped: Boolean(result?.skipped) }));
    if (Date.now() >= nextMetricsAt && typeof deps.repo.countAnalysisJobs === 'function') {
      nextMetricsAt = Date.now() + 60000;
      try { log(JSON.stringify({ task: 'analysis-queue', at: new Date().toISOString(), ...await deps.repo.countAnalysisJobs({ profile: 'light', version: deps.ai.profiles.light.version }) })); }
      catch (error) { console.error('[analysis-worker] metrics failed:', error?.code || 'ANALYSIS_METRICS_FAILED'); }
    }
    await sleepFn(result?.analyzed ? 100 : idleMs);
  }
}

async function main() {
  const deps = buildDeps();
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try { return await runAnalysisLoop(deps, { signal: controller.signal }); }
  finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    await deps.repo.pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('[analysis-worker]', error?.code || 'ANALYSIS_WORKER_FAILED');
    process.exit(1);
  });
}

module.exports = { maybeCleanupQualityCandidates, runBacklogIteration, runAnalysisLoop };
