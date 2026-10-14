'use strict';
const crypto = require('node:crypto');
const { createControlledManifest } = require('../worker/src/overseasControlledManifest');
const { createScheduledIsolatedTarget } = require('../server/src/db/overseasScheduledIsolatedTarget');
const { statements, createIsolatedCallBudget } = require('../server/src/db/overseasIsolatedCallBudget');
const assert = (v, code) => { if (!v) throw Object.assign(Error(code), { code }); };
async function checkCallBudget({ repo, control, root, directory, serverPid, sourceId, accountId, gameId, communityId }) {
  for (const sql of statements) await control.query(sql);
  const isolation = createScheduledIsolatedTarget({ repo, repositoryRoot: root, directory, serverPid });
  const identity = { sourceId, accountId, gameId, communityId, windowStart: '2026-01-01T00:00:00.000Z', windowEnd: '2026-01-02T00:00:00.000Z' };
  const tuple = { contentId: crypto.randomUUID(), jobId: crypto.randomUUID(), fingerprint: 'a'.repeat(64), profile: 'light', version: 'fixture-v1' };
  await control.query("INSERT INTO po_contents(id,game_id,community_id,source_id,account_id,external_id,fingerprint,published_at) VALUES (?,?,?,?,?,?,?,'2026-01-01 01:00:00')", [tuple.contentId, gameId, communityId, sourceId, accountId, 'fixture-budget', tuple.fingerprint]);
  await control.query('INSERT INTO po_analysis_jobs(id,content_id,analysis_profile,analysis_version,content_fingerprint) VALUES (?,?,?,?,?)', [tuple.jobId, tuple.contentId, tuple.profile, tuple.version, tuple.fingerprint]);
  const manifest = createControlledManifest({ kind: 'analysis', identity, tuples: [tuple] });
  const make = () => createIsolatedCallBudget({ repo, isolation, dailyCap: 2, scopeCap: 2 });
  const input = callId => ({ manifest, identity, tuple, callId });
  const firstId = crypto.randomUUID(), first = await make().reserve(input(firstId));
  assert(first.durable && first.status === 'reserved', 'CALL_FIRST_NOT_DURABLE');
  const replay = await make().reserve(input(firstId));
  assert(replay.status === 'already_recorded' && replay.automaticConsumeAllowed === false, 'CALL_REPLAY_CONSUMABLE');
  const race = await Promise.allSettled([make().reserve(input(crypto.randomUUID())), make().reserve(input(crypto.randomUUID()))]);
  assert(race.filter(r => r.status === 'fulfilled').length === 1 && race.filter(r => r.status === 'rejected' && r.reason.code === 'ISOLATED_CALL_BUDGET_EXHAUSTED').length === 1, 'CALL_LAST_SLOT_RACE');
  const consumed = await make().consumeFake({ manifest, identity, tuple, receipt: first });
  assert(consumed.status === 'fake_consumed' && consumed.externalDeliveryAttempted === false, 'CALL_FAKE_CONSUME_FAILED');
  async function rejected(work, expected) { try { await work(); } catch (e) { assert(e.code === expected, 'CALL_WRONG_REJECTION'); return; } assert(false, 'CALL_EXPECTED_REJECTION'); }
  await rejected(() => make().consumeFake({ manifest, identity, tuple, receipt: first }), 'ISOLATED_CALL_NOT_RESERVED');
  const second = race.find(r => r.status === 'fulfilled').value;
  await control.query('UPDATE po_contents SET fingerprint=? WHERE id=?', ['b'.repeat(64), tuple.contentId]);
  await rejected(() => make().consumeFake({ manifest, identity, tuple, receipt: second }), 'ISOLATED_CALL_CONTENT_CHANGED');
  await control.query('UPDATE po_contents SET fingerprint=? WHERE id=?', [tuple.fingerprint, tuple.contentId]);
  await rejected(() => make().reserve(input(crypto.randomUUID())), 'ISOLATED_CALL_BUDGET_EXHAUSTED');
  const [[outbox]] = await control.query("SELECT COUNT(*) AS n FROM po_fixture_disabled_outbox WHERE status='disabled'");
  const [budgets] = await control.query('SELECT cap,used FROM po_fixture_call_budgets ORDER BY scope_sha');
  assert(Number(outbox.n) === 1 && budgets.length === 2 && budgets.every(b => Number(b.used) === 2), 'CALL_PERSISTENT_COUNTS');
  // Another Node process verifies persistence without loading a consumer or env.
  const { spawnSync } = require('node:child_process');
  const config = repo.pool.pool.config.connectionConfig;
  const childCode = `const fs=require('node:fs'),path=require('node:path'),mysql=require('mysql2/promise');(async()=>{const x=JSON.parse(fs.readFileSync(0,'utf8')),c=await mysql.createConnection(x.db);try{const [[i]]=await c.query('SELECT @@port port,@@server_id serverId,@@datadir datadir,@@pid_file pidFile,DATABASE() db');if(i.port!==13316||i.serverId!==20261036||i.db!=='po_overseas_fixture'||path.resolve(i.datadir).toLowerCase()!==path.join(x.directory,'data').toLowerCase()||path.resolve(i.pidFile).toLowerCase()!==path.join(x.directory,'mysqld.pid').toLowerCase()||Number(fs.readFileSync(i.pidFile,'utf8').trim())!==x.serverPid)throw Error('IDENTITY');const [b]=await c.query('SELECT used FROM po_fixture_call_budgets');if(b.length!==2||b.some(v=>Number(v.used)!==2))throw Error('COUNT');process.stdout.write('PERSISTED');}finally{await c.end();}})().catch(()=>{process.exitCode=1;});`;
  const child = spawnSync(process.execPath, ['-e', childCode], { cwd: require('node:path').resolve(__dirname, '..'), windowsHide: true, shell: false, timeout: 15000, encoding: 'utf8', input: JSON.stringify({ db: { host: '127.0.0.1', port: 13316, user: config.user, password: config.password, database: 'po_overseas_fixture' }, directory, serverPid }) });
  assert(child.status === 0 && child.stdout === 'PERSISTED', 'CALL_NEW_NODE_PERSISTENCE');
  // Inject ACK loss after the actual fake-consumption COMMIT. No receipt/result
  // escapes this unknown boundary, and the durable record forbids replay.
  const unknownRepo = { pool: { getConnection: async () => {
    const c = await repo.pool.getConnection();
    return new Proxy(c, { get(target, key) { if (key === 'commit') return async () => { await target.commit(); throw Error('FIXTURE_ACK_LOSS'); }; const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; } });
  } } };
  const unknownIsolation = createScheduledIsolatedTarget({ repo: unknownRepo, repositoryRoot: root, directory, serverPid });
  const unknownStore = createIsolatedCallBudget({ repo: unknownRepo, isolation: unknownIsolation, dailyCap: 2, scopeCap: 2 });
  const getterReceipt = { ...second };
  Object.defineProperty(getterReceipt, 'callId', { enumerable: true, get() { throw Error('GETTER_MUST_NOT_RUN'); } });
  await rejected(() => make().consumeFake({ manifest, identity, tuple, receipt: getterReceipt }), 'ISOLATED_CALL_RECEIPT_INVALID');
  await rejected(() => unknownStore.consumeFake({ manifest, identity, tuple, receipt: second }), 'ISOLATED_CALL_COMMIT_UNKNOWN');
  await rejected(() => make().consumeFake({ manifest, identity, tuple, receipt: second }), 'ISOLATED_CALL_NOT_RESERVED');
  const otherIdentity = { ...identity, windowEnd: '2026-01-03T00:00:00.000Z' };
  const otherManifest = createControlledManifest({ kind: 'analysis', identity: otherIdentity, tuples: [tuple] });
  // Global cap cannot be raised by creating a new store: fail closed.
  await rejected(() => createIsolatedCallBudget({ repo, isolation, dailyCap: 3, scopeCap: 2 }).reserve({ manifest: otherManifest, identity: otherIdentity, tuple, callId: crypto.randomUUID() }), 'ISOLATED_CALL_CAP_CHANGED');
  const [[finalOutbox]] = await control.query('SELECT COUNT(*) AS n FROM po_fixture_disabled_outbox');
  assert(Number(finalOutbox.n) === 2, 'CALL_ACK_OUTBOX_ATOMICITY');
  // Separate fresh synthetic global day bucket, solely to give ACK-loss reserve
  // one slot. The first fixture's final evidence above remains intact.
  await control.query("UPDATE po_fixture_call_budgets SET budget_day='1969-12-31' WHERE budget_day=UTC_DATE()");
  const thirdId = crypto.randomUUID();
  await rejected(() => unknownStore.reserve({ manifest: otherManifest, identity: otherIdentity, tuple, callId: thirdId }), 'ISOLATED_CALL_COMMIT_UNKNOWN');
  const recovered = await make().reserve({ manifest: otherManifest, identity: otherIdentity, tuple, callId: thirdId });
  assert(recovered.status === 'already_recorded' && recovered.automaticConsumeAllowed === false, 'CALL_UNKNOWN_RESERVE_REPLAY');
  const [[unknownCall]] = await control.query('SELECT COUNT(*) AS n FROM po_fixture_calls WHERE call_id=?', [thirdId]);
  assert(Number(unknownCall.n) === 1, 'CALL_UNKNOWN_RESERVE_COUNT');
  await control.query("UPDATE po_sources SET enabled=0 WHERE id=?", [sourceId]);
  await rejected(() => make().reserve({ manifest: otherManifest, identity: otherIdentity, tuple, callId: crypto.randomUUID() }), 'ISOLATED_CALL_SCOPE_CHANGED');
  await control.query('UPDATE po_sources SET enabled=1 WHERE id=?', [sourceId]);
  return { status: 'PASS_ISOLATED_PERSISTENT_CALL_BUDGET', checks: ['durable_reserve', 'same_call_no_second_receipt', 'last_slot_concurrency', 'store_recreation_persistent_count', 'fake_consume_atomic_disabled_outbox', 'consumption_replay_rejected', 'post_reserve_fingerprint_drift_no_consume_no_refund', 'global_cap_change_rejected', 'new_node_persistent_count', 'fake_commit_ack_unknown_no_replay', 'receipt_getter_rejected', 'reserve_commit_ack_unknown_no_second_receipt', 'disabled_source_rejected'], budgetsBeforeSecondFixture: budgets, disabledOutbox: Number(finalOutbox.n), realAiExecuted: false, realNotificationExecuted: false, newNodeVerified: true, fakeCommitUnknownVerified: true, reserveCommitUnknownVerified: true, syntheticDayBucketRekeyForSecondFixture: true };
}
module.exports = { checkCallBudget };
