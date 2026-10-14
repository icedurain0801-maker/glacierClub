'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const core = require('../../scripts/overseas-v019-fixture-integration-contract');
const fixture = require('./fixtures/overseasObservationIdentity');
function input(mode = 'sample', unknown = false) {
  const identity = fixture(unknown ? 'auth-only' : mode);
  if (unknown) { identity.allowUnknownAuthProbe = true; identity.sites[1].authStatus = identity.sites[2].authStatus = 'unknown'; Object.assign(identity, core.observation.fixtureProjection(identity)); }
  return { reader: { identity, accountRows: [identity.account], cipherEnvelope: { fixture: true, apiToken: 'synthetic-reader-api-token', refreshToken: 'synthetic-reader-refresh-token' } }, targetMode: mode, observation: {} };
}
const execute = f => core.runFixtureIntegration(core.issueFixtureIntegration(f));
function safe(r) {
  const text = JSON.stringify(r); for (const secret of ['synthetic-reader', 'synthetic-only', 'fixture-account', 'fixture-site', 'fixture-credential', 'club-en.q1.com', 'languageId=']) assert.ok(!text.includes(secret), secret);
  assert.equal(r.privateReferencesReleased, true); assert.equal(r.productionActivationAllowed, false);
}
test('sample/auth-only and unknown conversion enforce exact SELECT/request budgets and event ordering', async () => {
  for (const [mode, unknown, count, selects] of [['sample', false, 24, 32], ['auth-only', false, 9, 17], ['sample', true, 24, 32]]) {
    const f = input(mode, unknown), before = JSON.stringify(f.reader.identity), r = await execute(f);
    assert.equal(r.status, 'ISOLATED_FIXTURE_INTEGRATION_PASS'); assert.equal(r.transportCount, count); assert.equal(r.reader.selectCount, selects); assert.equal(r.rootConsumptions, 3);
    assert.equal(r.reader.trace.filter(e => e === 'ROLLBACK').length, count + 2);
    assert.deepEqual(r.events, Array.from({ length: count }, (_, i) => ['V1_START', 'V1_VERIFIED_ROLLBACK', 'TRANSPORT_START'].map(event => ({ slot: i + 1, event }))).flat());
    assert.equal(JSON.stringify(f.reader.identity), before); assert.equal(new Set(r.reports.map(x => x.nonce)).size, 1);
    if (unknown) { assert.deepEqual(r.reports.map(x => x.requests.length), [9, 15]); assert.equal(r.reports[1].exchangeCount, 0); }
    safe(r);
  }
});
test('all24 V1 failure slots stop current transport and every later query/request', async () => {
  for (let slot = 1; slot <= 24; slot++) {
    const f = input('sample', true); f.reader.faults = [{ atSelect: 8 + slot, schemaMismatch: true }];
    const r = await execute(f); assert.equal(r.status, 'NO_GO'); assert.equal(r.attemptedSlot, slot); assert.equal(r.transportCount, slot - 1); assert.equal(r.reader.selectCount, 8 + slot);
    assert.equal(r.reader.trace.at(-1), 'DESTROY'); assert.equal(r.events.at(-1).event, 'V1_START'); assert.equal(r.reader.reconnectCount, 0); safe(r);
  }
});
test('R1-R8 failures have zero transport and no rollback/query after destruction', async () => {
  for (let atSelect = 1; atSelect <= 8; atSelect++) {
    const f = input(); f.reader.queryTimeoutMs = 10; f.reader.faults = [{ atSelect, hang: true, cancelFails: true }];
    const r = await execute(f); assert.equal(r.errorCode, 'READER_QUERY_TIMEOUT'); assert.equal(r.transportCount, 0); assert.equal(r.reader.selectCount, atSelect);
    assert.equal(r.reader.trace.at(-1), 'DESTROY'); assert.equal(r.reader.cancelFailed, true); safe(r);
  }
});
test('per-slot registry/config/account/cipher/credential drift blocks current transport', async () => {
  for (const rowPatch of [{ site_auth_status: 'unknown' }, { config: '{}' }, { account_id: 'other' }, { internal_cipher_sha256: 'replacement' }, { active_credential_count: 2 }, { source_id: 'other' }, { game_enabled: 0 }, { community_status: 'disabled' }]) {
    const f = input('sample', true); f.reader.faults = [{ atSelect: 18, rowPatch }]; const r = await execute(f);
    assert.equal(r.errorCode, 'READER_BINDING_DRIFT'); assert.equal(r.attemptedSlot, 10); assert.equal(r.transportCount, 9); assert.equal(r.reader.destroyed, true); safe(r);
  }
});
test('reader secret consumed by exact exchange descriptor; token/cross-site alterations stop', async () => {
  for (const [atRequest, requestFault] of [[1, 'token'], [4, 'cross-site-token'], [4, 'query'], [4, 'path']]) {
    const f = input(); f.observation.faults = [{ atRequest, requestFault }]; const r = await execute(f);
    assert.equal(r.status, 'NO_GO'); assert.equal(r.transportCount, atRequest - 1); assert.equal(r.reader.selectCount, 8 + atRequest); safe(r);
  }
  const f = input(); f.reader.cipherEnvelope.apiToken = 'caller-real-token'; const r = await execute(f); assert.equal(r.transportCount, 0); assert.equal(r.errorCode, 'READER_SYNTHETIC_CIPHER_REQUIRED'); safe(r);
});
test('natural expiry while V1 waits stops current transport and destroys reader', async () => {
  const f = input(); f.reader.identity.credentials[0].expiresAt = new Date(Date.now() + 200).toISOString();
  f.reader.faults = [{ atSelect: 9, delayMs: 250 }]; const r = await execute(f);
  assert.equal(r.status, 'NO_GO'); assert.equal(r.transportCount, 0); assert.equal(r.reader.selectCount, 9); assert.equal(r.reader.destroyed, true); safe(r);
});
test('one total deadline starts before R1 and cannot renew after authentication', async () => {
  const f = input(); f.observation.totalTimeoutMs = 30; f.reader.faults = [{ atSelect: 1, delayMs: 60 }]; let r = await execute(f);
  assert.equal(r.status, 'NO_GO'); assert.equal(r.transportCount, 0); assert.equal(r.reader.selectCount, 1); safe(r);
  const next = input('sample', true); next.observation.totalTimeoutMs = 1000; next.reader.faults = [{ atSelect: 18, delayMs: 1000 }];
  r = await execute(next); assert.equal(r.status, 'NO_GO'); assert.equal(r.transportCount, 9); assert.equal(r.attemptedSlot, 10); safe(r);
});
test('actual streaming response and cross-stage batch bytes enforce exact/+1 boundaries', async () => {
  const baseline = await execute(input('sample', true)), all = baseline.reports.flatMap(r => r.requests);
  const one = input('sample', true); one.observation.faults = [{ atRequest: 1, paddingBytes: core.observation.constants.RESPONSE_LIMIT - all[0].readBytes }];
  let r = await execute(one); assert.equal(r.status, 'ISOLATED_FIXTURE_INTEGRATION_PASS'); assert.equal(r.reports[0].requests[0].readBytes, core.observation.constants.RESPONSE_LIMIT);
  one.observation.faults[0].paddingBytes++; r = await execute(one); assert.equal(r.errorCode, 'OBSERVATION_RESPONSE_BYTES_EXCEEDED'); assert.equal(r.transportCount, 1); safe(r);
  const tailBytes = all.slice(8).reduce((sum, row) => sum + row.readBytes, 0), batch = input('sample', true);
  batch.observation.faults = all.slice(0, 8).map((row, i) => ({ atRequest: i + 1, paddingBytes: core.observation.constants.RESPONSE_LIMIT - row.readBytes - (i === 7 ? tailBytes : 0) }));
  r = await execute(batch); assert.equal(r.status, 'ISOLATED_FIXTURE_INTEGRATION_PASS'); assert.equal(r.reports.at(-1).readBytes, core.observation.constants.BATCH_LIMIT);
  batch.observation.faults[7].paddingBytes++; r = await execute(batch); assert.equal(r.errorCode, 'OBSERVATION_BATCH_BYTES_EXCEEDED'); assert.equal(r.reports.at(-1).readBytes, core.observation.constants.BATCH_LIMIT + 1); safe(r);
});
test('context/board failure cannot create sampling; request and body limits stop all later slots', async () => {
  for (const atRequest of [2, 3, 5, 6, 8, 9]) {
    const f = input('sample', true); f.observation.faults = [{ atRequest, wrongScope: true }]; const r = await execute(f);
    assert.equal(r.status, 'NO_GO'); assert.equal(r.reports.length, 1); assert.equal(r.reports[0].feedCount, 0); assert.equal(r.transportCount, atRequest); safe(r);
  }
  for (const fault of [{ hangBody: true }, { hangTransport: true }, { transportDelayMs: 25, chunkDelayMs: 25 }]) {
    const f = input(); f.observation.requestTimeoutMs = 40; f.observation.faults = [{ atRequest: 1, ...fault }]; const r = await execute(f);
    assert.equal(r.status, 'NO_GO'); assert.equal(r.transportCount, 1); assert.equal(r.attemptedSlot, 1); safe(r);
  }
});
test('opaque integration batch cannot copy/reuse; external bypass hooks/getters and production fail closed', async () => {
  const f = input('auth-only'), capability = core.issueFixtureIntegration(f);
  for (const copy of [{ ...capability }, Object.create(capability), core.observation.issueFixtureIdentity(f.reader.identity)]) await assert.rejects(core.runFixtureIntegration(copy), { code: 'INTEGRATION_CAPABILITY_REJECTED' });
  await core.runFixtureIntegration(capability); await assert.rejects(core.runFixtureIntegration(capability));
  for (const key of ['skipV1', 'transport', 'beforeRequest', 'live', 'secret', 'proof']) assert.throws(() => core.issueFixtureIntegration({ ...f, [key]: true }));
  let called = 0; Object.defineProperty(f.observation, 'trap', { get() { called++; return 1; } }); assert.throws(() => core.issueFixtureIntegration(f)); assert.equal(called, 0);
  assert.throws(core.runProductionIntegration, { code: 'REAL_INTEGRATION_DISABLED' }); assert.throws(core.reader.prepareProductionReader); assert.throws(core.observation.issueProductionIdentity);
  assert.equal(core.internal, undefined); assert.equal(core.reader.internal, undefined); assert.equal(core.observation.internal, undefined);
});
