'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { issueFixtureIdentity: issue, issueProductionIdentity, runFixture: run, fixtureProjection } = require('../../scripts/overseas-v019-observation-contract');
const fixture = require('./fixtures/overseasObservationIdentity');
test('fixture opaque capability cannot issue production identity or be copied', async () => {
  const data = fixture('auth-only'), cap = issue(data);
  assert.equal(Object.getPrototypeOf(cap), null); assert.deepEqual(Object.keys(cap), []);
  assert.throws(() => issueProductionIdentity(cap), { code: 'REAL_IDENTITY_ISSUANCE_DISABLED' });
  for (const copy of [{ ...cap }, JSON.parse(JSON.stringify(cap)), Object.create(cap)]) await assert.rejects(run(copy, data), { code: 'OBSERVATION_CAPABILITY_REJECTED' });
});
test('binding rejects source account credential registry and plan substitutions', () => {
  const edits = [d => d.source.id = 'other', d => d.account.gameId = 'other', d => d.account.sourceId = 'other', d => d.source.boardId = '1',
    d => d.credentials.push({ ...d.credentials[0] }), d => d.credentials = [], d => d.credentials[0].accountId = 'other', d => d.credentials[0].status = 'inactive',
    d => d.credentials[0].expiresAt = '2000-01-01T00:00:00Z', d => d.credentials[0].version = 2, d => d.sites[0].registryUrl = 'https://evil.example/',
    d => d.sites[1].id = d.sites[0].id, d => d.sites[0].urlSha256 = '0'.repeat(64), d => d.versions.config = 0,
    d => d.planSha256 = '0'.repeat(64), d => d.manifestSha256 = 'bad', d => d.credentials[0].rawToken = 'secret-sentinel',
    d => d.configProjectionSha256 = '0'.repeat(64), d => d.configProjection.boardId = '1'];
  for (const edit of edits) { const d = fixture(); edit(d); assert.throws(() => issue(d)); }
});
test('all nested accessors and symbol keys reject with zero getter calls', () => {
  let calls = 0;
  for (const field of ['source', 'account', 'credentials', 'sites', 'versions']) for (const symbol of [false, true]) {
    const data = fixture(); Object.defineProperty(data[field], symbol ? Symbol('extra') : 'extra', { get() { calls++; throw Error('secret-sentinel'); } });
    assert.throws(() => issue(data), { code: 'OBSERVATION_ACCESSOR_REJECTED' });
  }
  const data = fixture(); data.sites[0][Symbol('extra')] = 1; assert.throws(() => issue(data), { code: 'OBSERVATION_KEY_REJECTED' }); assert.equal(calls, 0);
});
test('functions cyclic inherited arrays and caller clocks are refused', () => {
  for (const edit of [d => d.now = () => 0, d => d.account.self = d.account, d => d.account = Object.create(d.account), d => d.sites.extra = 1]) {
    const data = fixture(); edit(data); assert.throws(() => issue(data));
  }
});
test('unknown sites permit only explicit auth-only fixture probes', async () => {
  let d = fixture(); d.sites[0].authStatus = 'unknown'; assert.throws(() => issue(d), { code: 'OBSERVATION_AUTH_HOLD' });
  d = fixture('auth-only'); d.sites[0].authStatus = 'unknown'; assert.throws(() => issue(d)); d.allowUnknownAuthProbe = true; Object.assign(d, fixtureProjection(d));
  const report = await run(issue(d), d); assert.equal(report.requests.length, 9); assert.equal(report.feedCount, 0);
});
test('every observed version is compared before dispatch and capabilities are single-use', async () => {
  const data = fixture('auth-only'), cap = issue(data);
  for (const key of Object.keys(data.versions)) { const observed = structuredClone(data); observed.versions[key]++; await assert.rejects(run(cap, observed), { code: 'OBSERVATION_IDENTITY_DRIFT' }); }
  const report = await run(cap, data); assert.equal(report.exchangeCount, 3); await assert.rejects(run(cap, data), { code: 'OBSERVATION_CAPABILITY_REJECTED' });
  assert.ok(!JSON.stringify(report).includes('fixture-account')); assert.ok(!JSON.stringify(report).includes('fixture-site'));
});
