const { loadRuntimeEnv } = require('../../../server/src/runtimeEnv');
loadRuntimeEnv();
const { buildDeps, runSource } = require('../../../worker/src/worker');
const SOURCE_ID = '5c21f78d-5f67-4467-963d-dcdeb5e26cab';

(async () => {
  if (!process.argv.includes('--apply-authorized-week')) throw new Error('EXPLICIT_APPLY_REQUIRED');
  const deps = buildDeps({ ...process.env, UNIFIED_SCHEDULER_RECOVERY_SOURCE_ID: SOURCE_ID });
  try {
    const snapshot = async () => {
      const [counts] = await deps.repo.query(`SELECT COUNT(*) AS total,SUM(content_type='post') AS posts,SUM(JSON_EXTRACT(raw_payload,'$.type') IS NOT NULL) AS with_type FROM po_contents WHERE source_id=?`, [SOURCE_ID]);
      const duplicates = await deps.repo.query('SELECT external_id,COUNT(*) AS count FROM po_contents WHERE source_id=? GROUP BY external_id HAVING COUNT(*)>1', [SOURCE_ID]);
      return { ...counts, duplicateGroups: duplicates.length };
    };
    console.log(JSON.stringify({ stage: 'before', sourceId: SOURCE_ID, ...(await snapshot()) }));
    let body;
    if (process.argv.includes('--resume-same-run')) {
      const runId = '97c8f89b-36e5-456b-8f88-73646c28fa58';
      const active = await deps.repo.query("SELECT id FROM po_sync_runs WHERE source_id=? AND status IN ('queued','running')", [SOURCE_ID]);
      if (active.length) throw new Error('SOURCE_RUN_ACTIVE');
      const updated = await deps.repo.query("UPDATE po_sync_runs SET status='queued',finished_at=NULL,error_code=NULL,error_message=NULL,lease_owner=NULL,lease_until=NULL WHERE id=? AND source_id=? AND status='partial' AND window_start='2026-09-09 09:12:21.045' AND window_end='2026-09-16 09:12:21.045'", [runId, SOURCE_ID]);
      if (updated.affectedRows !== 1) throw new Error('EXACT_PARTIAL_RUN_NOT_RESUMABLE');
      body = { data: { runId, resumedSameWindow: true } };
    } else {
      const response = await fetch(`http://127.0.0.1:4320/api/public-opinion/sources/${SOURCE_ID}/sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'backfill', lookbackDays: 7 }) });
      body = await response.json();
      if (!response.ok || !body.data?.runId) throw Object.assign(new Error('QUEUE_FAILED'), { code: body.error?.code || 'QUEUE_FAILED' });
    }
    console.log(JSON.stringify({ stage: 'bounded_queue', ...body.data }));
    const sources = await deps.repo.listSources(null, { sourceId: SOURCE_ID });
    const runs = await deps.repo.query('SELECT * FROM po_sync_runs WHERE id=? AND source_id=?', [body.data.runId, SOURCE_ID]);
    deps.pageBudget = 50;
    deps.connectors.bigplayer_h5.feedMaxPages = 300;
    deps.dailyRunTimeoutMs = 180000;
    await runSource(deps, sources[0], runs[0]);
    const [run] = await deps.repo.query('SELECT id,status,error_code,inserted_count,stored_count,fetched_count,window_start,window_end FROM po_sync_runs WHERE id=?', [body.data.runId]);
    console.log(JSON.stringify({ stage: 'after', ...(await snapshot()), run }));
  } finally { await deps.repo.pool.end(); }
})().catch(error => { console.error(JSON.stringify({ errorCode: error.code || 'BOUNDED_RECOVERY_FAILED' })); process.exitCode = 1; });
