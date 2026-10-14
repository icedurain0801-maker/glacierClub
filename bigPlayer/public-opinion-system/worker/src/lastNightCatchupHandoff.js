'use strict';
const crypto = require('node:crypto');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID } = require('./lastNightScope');
const { assertLastNightSiteUrl } = require('../../server/src/connectors/lastNightUrlContract');
const { withDeadlineConnection } = require('./lastNightDeadlineConnection');
const PARENT = 'f49d0d58-926d-4352-8186-f75a0fc4e721';
const CHILDREN = Object.freeze({
  '5fd578a1-91a5-4fd0-a3a3-2b7f3aed8ae5': ['2', 'partial', 'legacy-8483a64ab230417e63c5e30d77b0a6f0'],
  '607bafc0-941a-43df-aa45-308c95647f6b': ['9', 'completed_authorized_scope', 'site-f069f4495d534693dd87b2485053e7cd'],
  '4da86327-92b9-4627-9565-65e985c2f6d9': ['16', 'failed', 'site-3bb48be7f9a82185d6a045e9a5cbd3d7']
});
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function validateSnapshot({ source, account, registry, runs, schedule }, accountId) {
  if (!source || source.id !== SOURCE_ID || source.game_id !== GAME_ID || source.community_id !== COMMUNITY_ID
    || source.region_code !== 'overseas' || source.community_status !== 'enabled' || source.platform !== 'bigplayer_h5'
    || Number(source.enabled) !== 1 || !account || account.id !== accountId || account.source_id !== SOURCE_ID
    || account.game_id !== GAME_ID || account.community_id !== COMMUNITY_ID || account.platform !== 'bigplayer_h5'
    || Number(account.enabled) !== 1) fail('LAST_NIGHT_HANDOFF_SCOPE_MISMATCH');
  let config; try { config = JSON.parse(source.config); } catch { fail('LAST_NIGHT_CONFIG_INVALID'); }
  if (String(config.boardId) !== BOARD_ID || config.siteUrls?.length !== 3 || registry.length !== 3) fail('LAST_NIGHT_HANDOFF_SITE_MISMATCH');
  const ids = new Set();
  for (const site of config.siteUrls) {
    const language = assertLastNightSiteUrl(site.url).searchParams.get('languageId');
    const expected = Object.values(CHILDREN).find(value => value[0] === language);
    if (!expected || site.siteId !== expected[2] || site.enabled === false || ids.has(site.siteId)
      || registry.filter(row => row.site_id === site.siteId && row.url === site.url && Number(row.enabled) === 1).length !== 1) fail('LAST_NIGHT_HANDOFF_SITE_MISMATCH');
    ids.add(site.siteId);
  }
  if (runs.length !== 4 || new Set(runs.map(run => run.id)).size !== 4) fail('LAST_NIGHT_HANDOFF_RUN_MISMATCH');
  const parent = runs.find(run => run.id === PARENT);
  if (!parent || parent.parent_run_id != null || parent.site_id != null
    || !['queued', 'failed'].includes(parent.status) || parent.trigger_type !== 'scheduled_catchup' || parent.started_at != null
    || (parent.status === 'failed' && parent.error_code !== 'SYNC_RUN_POISONED')
    || (parent.status === 'queued' && parent.error_code != null && parent.error_code !== 'SYNC_RUN_RECOVERED')) fail('LAST_NIGHT_HANDOFF_PARENT_CHANGED');
  for (const run of runs) {
    if (run.source_id !== SOURCE_ID || run.account_id !== accountId || run.lease_owner != null || run.lease_until != null
      || run.window_start !== '2026-10-02 03:07:34.810' || run.window_end !== '2026-10-09 03:07:34.810'
      || Number(run.schedule_version) !== Number(source.schedule_version)) fail('LAST_NIGHT_HANDOFF_RUN_MISMATCH');
    if (run.id === PARENT) continue;
    const expected = CHILDREN[run.id];
    if (!expected || run.parent_run_id !== PARENT || run.status !== expected[1] || run.site_id !== expected[2]
      || run.trigger_type !== 'scheduled_site' || (expected[0] !== '16' && run.finished_at == null)) fail('LAST_NIGHT_HANDOFF_CHILD_CHANGED');
    if (expected[0] === '16' && (run.error_code !== 'SYNC_RUN_POISONED' || Number(run.stored_count) !== 0)) fail('LAST_NIGHT_HANDOFF_CHILD_CHANGED');
    if (expected[0] === '2' && run.error_code !== 'PARTIAL_SYNC') fail('LAST_NIGHT_HANDOFF_CHILD_CHANGED');
  }
  if (!schedule || schedule.source_id !== SOURCE_ID || schedule.lease_run_id !== PARENT
    || Number(schedule.active_lease) !== 0 || !Number.isSafeInteger(Number(schedule.lease_epoch))
    || Number(schedule.schedule_version) !== Number(source.schedule_version)) fail('LAST_NIGHT_HANDOFF_SCHEDULE_CHANGED');
  const fields = ['discovered_count', 'stored_count', 'fetched_count', 'inserted_count', 'changed_count', 'unchanged_count', 'comment_count'];
  const totals = Object.fromEntries(fields.map(field => [field, 0]));
  for (const run of runs.filter(run => run.id !== PARENT)) for (const field of fields) {
    const value = Number(run[field] ?? 0); if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(totals[field] + value)) fail('LAST_NIGHT_HANDOFF_COUNTER_INVALID');
    totals[field] += value;
  }
  // Child counters are cumulative observations, not a distinct content population.
  const boundSource = Object.fromEntries(['id','game_id','community_id','platform','enabled','region_code','community_status','config','frequency_seconds','schedule_version','schedule_effective_at'].map(key => [key, source[key]]));
  const boundSchedule = Object.fromEntries(['source_id','lease_run_id','lease_owner','lease_epoch','lease_until','schedule_version','last_scheduled_at','next_scheduled_at'].map(key => [key, schedule[key]]));
  return { parentStatus: 'partial', totals, snapshotHash: sha({ source: boundSource, account, registry, runs, schedule: boundSchedule }) };
}
async function catchupHandoff({ pool, accountId, expectedIdentity, inspectOnly = false, approvedSnapshotHash,
  ownerId, persistEvidence, continueRecovery, timeoutMs = 15000 } = {}) {
  if (!accountId || !expectedIdentity || (!inspectOnly && (!/^[a-f0-9]{64}$/.test(approvedSnapshotHash || '')
    || !/^lastnight-independent:[a-f0-9-]{36}$/.test(ownerId || '') || typeof persistEvidence !== 'function'))) fail('LAST_NIGHT_HANDOFF_PLAN_REQUIRED');
  let committing = false, committed = false; const recoveryCommitState={pending:false,acknowledged:false};
  return withDeadlineConnection(pool, async ({ query: q, bounded }) => {
    try {
      const [[identity]] = await q('SELECT CURRENT_USER() AS identity,DATABASE() AS db,@@port AS port');
      if (identity?.identity !== expectedIdentity || identity.db !== 'public_opinion' || Number(identity.port) !== 3306) fail('LAST_NIGHT_RUNTIME_IDENTITY_MISMATCH');
      const [[lock]] = await q('SELECT GET_LOCK(?,0) AS acquired', [`public-opinion-sync-account-${accountId}`]);
      if (Number(lock?.acquired) !== 1) fail('LAST_NIGHT_DUPLICATE_EXECUTION');
      await q('SET SESSION innodb_lock_wait_timeout=3'); await q('START TRANSACTION');
      // Scheduler locks schedule first; follow that order rather than invert it.
      const [[schedule]] = await q('SELECT *, (lease_until IS NOT NULL AND lease_until>UTC_TIMESTAMP(3)) AS active_lease FROM po_source_schedule_state WHERE source_id=? FOR UPDATE', [SOURCE_ID]);
      const [[source]] = await q('SELECT s.*,g.region_code,c.status AS community_status FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.id=? FOR UPDATE', [SOURCE_ID]);
      const [[account]] = await q('SELECT id,source_id,game_id,community_id,platform,enabled FROM po_accounts WHERE id=? AND source_id=? FOR UPDATE', [accountId, SOURCE_ID]);
      const [registry] = await q('SELECT site_id,url,enabled FROM po_source_sites WHERE source_id=? ORDER BY site_id FOR UPDATE', [SOURCE_ID]);
      const [runs] = await q('SELECT * FROM po_sync_runs WHERE id=? OR parent_run_id=? ORDER BY id FOR UPDATE', [PARENT, PARENT]);
      const [other] = await q("SELECT id FROM po_sync_runs WHERE (source_id=? OR account_id=?) AND id<>? AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE", [SOURCE_ID, accountId, PARENT]);
      if (other.length) fail('LAST_NIGHT_ACTIVE_RUN');
      const snapshot = { source, account, registry, runs, schedule };
      const planned = validateSnapshot(snapshot, accountId);
      if (inspectOnly) { await q('ROLLBACK'); return { status: 'LAST_NIGHT_HANDOFF_PLAN_READY', snapshotHash: planned.snapshotHash, parentId: PARENT, parentStatus: planned.parentStatus, countsKind: 'cumulative_child_counters_not_unique', totals: planned.totals, nextSlotUnchanged: true }; }
      if (planned.snapshotHash !== approvedSnapshotHash) fail('LAST_NIGHT_HANDOFF_PLAN_CHANGED');
      const journal = { phase: 'handoff_prepared', sourceId: SOURCE_ID, accountId, parentId: PARENT, snapshot, snapshotHash: planned.snapshotHash, ownerId };
      await bounded(persistEvidence(journal));
      const parent = runs.find(run => run.id === PARENT);
      const [parentUpdate] = await q("UPDATE po_sync_runs SET status='partial',finished_at=UTC_TIMESTAMP(3),discovered_count=?,stored_count=?,fetched_count=?,inserted_count=?,changed_count=?,unchanged_count=?,comment_count=?,error_code='LAST_NIGHT_CATCHUP_PARTIAL',error_message='terminal children aggregated; independent recovery pending',updated_at=UTC_TIMESTAMP(3) WHERE id=? AND source_id=? AND account_id=? AND parent_run_id IS NULL AND status=? AND error_code<=>? AND lease_epoch<=>? AND attempts<=>? AND updated_at<=>? AND started_at IS NULL AND lease_owner IS NULL AND lease_until IS NULL", [...Object.values(planned.totals), PARENT, SOURCE_ID, accountId, parent.status, parent.error_code ?? null, parent.lease_epoch ?? null, parent.attempts ?? null, parent.updated_at ?? null]);
      if (parentUpdate.affectedRows !== 1) fail('LAST_NIGHT_HANDOFF_CAS_FAILED');
      const [leaseUpdate] = await q('UPDATE po_source_schedule_state SET lease_owner=?,lease_epoch=lease_epoch+1,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND) WHERE source_id=? AND lease_run_id=? AND lease_epoch=? AND lease_owner<=>? AND schedule_version=? AND (lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3))', [ownerId, SOURCE_ID, PARENT, schedule.lease_epoch, schedule.lease_owner, schedule.schedule_version]);
      if (leaseUpdate.affectedRows !== 1) fail('LAST_NIGHT_HANDOFF_CAS_FAILED');
      const [[after]] = await q('SELECT source_id,lease_run_id,lease_owner,lease_epoch,lease_until,last_scheduled_at,next_scheduled_at,schedule_version FROM po_source_schedule_state WHERE source_id=? FOR UPDATE', [SOURCE_ID]);
      if (after.lease_owner !== ownerId || Number(after.lease_epoch) !== Number(schedule.lease_epoch) + 1
        || after.last_scheduled_at !== schedule.last_scheduled_at || after.next_scheduled_at !== schedule.next_scheduled_at) fail('LAST_NIGHT_HANDOFF_VERIFY_FAILED');
      const [afterRuns] = await q('SELECT * FROM po_sync_runs WHERE id=? OR parent_run_id=? ORDER BY id FOR UPDATE', [PARENT, PARENT]);
      const afterParent = afterRuns.find(run => run.id === PARENT);
      if (afterRuns.length !== 4 || afterParent?.status !== 'partial' || afterParent.error_code !== 'LAST_NIGHT_CATCHUP_PARTIAL'
        || Object.entries(planned.totals).some(([key, value]) => Number(afterParent[key]) !== value)
        || JSON.stringify(afterRuns.filter(run => run.id !== PARENT)) !== JSON.stringify(runs.filter(run => run.id !== PARENT))) fail('LAST_NIGHT_HANDOFF_VERIFY_FAILED');
      await bounded(persistEvidence({ ...journal, phase: 'handoff_commit_prepared', after, parentStatus: planned.parentStatus, totals: planned.totals }));
      committing = true; await q('COMMIT'); committed = true;
      await bounded(persistEvidence({ ...journal, phase: 'handoff_committed', after, parentStatus: planned.parentStatus, totals: planned.totals }));
      if (typeof continueRecovery === 'function') {
        // Keep the SAME connection and account GET_LOCK through recovery. No
        // five-minute lease is handed to an idle process between stages.
        committing = false;
        return await bounded(continueRecovery({ query: q, bounded, snapshot, recoveryCommitState, token: { sourceId: SOURCE_ID, parentId: PARENT, accountId, ownerId, epoch: after.lease_epoch }, handoff: { parentStatus: planned.parentStatus, totals: planned.totals } }));
      }
      return { status: 'LAST_NIGHT_HANDOFF_COMMITTED', sourceId: SOURCE_ID, parentId: PARENT, ownerId, epoch: after.lease_epoch, leaseUntil: after.lease_until,
        parentStatus: planned.parentStatus, countsKind: 'cumulative_child_counters_not_unique', totals: planned.totals, historicalChildrenChanged: false,
        recoveryExecuted: false, periodicUniqueOwnerEstablished: false, nextSlotUnchanged: true };
    } catch (error) {
      if(recoveryCommitState.pending){error.code=recoveryCommitState.acknowledged?'LAST_NIGHT_RECOVERY_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_RECOVERY_COMMIT_UNKNOWN';throw error;}
      if (/^LAST_NIGHT_RECOVERY_(COMMIT_UNKNOWN|COMMITTED_JOURNAL_FAILED)$/.test(error.code || '')) throw error;
      if (!committing) { try { await q('ROLLBACK'); } catch {} }
      else error.code = committed ? 'LAST_NIGHT_HANDOFF_COMMITTED_JOURNAL_FAILED' : 'LAST_NIGHT_HANDOFF_COMMIT_UNKNOWN';
      throw error;
    }
  }, { timeoutMs, code: 'LAST_NIGHT_HANDOFF_TIMEOUT' }).catch(error => {
    if(recoveryCommitState.pending)error.code=recoveryCommitState.acknowledged?'LAST_NIGHT_RECOVERY_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_RECOVERY_COMMIT_UNKNOWN';
    if (committing) error.code = committed ? 'LAST_NIGHT_HANDOFF_COMMITTED_JOURNAL_FAILED' : 'LAST_NIGHT_HANDOFF_COMMIT_UNKNOWN'; throw error;
  });
}
module.exports = { validateSnapshot, catchupHandoff, PARENT, CHILDREN };
