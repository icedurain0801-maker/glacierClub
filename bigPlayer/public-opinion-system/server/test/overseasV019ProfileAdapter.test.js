'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), p = require('../../scripts/overseas-v019-profile-adapter-contract');
function input() { return { sourceId: p.sourceId, manifestSha256: 'c'.repeat(64),
  configuration: { kind: 'existing-config-db-fields', sourcePath: p.configurationPath, selectedFields: [...p.selectedFields], recordSelector: 'exact-db-fields-once', identityAlias: 'existing-db-identity-unverified', grantStatus: 'unverified' },
  target: { host: '127.0.0.1', port: 3306, database: 'public_opinion', serverId: 1, version: '10.4.14-MariaDB' }, faults: [], limits: {} }; }
const run = f => p.runFixtureProfileAdapter(p.issueFixtureProfile(f || input()));
function safe(r) { const text = JSON.stringify(r); for (const v of ['synthetic-adapter-db-user', 'synthetic-adapter-db-password', 'untrusted-secret-error', 'sentinel-secret']) assert.ok(!text.includes(v), v); assert.equal(r.adapter.actualMysql2Loaded, false); assert.equal(r.adapter.realConfigurationRead, false); assert.equal(r.privateReferencesReleased, true); }
function stopped(r) { assert.equal(r.status, 'NO_GO'); assert.equal(r.adapter.trace.at(-1).event, 'DESTROY'); assert.equal(r.adapter.destroys, 1); assert.equal(r.adapter.reconnectCount, 0); safe(r); }
test('private profile auth consumed exactly once by one callback-shaped connection; seven rows normalized and ended', async () => {
  const r = await run(); assert.equal(r.status, 'ISOLATED_PROFILE_ADAPTER_CONTRACT_PASS'); assert.equal(r.evidence.selects, 7); assert.equal(r.adapter.creations, 1); assert.equal(r.adapter.authConsumptions, 1); assert.equal(r.adapter.closed, true); assert.equal(r.adapter.destroys, 0);
  assert.deepEqual(r.adapter.trace.filter(x => ['CREATE_CONNECTION', 'CONNECT', 'R1', 'SET_ISOLATION', 'START_READ_ONLY', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'ROLLBACK', 'END', 'CLOSED'].includes(x.event)).map(x => x.event), ['CREATE_CONNECTION', 'CONNECT', 'R1', 'SET_ISOLATION', 'START_READ_ONLY', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'ROLLBACK', 'END', 'CLOSED']);
  assert.equal(r.discovery.approvalForSecretRead, false); assert.equal(r.configuration.grantStatus, 'unverified'); safe(r);
});
test('descriptor fixed target/source/existing single DB record scope, no guessed root or new provider', () => {
  for (const change of [f => f.sourceId = 'other', f => f.target.host = 'remote', f => f.target.port = 3307, f => f.target.database = 'other', f => f.target.serverId = 2,
    f => f.configuration.sourcePath = 'C:/other/.env', f => f.configuration.selectedFields.push('DATABASE_URL'), f => f.configuration.selectedFields.pop(), f => f.configuration.recordSelector = 'all-env', f => f.configuration.grantStatus = 'verified', f => f.configuration.records = []]) { const f = input(); change(f); assert.throws(() => p.issueFixtureProfile(f)); }
});
test('opaque capability cannot copy/cross contracts/reuse/renew deadline', async () => {
  const cap = p.issueFixtureProfile(input()); for (const copy of [{ ...cap }, Object.create(cap), JSON.parse(JSON.stringify(cap))]) await assert.rejects(p.runFixtureProfileAdapter(copy), { code: 'ADAPTER_CAPABILITY_REJECTED' });
  await p.runFixtureProfileAdapter(cap); await assert.rejects(p.runFixtureProfileAdapter(cap));
  const f = input(); f.limits.totalTimeoutMs = 20; const short = p.issueFixtureProfile(f); await new Promise(resolve => setTimeout(resolve, 30)); await assert.rejects(p.runFixtureProfileAdapter(short));
});
test('authentication material is private and consumed in connect; wrong fixture brand fails before SELECT', async () => {
  const f = input(); f.faults = [{ at: 'CONNECT', authFault: true }]; const r = await run(f); assert.equal(r.evidence.selects, 0); assert.equal(r.adapter.authConsumptions, 0); assert.equal(r.errorCode, 'ADAPTER_CALLBACK_FAILED'); stopped(r);
  for (const key of ['user', 'password', 'credential', 'DATABASE_URL', 'provider', 'createConnection', 'pool', 'live', 'connection', 'query']) { const f = input(); f[key] = 'caller-secret'; assert.throws(() => p.issueFixtureProfile(f)); }
});
test('connect, controls, seven SELECTs, rollback/end timeout destroy and never retry/query/end later', async () => {
  for (const at of ['CONNECT', 'R1', 'SET_ISOLATION', 'START_READ_ONLY', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'ROLLBACK', 'END']) {
    const f = input(); f.limits = { connectTimeoutMs: 10, queryTimeoutMs: 10 }; f.faults = [{ at, hang: true }]; const r = await run(f); assert.equal(r.errorCode, 'ADAPTER_OPERATION_TIMEOUT'); assert.equal(r.adapter.creations, 1); stopped(r);
  }
  const f = input(); f.limits.totalTimeoutMs = 30; f.faults = [{ at: 'CONNECT', delayMs: 100 }]; const r = await run(f); assert.equal(r.evidence.selects, 0); stopped(r);
});
test('synchronous, duplicate and error-then-result callbacks settle once and suppress secret errors', async () => {
  for (const callbackMode of ['sync', 'duplicate']) { const f = input(); f.faults = [{ at: 'CONNECT', callbackMode }, { at: 'R1', callbackMode }]; const r = await run(f); assert.equal(r.status, 'ISOLATED_PROFILE_ADAPTER_CONTRACT_PASS'); assert.equal(r.evidence.selects, 7); if (callbackMode === 'duplicate') assert.equal(r.adapter.ignoredCallbacks, 2); safe(r); }
  const f = input(); f.faults = [{ at: 'R3', callbackMode: 'error-then-result' }]; const r = await run(f); assert.equal(r.errorCode, 'ADAPTER_CALLBACK_FAILED'); assert.equal(r.adapter.ignoredCallbacks, 1); stopped(r);
  const late = input(); late.limits.queryTimeoutMs = 10; late.faults = [{ at: 'R1', callbackMode: 'late-result' }]; const ignored = await run(late);
  assert.equal(ignored.errorCode, 'ADAPTER_OPERATION_TIMEOUT'); assert.equal(ignored.adapter.ignoredCallbacks, 1); assert.equal(ignored.evidence.selects, 1); stopped(ignored);
});
test('SQL dateStrings, safe BIGINT and strict field metadata reject wrong schema/type/date families', async () => {
  for (const fault of [{ at: 'R2', integerFault: 'unsafe-bigint' }, { at: 'R3', integerFault: 'tiny-string' }, { at: 'R1', dateFault: 'invalid' }, { at: 'R1', dateFault: 'offset' }, { at: 'R1', dateFault: 'date-object' }, ...['missing', 'extra', 'duplicate', 'type'].map(fieldFault => ({ at: 'R4', fieldFault }))]) {
    const f = input(); f.faults = [fault]; const r = await run(f); assert.equal(r.status, 'NO_GO'); stopped(r);
  }
  const f = input(); f.faults = [{ at: 'R4', rowPatch: { expire_at: null } }]; const r = await run(f); assert.equal(r.status, 'ISOLATED_PROFILE_ADAPTER_CONTRACT_PASS'); safe(r);
});
test('raw and normalized UTF8 row/query/batch exact/+1 limits; unknown secret columns never stripped', async () => {
  const base = await run(), maxQuery = Math.max(...base.adapter.trace.filter(x => x.event.endsWith('RESULT')).map(x => x.bytes)), maxRow = Math.max(...base.adapter.trace.filter(x => x.event.endsWith('RESULT')).map(x => x.maxRowBytes));
  const f = input(); f.limits = { perRowBytes: maxRow, perQueryBytes: maxQuery, batchBytes: Math.max(base.adapter.rawBytes, base.adapter.normalizedBytes) }; let r = await run(f); assert.equal(r.status, 'ISOLATED_PROFILE_ADAPTER_CONTRACT_PASS');
  for (const key of ['perRowBytes', 'perQueryBytes', 'batchBytes']) { const next = input(); next.limits = { ...f.limits, [key]: f.limits[key] - 1 }; r = await run(next); assert.ok(['ADAPTER_BYTES_EXCEEDED', 'NARROW_BYTES_EXCEEDED'].includes(r.errorCode)); stopped(r); }
  const bad = input(); bad.faults = [{ at: 'R2', rowPatch: { config: 'sentinel-secret' } }]; r = await run(bad); assert.equal(r.status, 'NO_GO'); safe(r);
});
test('target, ownership, conflicts and original unknown registry remain bound through adapter', async () => {
  for (const fault of [{ at: 'R1', rowPatch: { port: 3307 } }, { at: 'R3', rowCount: 2 }, { at: 'R4', rowCount: 2 }, { at: 'R5', rowCount: 4 }, { at: 'R4', rowPatch: { source_id: 'other' } }]) {
    const f = input(); f.faults = [fault]; const r = await run(f); assert.equal(r.status, 'NO_GO'); stopped(r);
  }
  const r = await run(); assert.deepEqual(r.discovery.registry.map(x => x.authStatus), ['authorized', 'unknown', 'unknown']); safe(r);
  const expired = input(); expired.faults = [{ at: 'R4', rowPatch: { expire_at: new Date(Date.now() + 300).toISOString().replace('T', ' ').replace('Z', '') } }, { at: 'END', delayMs: 350 }];
  const ended = await run(expired); assert.equal(ended.status, 'NO_GO'); assert.equal(ended.errorCode, 'NARROW_IDENTITY_HOLD'); assert.equal(ended.discovery, undefined); assert.equal(ended.adapter.closed, true); assert.equal(ended.adapter.destroys, 0); safe(ended);
});
test('input functions/getters/symbol/hooks denied, limits clamp and production disabled', async () => {
  let called = 0; const f = input(); Object.defineProperty(f.configuration, 'password', { get() { called++; return 'secret'; } }); assert.throws(() => p.issueFixtureProfile(f)); assert.equal(called, 0);
  for (const change of [f => f[Symbol('x')] = 1, f => f.faults.extra = 1, f => f.configuration.secret = () => {}]) { const f = input(); change(f); assert.throws(() => p.issueFixtureProfile(f)); }
  const large = input(); large.limits = { connectTimeoutMs: 999999, queryTimeoutMs: 999999, totalTimeoutMs: 999999, perRowBytes: 999999, perQueryBytes: 999999, batchBytes: 999999 }; const r = await run(large); assert.equal(r.adapter.limits.connectTimeoutMs, 1000); assert.equal(r.adapter.limits.queryTimeoutMs, 1000); safe(r);
  assert.throws(p.runProductionProfileAdapter, { code: 'REAL_PROFILE_ADAPTER_DISABLED' }); assert.equal(p.query, undefined); assert.equal(p.createConnection, undefined);
});
