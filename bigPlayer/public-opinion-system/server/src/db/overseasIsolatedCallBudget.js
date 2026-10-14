'use strict';
// Isolated fixture only. No provider, notification transport or production entry.
const crypto = require('node:crypto');
const { canonical } = require('../../../worker/src/overseasBigPlayerRunContractJournal');
const { authorizeControlledTuple } = require('../../../worker/src/overseasControlledManifest');
const sha = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
const fail = code => { throw Object.assign(Error(code), { code }); };
const statements = [
  'CREATE TABLE po_fixture_call_manifests (manifest_sha CHAR(64) PRIMARY KEY, body LONGTEXT NOT NULL) ENGINE=InnoDB COLLATE=utf8mb4_bin',
  'CREATE TABLE po_fixture_call_budgets (scope_sha CHAR(64) NOT NULL, budget_day DATE NOT NULL, cap INT NOT NULL, used INT NOT NULL DEFAULT 0, PRIMARY KEY(scope_sha,budget_day)) ENGINE=InnoDB',
  'CREATE TABLE po_fixture_calls (call_id CHAR(36) PRIMARY KEY, manifest_sha CHAR(64) NOT NULL, tuple_sha CHAR(64) NOT NULL, scope_sha CHAR(64) NOT NULL, budget_day DATE NOT NULL, status VARCHAR(20) NOT NULL, FOREIGN KEY(manifest_sha) REFERENCES po_fixture_call_manifests(manifest_sha)) ENGINE=InnoDB COLLATE=utf8mb4_bin',
  'CREATE TABLE po_fixture_call_accounting_mutex (id INT PRIMARY KEY, version VARCHAR(64) NOT NULL) ENGINE=InnoDB COLLATE=utf8mb4_bin',
  "INSERT INTO po_fixture_call_accounting_mutex VALUES (1,'fixture-call-accounting-v1')",
  'CREATE TABLE po_fixture_call_charges (call_id CHAR(36) PRIMARY KEY, manifest_sha CHAR(64) NOT NULL, tuple_sha CHAR(64) NOT NULL, scope_sha CHAR(64) NOT NULL, budget_day DATE NOT NULL, daily_cap INT NOT NULL, scope_cap INT NOT NULL, binding_sha CHAR(64) NOT NULL) ENGINE=InnoDB COLLATE=utf8mb4_bin',
  "CREATE TABLE po_fixture_disabled_outbox (call_id CHAR(36) PRIMARY KEY, job_id CHAR(36) NOT NULL, status VARCHAR(20) NOT NULL CHECK(status='disabled'), FOREIGN KEY(call_id) REFERENCES po_fixture_calls(call_id)) ENGINE=InnoDB COLLATE=utf8mb4_bin"
];
function createIsolatedCallBudget({ repo, isolation, dailyCap, scopeCap } = {}) {
  if (typeof repo?.pool?.getConnection !== 'function') fail('ISOLATED_CALL_REPOSITORY_REQUIRED');
  require('./overseasScheduledIsolatedTarget').assertScheduledIsolatedTarget(isolation, repo);
  if (![dailyCap, scopeCap].every(n => Number.isSafeInteger(n) && n > 0 && n <= 10000)) fail('ISOLATED_CALL_CAP_INVALID');
  const rows = async (c, sql, params = []) => (await c.query(sql, params))[0];
  async function transaction(work) {
    const c = await repo.pool.getConnection(); let started = false, committing = false, destroyed = false;
    try {
      await isolation.verifyConnection(c);
      await c.query('SET SESSION innodb_lock_wait_timeout=3');
      await c.query('SET SESSION max_statement_time=10');
      await c.beginTransaction(); started = true;
      const value = await work(c); committing = true; await c.commit(); committing = false; started = false;
      return value;
    } catch (error) {
      if (committing) { destroyed = true; c.destroy(); fail('ISOLATED_CALL_COMMIT_UNKNOWN'); }
      if (started) try { await c.rollback(); } catch { destroyed = true; c.destroy(); }
      throw error;
    } finally { if (!destroyed) c.release(); }
  }
  function authorization(manifest, input) {
    const a = authorizeControlledTuple(manifest, input);
    // The scope survives replacement manifests and process restarts.
    const scopeSha = sha({ kind: manifest.kind, identity: a.identity });
    const body = canonical({ kind: manifest.kind, identity: manifest.identity, tuples: manifest.tuples });
    return { ...a, scopeSha, body, kind: manifest.kind };
  }
  async function current(c, a) {
    const i = a.identity, t = a.tuple;
    const source = await rows(c, `SELECT s.game_id,s.community_id,s.default_account_id,s.platform,s.enabled,s.auth_status,g.region_code,g.enabled AS game_enabled,cm.game_id AS community_game,cm.status AS community_status
      FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities cm ON cm.id=s.community_id WHERE s.id=? FOR UPDATE`, [i.sourceId]);
    const s = source[0];
    if (source.length !== 1 || s.game_id !== i.gameId || s.community_id !== i.communityId || s.default_account_id !== i.accountId
      || s.platform !== 'bigplayer_h5' || s.region_code !== 'overseas' || Number(s.enabled) !== 1 || Number(s.game_enabled) !== 1
      || s.community_game !== i.gameId || s.community_status !== 'enabled' || s.auth_status !== 'authorized') fail('ISOLATED_CALL_SCOPE_CHANGED');
    const content = await rows(c, 'SELECT * FROM po_contents WHERE id=? FOR UPDATE', [t.contentId]);
    const r = content[0];
    if (content.length !== 1 || r.source_id !== i.sourceId || r.account_id !== i.accountId || r.game_id !== i.gameId || r.community_id !== i.communityId
      || r.fingerprint !== t.fingerprint || Number(r.is_deleted) !== 0 || r.published_at == null) fail('ISOLATED_CALL_CONTENT_CHANGED');
    const published = new Date(String(r.published_at).replace(' ', 'T') + 'Z').toISOString();
    if (published < i.windowStart || published >= i.windowEnd) fail('ISOLATED_CALL_WINDOW_CHANGED');
    const analysis = a.kind === 'analysis';
    const jobs = await rows(c, `SELECT * FROM ${analysis ? 'po_analysis_jobs' : 'po_translation_jobs'} WHERE id=? FOR UPDATE`, [t.jobId]);
    const j = jobs[0];
    if (jobs.length !== 1 || j.content_id !== t.contentId || j.content_fingerprint !== t.fingerprint || j.status !== 'pending'
      || j[analysis ? 'analysis_version' : 'translation_version'] !== t.version
      || j[analysis ? 'analysis_profile' : 'target_language'] !== t[analysis ? 'profile' : 'targetLanguage']) fail('ISOLATED_CALL_JOB_CHANGED');
  }
  const globalSha = sha({ format: 'fixture-global-call-budget-v1' });
  const chargeHash = r => sha({ format: 'fixture-call-charge-v1', callId: r.call_id, manifestSha: r.manifest_sha,
    tupleSha: r.tuple_sha, scopeSha: r.scope_sha, budgetDay: r.budget_day, dailyCap: Number(r.daily_cap), scopeCap: Number(r.scope_cap) });
  const bucketId = (key, day) => `${key}:${day}`;
  async function accounting(c, a) {
    // Complete scans are for this bounded owned fixture, NOT a production algorithm.
    const guard = await rows(c, 'SELECT id,version FROM po_fixture_call_accounting_mutex ORDER BY id FOR UPDATE');
    if (guard.length !== 1 || Number(guard[0].id) !== 1 || guard[0].version !== 'fixture-call-accounting-v1') fail('ISOLATED_CALL_ACCOUNTING_GUARD_MISSING');
    const [{ day }] = await rows(c, 'SELECT CAST(UTC_DATE() AS CHAR) AS day');
    const budgets = await rows(c, 'SELECT scope_sha,CAST(budget_day AS CHAR) AS budget_day,cap,used FROM po_fixture_call_budgets ORDER BY scope_sha,budget_day FOR UPDATE');
    const charges = await rows(c, 'SELECT call_id,manifest_sha,tuple_sha,scope_sha,CAST(budget_day AS CHAR) AS budget_day,daily_cap,scope_cap,binding_sha FROM po_fixture_call_charges ORDER BY call_id FOR UPDATE');
    const calls = await rows(c, 'SELECT call_id,manifest_sha,tuple_sha,scope_sha,CAST(budget_day AS CHAR) AS budget_day,status FROM po_fixture_calls ORDER BY call_id FOR UPDATE');
    const callMap = new Map(calls.map(r => [r.call_id, r])), chargeMap = new Map(), expected = new Map();
    for (const b of budgets) {
      const cap = Number(b.cap), used = Number(b.used);
      if ((b.scope_sha === globalSha && cap !== dailyCap) || (b.scope_sha === a.scopeSha && b.budget_day === '1970-01-01' && cap !== scopeCap)) fail('ISOLATED_CALL_CAP_CHANGED');
      if (b.used == null || !Number.isSafeInteger(used) || used < 0 || !Number.isSafeInteger(cap) || cap <= 0 || cap > 10000 || used > cap) fail('ISOLATED_CALL_BUDGET_CORRUPT');
    }
    for (const q of charges) {
      const r = callMap.get(q.call_id);
      if (!r || !['reserved', 'fake_consumed'].includes(r.status) || !/^\d{4}-\d{2}-\d{2}$/.test(q.budget_day)
        || q.budget_day > day || q.scope_sha === globalSha || q.binding_sha !== chargeHash(q)
        || ['manifest_sha', 'tuple_sha', 'scope_sha', 'budget_day'].some(k => r[k] !== q[k])) fail('ISOLATED_CALL_CHARGE_LEDGER_MISMATCH');
      chargeMap.set(q.call_id, q);
      for (const [key, bucket, cap] of [[globalSha, q.budget_day, Number(q.daily_cap)], [q.scope_sha, '1970-01-01', Number(q.scope_cap)]]) {
        if (!Number.isSafeInteger(cap) || cap <= 0 || cap > 10000) fail('ISOLATED_CALL_CHARGE_LEDGER_MISMATCH');
        const id = bucketId(key, bucket), prior = expected.get(id);
        if (prior && prior.cap !== cap) fail('ISOLATED_CALL_CHARGE_LEDGER_MISMATCH');
        expected.set(id, { used: (prior?.used || 0) + 1, cap });
      }
    }
    if (calls.length !== charges.length || calls.some(r => !chargeMap.has(r.call_id))) fail('ISOLATED_CALL_CHARGE_LEDGER_MISMATCH');
    if (budgets.length !== expected.size) fail('ISOLATED_CALL_BUDGET_LEDGER_MISMATCH');
    for (const b of budgets) {
      const e = expected.get(bucketId(b.scope_sha, b.budget_day));
      if (!e) fail('ISOLATED_CALL_BUDGET_LEDGER_MISMATCH');
      if (Number(b.cap) !== e.cap) fail('ISOLATED_CALL_CAP_CHANGED');
      if (Number(b.used) !== e.used) fail('ISOLATED_CALL_BUDGET_LEDGER_MISMATCH');
    }
    return { day, budgets, chargeMap };
  }
  async function ensureReservationBudgets(c, a, state) {
    const keys = [[globalSha, state.day, dailyCap], [a.scopeSha, '1970-01-01', scopeCap]];
    for (const [key, bucket, cap] of keys) {
      if (!state.budgets.some(b => b.scope_sha === key && b.budget_day === bucket))
        await c.query('INSERT INTO po_fixture_call_budgets(scope_sha,budget_day,cap) VALUES (?,?,?)', [key, bucket, cap]);
    }
    return keys;
  }
  async function reserve({ manifest, identity, tuple, callId } = {}) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(callId || '')) fail('ISOLATED_CALL_ID_INVALID');
    const a = authorization(manifest, { identity, tuple });
    return transaction(async c => {
      const state = await accounting(c, a), { day } = state;
      await c.query('INSERT IGNORE INTO po_fixture_call_manifests VALUES (?,?)', [a.manifestSha256, a.body]);
      const [m] = await rows(c, 'SELECT body FROM po_fixture_call_manifests WHERE manifest_sha=? FOR UPDATE', [a.manifestSha256]);
      if (m.body !== a.body) fail('ISOLATED_CALL_MANIFEST_CHANGED');
      const prior = await rows(c, 'SELECT * FROM po_fixture_calls WHERE call_id=? FOR UPDATE', [callId]);
      if (prior.length) {
        if (prior[0].manifest_sha !== a.manifestSha256 || prior[0].tuple_sha !== a.tupleSha256 || prior[0].scope_sha !== a.scopeSha) fail('ISOLATED_CALL_ID_CONFLICT');
        // Reconciliation never produces a second consumable receipt.
        return { status: 'already_recorded', automaticConsumeAllowed: false };
      }
      await current(c, a);
      const keys = await ensureReservationBudgets(c, a, state);
      for (const [key, bucket] of keys) {
        const [updated] = await c.query('UPDATE po_fixture_call_budgets SET used=used+1 WHERE scope_sha=? AND budget_day=? AND used<cap', [key, bucket]);
        if (updated.affectedRows !== 1) fail('ISOLATED_CALL_BUDGET_EXHAUSTED');
      }
      await c.query("INSERT INTO po_fixture_calls VALUES (?,?,?,?,?,'reserved')", [callId, a.manifestSha256, a.tupleSha256, a.scopeSha, day]);
      const charge = { call_id: callId, manifest_sha: a.manifestSha256, tuple_sha: a.tupleSha256, scope_sha: a.scopeSha,
        budget_day: day, daily_cap: dailyCap, scope_cap: scopeCap };
      await c.query('INSERT INTO po_fixture_call_charges VALUES (?,?,?,?,?,?,?,?)', [charge.call_id, charge.manifest_sha,
        charge.tuple_sha, charge.scope_sha, charge.budget_day, charge.daily_cap, charge.scope_cap, chargeHash(charge)]);
      return Object.freeze({ status: 'reserved', durable: true, reservationId: callId, manifestSha256: a.manifestSha256, tupleSha256: a.tupleSha256, callId });
    });
  }
  async function consumeFake({ manifest, identity, tuple, receipt } = {}) {
    const a = authorization(manifest, { identity, tuple });
    const fields = ['status', 'durable', 'reservationId', 'manifestSha256', 'tupleSha256', 'callId'];
    if (!receipt || Object.getPrototypeOf(receipt) !== Object.prototype || Reflect.ownKeys(receipt).length !== fields.length
      || Reflect.ownKeys(receipt).some(k => !fields.includes(k))) fail('ISOLATED_CALL_RECEIPT_INVALID');
    const values = {};
    for (const key of fields) { const d = Object.getOwnPropertyDescriptor(receipt, key); if (!d || !Object.hasOwn(d, 'value')) fail('ISOLATED_CALL_RECEIPT_INVALID'); values[key] = d.value; }
    const fixed = Object.freeze(values);
    if (fixed.status !== 'reserved' || fixed.durable !== true || fixed.reservationId !== fixed.callId
      || typeof fixed.callId !== 'string' || !/^[a-f0-9-]{36}$/.test(fixed.callId)
      || fixed.manifestSha256 !== a.manifestSha256 || fixed.tupleSha256 !== a.tupleSha256) fail('ISOLATED_CALL_RECEIPT_INVALID');
    return transaction(async c => {
      // No arbitrary callback: the only consumption is this synthetic DB result.
      const state = await accounting(c, a);
      const [m] = await rows(c, 'SELECT body FROM po_fixture_call_manifests WHERE manifest_sha=? FOR UPDATE', [a.manifestSha256]);
      if (!m || m.body !== a.body) fail('ISOLATED_CALL_MANIFEST_CHANGED');
      const [r] = await rows(c, 'SELECT * FROM po_fixture_calls WHERE call_id=? FOR UPDATE', [fixed.callId]);
      if (!r || r.manifest_sha !== a.manifestSha256 || r.tuple_sha !== a.tupleSha256 || r.scope_sha !== a.scopeSha || r.status !== 'reserved') fail('ISOLATED_CALL_NOT_RESERVED');
      const charge = state.chargeMap.get(fixed.callId);
      if (!charge || charge.manifest_sha !== a.manifestSha256 || charge.tuple_sha !== a.tupleSha256 || charge.scope_sha !== a.scopeSha) fail('ISOLATED_CALL_NOT_RESERVED');
      // Original prepaid UTC-day charge: no new-day bucket/increment/refund.
      await current(c, a);
      const [updated] = await c.query("UPDATE po_fixture_calls SET status='fake_consumed' WHERE call_id=? AND status='reserved'", [fixed.callId]);
      if (updated.affectedRows !== 1) fail('ISOLATED_CALL_NOT_RESERVED');
      await c.query("INSERT INTO po_fixture_disabled_outbox VALUES (?,?,'disabled')", [fixed.callId, a.tuple.jobId]);
      return { status: 'fake_consumed', externalDeliveryAttempted: false, productionActivationAllowed: false };
    });
  }
  return Object.freeze({ reserve, consumeFake, productionActivationAllowed: false });
}
module.exports = { statements, createIsolatedCallBudget };
