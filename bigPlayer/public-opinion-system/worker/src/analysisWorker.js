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
  try { return await processFn(deps); } finally { backlogRunning = false; }
}

async function runAnalysisLoop(deps, { sleepFn = sleep, exitFn = code => process.exit(code) } = {}) {
  const idleMs = Math.max(100, Number(process.env.AI_ANALYSIS_WORKER_IDLE_MS || 1000));
  for (;;) {
    const [row] = await deps.repo.query(
      "SELECT COUNT(*) AS pending_count FROM po_analysis_jobs WHERE analysis_profile='light' AND analysis_version=? AND status IN ('pending','running','retryable')",
      [deps.ai.profiles.light.version]
    );
    const remaining = Number(row?.pending_count || 0);
    if (!remaining) {
      console.log('analysis backlog completed');
      return exitFn(0);
    }
    let result;
    try {
      result = await runBacklogIteration(deps);
    } catch (error) {
      console.error(new Date().toISOString(), 'backlog iteration failed:', error?.code || 'ANALYSIS_ITERATION_FAILED');
      await sleepFn(idleMs);
      continue;
    }
    console.log(new Date().toISOString(), `remaining=${remaining}`, `analyzed=${result?.analyzed || 0}`);
    if (typeof deps.repo.cleanupInvalidQualityCandidates === 'function') await maybeCleanupQualityCandidates(deps.repo);
    await sleepFn(result?.analyzed ? 100 : idleMs);
  }
}

async function main() {
  return runAnalysisLoop(buildDeps());
}

if (require.main === module) {
  main().catch(error => {
    console.error('[analysis-worker]', error?.code || 'ANALYSIS_WORKER_FAILED');
    process.exit(1);
  });
}

module.exports = { maybeCleanupQualityCandidates, runBacklogIteration, runAnalysisLoop };
