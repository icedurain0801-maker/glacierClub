const { buildDeps, processAnalysisBacklog } = require('./worker');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const deps = buildDeps();
  const idleMs = Math.max(100, Number(process.env.AI_ANALYSIS_WORKER_IDLE_MS || 1000));

  for (;;) {
    const [row] = await deps.repo.query(
      "SELECT COUNT(*) AS pending_count FROM po_analysis_jobs WHERE analysis_profile='light' AND analysis_version=? AND status IN ('pending','running','retryable')",
      [deps.ai.profiles.light.version]
    );

    const remaining = Number(row?.pending_count || 0);
    if (!remaining) {
      console.log('analysis backlog completed');
      process.exit(0);
    }

    const result = await processAnalysisBacklog(deps);
    console.log(new Date().toISOString(), `remaining=${remaining}`, `analyzed=${result?.analyzed || 0}`);
    await sleep(result?.analyzed ? 100 : idleMs);
  }
}

main().catch(error => {
  console.error('[analysis-worker]', error);
  process.exit(1);
});
