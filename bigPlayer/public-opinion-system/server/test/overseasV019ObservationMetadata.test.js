'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), core = require('../../scripts/overseas-v019-fixture-integration-contract');
const fixture = require('./fixtures/overseasObservationIdentity');
const input = () => { const identity = fixture('auth-only'); return { identity, accountRows: [identity.account] }; };
test('metadata-only discovers exact fixture IDs without cipher/token/R8/transport', async () => {
  const f = input(), r = await core.runFixtureMetadataProbe(f);
  assert.equal(r.sourceId, f.identity.source.id); assert.equal(r.accountId, f.identity.account.id); assert.equal(r.credentialId, f.identity.credentials[0].id);
  assert.equal(r.registry.length, 3); assert.equal(r.evidence.selectCount, 7); assert.equal(r.evidence.secretLoaded, false); assert.equal(r.approvalForSecretRead, false);
  assert.deepEqual(r.evidence.trace.filter(e => typeof e === 'object').map(e => e.key), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);
  assert.ok(!JSON.stringify(r).includes('synthetic-reader')); assert.ok(!JSON.stringify(r).includes('club-en.q1.com'));
});
test('unknown registry remains unknown and does not grant sample/secret authorization', async () => {
  const f = input(); f.identity.allowUnknownAuthProbe = true; f.identity.sites[1].authStatus = 'unknown'; Object.assign(f.identity, core.observation.fixtureProjection(f.identity));
  const saved = JSON.stringify(f), r = await core.runFixtureMetadataProbe(f); assert.equal(r.registry[1].authStatus, 'unknown'); assert.equal(JSON.stringify(f), saved);
  assert.equal(r.approvalForSecretRead, false); assert.equal(r.capability, undefined);
});
test('multi-account and result drift fail closed without secret read', async () => {
  let f = input(); f.accountRows.push({ ...f.identity.account, id: 'other' }); await assert.rejects(core.runFixtureMetadataProbe(f), { code: 'READER_ACCOUNT_SELECTION_HOLD' });
  f = input(); f.faults = [{ atSelect: 4, rowPatch: { status: 'inactive' } }]; await assert.rejects(core.runFixtureMetadataProbe(f), e => { assert.equal(e.code, 'READER_BINDING_DRIFT'); assert.equal(e.evidence.secretLoaded, false); assert.equal(e.evidence.selectCount, 4); return true; });
});
test('deadline/schema failure stops seven-SELECT read and never falls back', async () => {
  const f = input(); f.queryTimeoutMs = 10; f.faults = [{ atSelect: 2, hang: true, cancelFails: true }];
  await assert.rejects(core.runFixtureMetadataProbe(f), e => { assert.equal(e.evidence.trace.at(-1), 'DESTROY'); assert.equal(e.evidence.selectCount, 2); assert.equal(e.evidence.reconnectCount, 0); return true; });
});
test('metadata entry rejects supplied secrets, callbacks, getters, and production activation', async () => {
  for (const key of ['cipherEnvelope', 'apiToken', 'refreshToken', 'driver', 'live']) await assert.rejects(core.runFixtureMetadataProbe({ ...input(), [key]: 'forbidden' }), { code: 'METADATA_INPUT_REJECTED' });
  let calls = 0; const f = input(); Object.defineProperty(f, 'cipherEnvelope', { get() { calls++; return 'secret'; } }); await assert.rejects(core.runFixtureMetadataProbe(f)); assert.equal(calls, 0);
  assert.throws(core.runProductionMetadataProbe, { code: 'REAL_METADATA_PROBE_DISABLED' });
});
