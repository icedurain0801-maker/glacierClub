'use strict';
const fs = require('node:fs');
const path = require('node:path');
const project = path.resolve(__dirname, '../../..');
require(path.join(project, 'server/src/runtimeEnv')).loadRuntimeEnv();
const { Repository } = require(path.join(project, 'server/src/db/repository'));
(async () => {
  const repo = new Repository({ ...process.env, DB_POOL_SIZE: '1' });
  let c;
  try {
    c = await repo.pool.getConnection();
    await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const q = async (sql, params = []) => (await c.query({ sql, timeout: 15000 }, params))[0];
    const databaseClock = await q('SELECT UTC_TIMESTAMP(3) AS utc_now, NOW(3) AS session_now');
    const heartbeats = await q('SELECT worker_id,build_sha,mode,last_seen_at,scan_started_at,scan_finished_at,scan_status,scan_error,current_scan FROM po_worker_heartbeats ORDER BY last_seen_at DESC LIMIT 3');
    const schedules = await q("SELECT s.id,ss.last_scan_at,ss.last_status,ss.last_reason_code,ss.last_scheduled_at,ss.next_scheduled_at,ss.lease_owner,ss.lease_until FROM po_sources s JOIN po_games g ON g.id=s.game_id LEFT JOIN po_source_schedule_state ss ON ss.source_id=s.id WHERE g.region_code='domestic'");
    // created_at uses the local session clock; scheduler and heartbeat fields use UTC.
    const newRuns = await q("SELECT r.id,r.source_id,r.parent_run_id,r.status,r.trigger_type,r.scheduled_at,r.window_start,r.window_end,r.created_at,r.updated_at,r.finished_at,r.fetched_count,r.stored_count,r.error_code,r.error_message FROM po_sync_runs r JOIN po_sources s ON s.id=r.source_id JOIN po_games g ON g.id=s.game_id WHERE g.region_code='domestic' AND r.created_at>=? ORDER BY r.created_at DESC LIMIT 10", ['2026-10-10 12:07:16']);
    await c.rollback();
    const result = { capturedAt: new Date().toISOString(), cutoverUtc: '2026-10-10T04:07:16Z', databaseClock, heartbeats, schedules, newRuns, readOnly: true };
    const target = path.resolve(project, '../../.temp', `qa-v048-domestic-worker-${Date.now()}.json`);
    fs.writeFileSync(target, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ ...result, evidencePath: target }, null, 2));
  } finally { if (c) c.release(); await repo.pool.end(); }
})().catch(e => { console.error(JSON.stringify({ status: 'QA_READ_FAILED', code: e.code })); process.exitCode = 1; });
