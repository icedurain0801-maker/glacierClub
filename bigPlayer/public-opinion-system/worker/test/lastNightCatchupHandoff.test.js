'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { validateSnapshot, catchupHandoff, PARENT, CHILDREN } = require('../src/lastNightCatchupHandoff');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID } = require('../src/lastNightScope');
const accountId = 'fixture-account';
function snapshot() {
  const sites = Object.values(CHILDREN).map(([language, , siteId]) => ({ siteId, url: `https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=${language}`, enabled: true }));
  const base = { source_id: SOURCE_ID, account_id: accountId, schedule_version: 1, lease_owner: null, lease_until: null, window_start: '2026-10-02 03:07:34.810', window_end: '2026-10-09 03:07:34.810' };
  return {
    source: { id: SOURCE_ID, game_id: GAME_ID, community_id: COMMUNITY_ID, platform: 'bigplayer_h5', enabled: 1, region_code: 'overseas', community_status: 'enabled', schedule_version: 1, config: JSON.stringify({ boardId: '100017', siteUrls: sites }) },
    account: { id: accountId, source_id: SOURCE_ID, game_id: GAME_ID, community_id: COMMUNITY_ID, platform: 'bigplayer_h5', enabled: 1 },
    registry: sites.map(site => ({ site_id: site.siteId, url: site.url, enabled: 1 })),
    runs: [{ ...base, id: PARENT, parent_run_id: null, site_id: null, status: 'queued', trigger_type: 'scheduled_catchup', started_at: null },
      ...Object.entries(CHILDREN).map(([id, [language, status, site_id]]) => ({ ...base, id, parent_run_id: PARENT, site_id, status, trigger_type: 'scheduled_site', finished_at: '2026-10-09 03:19:36.000', error_code: language === '16' ? 'SYNC_RUN_POISONED' : language === '2' ? 'PARTIAL_SYNC' : null, stored_count: language === '2' ? 335 : language === '9' ? 164 : 0 }))],
    schedule: { source_id: SOURCE_ID, lease_run_id: PARENT, lease_owner: 'old-owner', lease_epoch: 1534, active_lease: 0, schedule_version: 1, last_scheduled_at: '2026-10-09 00:00:00.000', next_scheduled_at: '2026-10-09 06:00:00.000' }
  };
}
function fixture({ mutate, blocked = false, cas = false, unknown = false, journalFail = false, hang = false } = {}) {
  const state = snapshot(); mutate?.(state); const sql = [], phases = []; let destroyed = false, parentAfter;
  const connection = { destroy() { destroyed = true; }, async query({ sql: text }, params) {
    sql.push(text); if (hang) return new Promise(() => {});
    if (text.includes('CURRENT_USER')) return [[{ identity: 'fixture@local', db: 'public_opinion', port: 3306 }]];
    if (text.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (text.startsWith('SELECT *, ')) return [[state.schedule]];
    if (text.includes('FROM po_sources')) return [[state.source]];
    if (text.includes('FROM po_accounts')) return [[state.account]];
    if (text.includes('FROM po_source_sites')) return [state.registry];
    if (text.startsWith('SELECT * FROM po_sync_runs')) return [parentAfter ? state.runs.map(run => run.id === PARENT ? parentAfter : run) : state.runs];
    if (text.startsWith('SELECT id FROM po_sync_runs')) return [blocked ? [{ id: 'other' }] : []];
    if (text.startsWith('SELECT source_id,lease_run_id')) return [[state.schedule]];
    if (text.startsWith('UPDATE po_sync_runs')) { parentAfter = { ...state.runs[0], status: 'partial', error_code: 'LAST_NIGHT_CATCHUP_PARTIAL', ...Object.fromEntries(['discovered_count','stored_count','fetched_count','inserted_count','changed_count','unchanged_count','comment_count'].map((key, i) => [key, params[i]])) }; }
    if (text.startsWith('UPDATE po_source_schedule_state')) { state.schedule = { ...state.schedule, lease_owner: params[0], lease_epoch: state.schedule.lease_epoch + 1, lease_until: '2026-10-09 03:25:00.000' }; }
    if (text === 'COMMIT' && unknown) throw new Error('ACK lost');
    return [{ affectedRows: cas && text.startsWith('UPDATE') ? 0 : 1 }];
  } };
  return { state, sql, phases, pool: { getConnection: async () => connection }, destroyed: () => destroyed,
    persistEvidence: async event => { phases.push(event.phase); if (journalFail && event.phase === 'handoff_committed') throw new Error('fsync failed'); } };
}
const base = { accountId, expectedIdentity: 'fixture@local', ownerId: 'lastnight-independent:12345678-1234-1234-1234-123456789abc' };
test('inspect zero mutations; apply only parent and schedule, cumulative not unique, no child/content/checkpoint writes', async () => {
  const f = fixture(); const before = JSON.stringify(f.state.runs);
  const plan = await catchupHandoff({ ...f, ...base, inspectOnly: true });
  assert.equal(plan.totals.stored_count, 499); assert.ok(!f.sql.some(sql => /^(UPDATE|INSERT|DELETE)/.test(sql)));
  const g = fixture(); const result = await catchupHandoff({ ...g, ...base, approvedSnapshotHash: plan.snapshotHash });
  assert.equal(result.status, 'LAST_NIGHT_HANDOFF_COMMITTED'); assert.equal(result.epoch, 1535);
  assert.equal(result.periodicUniqueOwnerEstablished, false); assert.equal(result.recoveryExecuted, false);
  assert.equal(JSON.stringify(g.state.runs), before); assert.equal(g.sql.filter(sql => sql.startsWith('UPDATE')).length, 2);
  assert.ok(!g.sql.some(sql => /^(INSERT|DELETE)/.test(sql))); assert.equal(g.phases.at(-1), 'handoff_committed');
  assert.ok(g.sql.findIndex(sql => sql.includes('FROM po_source_schedule_state')) < g.sql.findIndex(sql => sql.includes('FROM po_sources')));
  assert.ok(g.destroyed());
});
test('changed child, extra child, scope/site/window drift and active source lease reject', () => {
  for (const mutate of [s => { s.runs[1].status = 'running'; }, s => { s.runs.push(s.runs[1]); }, s => { s.runs[1].window_start = 'bad'; },
    s => { s.source.community_id = 'other'; }, s => { s.registry[0].url += '&extra=1'; }, s => { s.schedule.active_lease = 1; },
    s => { s.runs[3].stored_count = 1; }, s => { s.runs[1].lease_owner = 'new'; }, s => { s.account.enabled = 0; }]) {
    const state = snapshot(); mutate(state); assert.throws(() => validateSnapshot(state, accountId));
  }
});
test('other activity, hash drift and CAS failure rollback before commit', async () => {
  const hash = validateSnapshot(snapshot(), accountId).snapshotHash;
  for (const [options, code] of [[{ blocked: true }, 'LAST_NIGHT_ACTIVE_RUN'], [{ cas: true }, 'LAST_NIGHT_HANDOFF_CAS_FAILED'], [{ mutate: s => { s.source.config += ' '; } }, 'LAST_NIGHT_HANDOFF_PLAN_CHANGED']]) {
    const f = fixture(options); await assert.rejects(catchupHandoff({ ...f, ...base, approvedSnapshotHash: hash }), error => error.code === code);
    assert.ok(f.sql.includes('ROLLBACK')); assert.ok(!f.sql.includes('COMMIT'));
  }
});
test('commit unknown and committed journal failure are distinct and never rollback/retry', async () => {
  const hash = validateSnapshot(snapshot(), accountId).snapshotHash;
  for (const [options, code] of [[{ unknown: true }, 'LAST_NIGHT_HANDOFF_COMMIT_UNKNOWN'], [{ journalFail: true }, 'LAST_NIGHT_HANDOFF_COMMITTED_JOURNAL_FAILED']]) {
    const f = fixture(options); await assert.rejects(catchupHandoff({ ...f, ...base, approvedSnapshotHash: hash }), error => error.code === code);
    assert.equal(f.sql.filter(sql => sql === 'COMMIT').length, 1); assert.ok(!f.sql.includes('ROLLBACK'));
  }
});
test('deadline destroys connection; no silent retry', async () => {
  const f = fixture({ hang: true }); await assert.rejects(catchupHandoff({ ...f, ...base, inspectOnly: true, timeoutMs: 20 }), error => error.code === 'LAST_NIGHT_HANDOFF_TIMEOUT');
  assert.ok(f.destroyed());
});
test('parent recovery/poison state is bound, running or foreign failure rejected; scheduler diagnostics not immutable', () => {
  for (const [status, error_code] of [['queued','SYNC_RUN_RECOVERED'],['failed','SYNC_RUN_POISONED']]) {
    const state = snapshot(); Object.assign(state.runs[0], { status, error_code, attempts: 4 });
    assert.equal(validateSnapshot(state, accountId).parentStatus, 'partial');
  }
  for (const [status,error_code] of [['running',null],['failed','OTHER_FAILURE']]) {
    const state = snapshot(); Object.assign(state.runs[0], { status,error_code }); assert.throws(() => validateSnapshot(state, accountId));
  }
  const state = snapshot(), original = validateSnapshot(state, accountId).snapshotHash;
  state.schedule.last_reason_code = 'RUN_QUEUED'; state.source.last_success_at = 'dynamic';
  assert.equal(validateSnapshot(state, accountId).snapshotHash, original);
  state.schedule.lease_epoch++; assert.notEqual(validateSnapshot(state, accountId).snapshotHash, original);
  const poisoned = snapshot(); poisoned.runs[3].finished_at = null;
  assert.equal(validateSnapshot(poisoned, accountId).parentStatus, 'partial');
});
test('combined recovery commit timeout propagates UNKNOWN and keeps same connection context',async()=>{
 const f=fixture(),hash=validateSnapshot(snapshot(),accountId).snapshotHash;
 await assert.rejects(catchupHandoff({...f,...base,approvedSnapshotHash:hash,timeoutMs:30,continueRecovery:async context=>{
   assert.equal(typeof context.query,'function');context.recoveryCommitState.pending=true;
   await new Promise(()=>{});
 }}),error=>error.code==='LAST_NIGHT_RECOVERY_COMMIT_UNKNOWN');
 assert.ok(f.destroyed());
});
