'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const d = require('../../scripts/overseas-v019-narrow-metadata-driver');
const input = extra => ({ sourceId: d.sourceId, manifestSha256: 'b'.repeat(64), ...extra });
const run = extra => d.runFixtureNarrowMetadata(input(extra));
const afterDestroy = r => { const trace = r.evidence.trace; assert.equal(trace.at(-1).event, 'DESTROY'); assert.equal(r.evidence.reconnectCount, 0); assert.equal(r.evidence.inTransaction, false); };
test('fixed source produces discovered fixture IDs from seven narrow queries without full identity', async () => {
  const r = await run(); assert.equal(r.status, 'ISOLATED_NARROW_METADATA_CONTRACT_PASS'); assert.equal(r.evidence.selects, 7);
  assert.equal(r.discovery.accountId, 'fixture-discovered-account'); assert.equal(r.discovery.credentialId, 'fixture-discovered-credential'); assert.equal(r.discovery.registry.length, 3);
  assert.deepEqual(r.discovery.registry.map(x => x.authStatus), ['authorized', 'unknown', 'unknown']); assert.equal(r.discovery.approvalForSecretRead, false);
  assert.deepEqual(r.evidence.trace.filter(x => x.event === 'SELECT').map(x => x.key), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
  assert.equal(r.evidence.trace.at(-1).event, 'END'); assert.equal(r.evidence.connectionCount, 1); assert.equal(r.evidence.cleanupComplete, true);
});
test('SQL selects only board scalar and metadata; exclusion of config/url/capabilities body and secret/ref values', () => {
  assert.ok(d.sqlContract.R2.includes("JSON_EXTRACT(config,'$.boardId')")); assert.ok(!/schedule_version,config/.test(d.sqlContract.R2));
  assert.ok(!/\b(url|capabilities)\b/.test(d.sqlContract.R5)); assert.ok(!/SELECT\s+\*/i.test(Object.values(d.sqlContract).join(' ')));
  assert.ok(d.sqlContract.R4.includes('has_cipher')); assert.ok(d.sqlContract.R4.includes('has_ref')); assert.equal(d.sqlContract.R8, undefined);
  assert.ok(d.sqlContract.R3.includes('LIMIT 2')); assert.ok(d.sqlContract.R4.includes('LIMIT 2')); assert.ok(d.sqlContract.R5.includes('LIMIT 4'));
});
test('zero/extra candidates at every identity query hold and stop later operations', async () => {
  for (const [at, counts] of [['R2', [0, 2]], ['R3', [0, 2]], ['R4', [0, 2]], ['R5', [0, 2, 4, 5]], ['R6', [0, 2]], ['R7', [0, 2]]]) for (const rowCount of counts) {
    const r = await run({ faults: [{ at, rowCount }] }); assert.equal(r.status, 'NO_GO'); assert.equal(r.discovery, undefined); assert.equal(r.evidence.selects, Number(at.slice(1))); afterDestroy(r);
  }
});
test('source/account/game/community/credential/registry ownership and status are strict', async () => {
  for (const [at, rowPatch] of [['R2', { id: 'other' }], ['R2', { board_id: '1' }], ['R2', { enabled: 0 }], ['R2', { default_account_id: 'other' }], ['R3', { source_id: 'other' }], ['R3', { platform: 'other' }], ['R3', { game_id: 'other' }], ['R4', { account_id: 'other' }], ['R4', { status: 'inactive' }], ['R4', { has_cipher: 0 }], ['R5', { source_id: 'other' }], ['R5', { enabled: 0 }], ['R6', { region_code: 'domestic' }], ['R7', { game_id: 'other' }]]) {
    const r = await run({ faults: [{ at, rowPatch }] }); assert.equal(r.status, 'NO_GO'); assert.equal(r.evidence.selects, at === 'R2' && Object.hasOwn(rowPatch, 'default_account_id') ? 3 : Number(at.slice(1))); afterDestroy(r);
  }
  const r = await run({ faults: [{ at: 'R5', rowIndex: 1, rowPatch: { site_id: 'fixture-discovered-site-2' } }] }); assert.equal(r.status, 'NO_GO'); afterDestroy(r);
  const baseline = await run(), repeatedHash = baseline.discovery.registry[0].urlHash;
  const duplicate = await run({ faults: [{ at: 'R5', rowIndex: 1, rowPatch: { url_hash: repeatedHash } }] }); assert.equal(duplicate.status, 'NO_GO'); assert.equal(duplicate.evidence.selects, 5); afterDestroy(duplicate);
});
test('expiry/null timestamps, fixed target and DB clock reject drift without secret lookup', async () => {
  for (const [at, rowPatch] of [['R1', { port: 3307 }], ['R1', { server_id: 2 }], ['R1', { database_name: 'other' }], ['R1', { now_utc: '2020-01-01T00:00:00Z' }], ['R2', { auth_expire_at: '2020-01-01T00:00:00Z' }], ['R3', { auth_expire_at: '2020-01-01T00:00:00Z' }], ['R4', { expire_at: '2020-01-01T00:00:00Z' }]]) {
    const r = await run({ faults: [{ at, rowPatch }] }); assert.equal(r.status, 'NO_GO'); afterDestroy(r);
  }
  const r = await run({ faults: [{ at: 'R4', rowPatch: { expire_at: null } }] }); assert.equal(r.status, 'ISOLATED_NARROW_METADATA_CONTRACT_PASS');
  const expiry = new Date(Date.now() + 250).toISOString();
  const ended = await run({ faults: [{ at: 'R4', rowPatch: { expire_at: expiry } }, { at: 'R7', delayMs: 300 }] });
  assert.equal(ended.status, 'NO_GO'); assert.equal(ended.discovery, undefined); assert.equal(ended.evidence.selects, 7); afterDestroy(ended);
});
test('extra body/secret columns, types, invalid date/hash and unsafe integers rejected', async () => {
  for (const [at, rowPatch] of [['R2', { config: 'sentinel-secret' }], ['R5', { url: 'sentinel-secret' }], ['R5', { capabilities: 'sentinel-secret' }], ['R4', { secret_cipher: 'sentinel-secret' }], ['R4', { secret_ref: 'sentinel-secret' }], ['R3', { enabled: '1' }], ['R4', { expire_at: 'not-date' }], ['R5', { url_hash: 'bad' }], ['R2', { schedule_version: Number.MAX_SAFE_INTEGER + 1 }], ['R1', { now_utc: null }]]) {
    const r = await run({ faults: [{ at, rowPatch }] }); assert.equal(r.status, 'NO_GO'); assert.ok(!JSON.stringify(r).includes('sentinel-secret')); afterDestroy(r);
  }
});
test('actual UTF8 bytes per-row/query/batch exact bounds pass; +1 fail and received bytes retained', async () => {
  const base = await run(), rows = base.evidence.trace.filter(e => e.event === 'RESULT'), maxQuery = Math.max(...rows.map(e => e.bytes));
  let r = await run({ perQueryBytes: maxQuery, batchBytes: base.evidence.bytes }); assert.equal(r.status, 'ISOLATED_NARROW_METADATA_CONTRACT_PASS');
  r = await run({ perQueryBytes: maxQuery - 1 }); assert.equal(r.errorCode, 'NARROW_BYTES_EXCEEDED'); afterDestroy(r);
  r = await run({ batchBytes: base.evidence.bytes - 1 }); assert.equal(r.errorCode, 'NARROW_BYTES_EXCEEDED'); assert.equal(r.evidence.bytes, base.evidence.bytes); afterDestroy(r);
  const maxRow = Math.max(...rows.filter(e => e.rows === 1).map(e => e.bytes - 2));
  r = await run({ perRowBytes: maxRow }); assert.equal(r.status, 'ISOLATED_NARROW_METADATA_CONTRACT_PASS');
  r = await run({ perRowBytes: maxRow - 1 }); assert.equal(r.errorCode, 'NARROW_BYTES_EXCEEDED'); afterDestroy(r);
  r = await run({ faults: [{ at: 'R5', rowPatch: { site_id: '界'.repeat(20000) } }] }); assert.equal(r.errorCode, 'NARROW_BYTES_EXCEEDED'); assert.ok(r.evidence.bytes > 32768); afterDestroy(r);
});
test('every lifecycle operation timeout destroys once, no later query/rollback/reconnect', async () => {
  for (const at of ['OPEN', 'R1', 'BEGIN', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'ROLLBACK']) {
    const r = await run({ queryTimeoutMs: 10, faults: [{ at, hang: true, cancelFails: true }] }); assert.equal(r.errorCode, 'NARROW_OPERATION_TIMEOUT'); assert.equal(r.evidence.cancelFailed, true); afterDestroy(r);
    assert.equal(r.evidence.trace.filter(x => x.event === 'DESTROY').length, 1);
  }
  const r = await run({ totalTimeoutMs: 20, faults: [{ at: 'OPEN', delayMs: 50 }] }); assert.equal(r.status, 'NO_GO'); assert.equal(r.evidence.selects, 0); afterDestroy(r);
});
test('limits clamp and caller cannot inject identity/query/config/connection/token/live/hooks', async () => {
  const r = await run({ queryTimeoutMs: 999999, totalTimeoutMs: 999999, perRowBytes: 999999, perQueryBytes: 999999, batchBytes: 999999 });
  assert.deepEqual(r.evidence.limits, { queryTimeoutMs: 1000, totalTimeoutMs: 300000, perRowBytes: 16384, perQueryBytes: 32768, batchBytes: 65536 });
  for (const key of ['identity', 'query', 'driver', 'callback', 'connection', 'configPath', 'token', 'live', 'cipherEnvelope']) await assert.rejects(run({ [key]: 'injected' }), { code: 'NARROW_INPUT_REJECTED' });
  await assert.rejects(d.runFixtureNarrowMetadata({ ...input(), sourceId: 'other' })); assert.throws(d.runProductionNarrowMetadata, { code: 'REAL_NARROW_METADATA_DISABLED' });
});
test('data descriptors reject accessors/symbol/functions/cycles/array extras, evidence is nonsecret', async () => {
  let called = 0; const f = input(); Object.defineProperty(f, 'secret', { get() { called++; throw Error('sentinel'); } }); await assert.rejects(d.runFixtureNarrowMetadata(f)); assert.equal(called, 0);
  for (const change of [f => { f[Symbol('x')] = 1; }, f => { f.faults = []; f.faults.extra = 1; }, f => { f.faults = () => {}; }, f => { f.self = f; }]) { const f = input(); change(f); await assert.rejects(d.runFixtureNarrowMetadata(f)); }
  const r = await run(), trace = JSON.stringify(r.evidence); assert.ok(!trace.includes('fixture-discovered')); assert.ok(!trace.includes('parameters')); assert.equal(r.realConnectionOpened, false); assert.equal(r.realConfigurationRead, false);
});
