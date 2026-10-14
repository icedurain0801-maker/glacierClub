'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const c = require('../../scripts/overseas-v019-observation-contract'), fixture = require('./fixtures/overseasObservationIdentity');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function unknown() { const d = fixture('auth-only'); d.allowUnknownAuthProbe = true; d.sites[1].authStatus = d.sites[2].authStatus = 'unknown'; return { ...d, ...c.fixtureProjection(d) }; }
async function probe(d, options) { return c.probeFixtureIdentity(c.issueFixtureIdentity(d), d, options); }
test('same-batch auth9 plus sample15 consumes 24 slots, three exchanges and unchanged registry', async () => {
  const d = unknown(), saved = JSON.stringify(d), p = await probe(d);
  assert.equal(p.report.requests.length, 9); assert.equal(p.report.feedCount, 0);
  const converted = c.convertFixtureProbeToSample(p.proof, d), r = await c.runFixture(converted.capability, converted.observedFixture);
  assert.equal(r.status, 'ISOLATED_IDENTITY_STREAM_CONTRACT_PASS'); assert.equal(r.requests.length, 15); assert.equal(r.priorAuthRequests, 9);
  assert.deepEqual(r.requests.map(x => x.slot), Array.from({ length: 15 }, (_, i) => i + 10)); assert.equal(r.exchangeCount, 0); assert.equal(r.feedCount, 6);
  assert.equal(r.readBytes, p.report.readBytes + r.requests.reduce((s, x) => s + x.readBytes, 0)); assert.equal(JSON.stringify(d), saved); assert.equal(converted.productionActivationAllowed, false);
});
test('sample unknown denied; auth-only never automatically takes feeds', async () => {
  const d = unknown(), p = await probe(d); assert.equal(p.report.feedCount, 0);
  const sample = { ...d, mode: 'sample', planSha256: c.planSha256('sample') }; assert.throws(() => c.issueFixtureIdentity(sample), { code: 'OBSERVATION_AUTH_HOLD' });
});
test('proof cannot copy, reuse, or convert against another batch observation', async () => {
  const d = unknown(), p = await probe(d);
  assert.throws(() => c.convertFixtureProbeToSample({ ...p.proof }, d));
  const changed = { ...d, manifestSha256: 'a'.repeat(64) }; assert.throws(() => c.convertFixtureProbeToSample(p.proof, changed));
  c.convertFixtureProbeToSample(p.proof, d); assert.throws(() => c.convertFixtureProbeToSample(p.proof, d));
});
test('failed context or board yields no proof and no sampling', async () => {
  for (const atRequest of [2, 3, 5, 6, 8, 9]) {
    const p = await probe(unknown(), { faults: [{ atRequest, wrongScope: true }] }); assert.equal(p.proof, null); assert.equal(p.report.status, 'NO_GO'); assert.equal(p.report.feedCount, 0); assert.equal(p.report.requests.length, atRequest);
  }
});
test('auth tightened absolute deadline cannot be renewed at conversion', async () => {
  const d = unknown(), p = await probe(d, { totalTimeoutMs: 200 }); assert.ok(p.proof);
  await sleep(210); assert.throws(() => c.convertFixtureProbeToSample(p.proof, d), { code: 'OBSERVATION_AUTH_PROOF_REJECTED' });
});
test('sample inherits auth request limit and cannot enlarge it', async () => {
  const d = unknown(), p = await probe(d, { requestTimeoutMs: 30 }), next = c.convertFixtureProbeToSample(p.proof, d);
  const r = await c.runFixture(next.capability, next.observedFixture, { requestTimeoutMs: 999999, faults: [{ atRequest: 10, hangTransport: true }] });
  assert.equal(r.requestTimeoutMs, 30); assert.equal(r.errorCode, 'OBSERVATION_REQUEST_TIMEOUT'); assert.equal(r.requests.length, 1);
});
test('actual byte budget spans auth and sampling; +1 stops first sampling response', async () => {
  const d0 = unknown(), base = await probe(d0), sampleNext = c.convertFixtureProbeToSample(base.proof, d0), baseline = await c.runFixture(sampleNext.capability, sampleNext.observedFixture);
  const firstSampleBytes = baseline.requests[0].readBytes;
  const faults = base.report.requests.slice(0, 8).map((row, i) => ({ atRequest: i + 1, paddingBytes: c.constants.RESPONSE_LIMIT - row.readBytes - (i === 7 ? base.report.requests[8].readBytes + firstSampleBytes - 1 : 0) }));
  const d = unknown(), p = await probe(d, { faults }); assert.ok(p.proof); assert.equal(p.report.readBytes, c.constants.BATCH_LIMIT - firstSampleBytes + 1);
  const next = c.convertFixtureProbeToSample(p.proof, d), r = await c.runFixture(next.capability, next.observedFixture);
  assert.equal(r.errorCode, 'OBSERVATION_BATCH_BYTES_EXCEEDED'); assert.equal(r.requests.length, 1); assert.equal(r.readBytes, c.constants.BATCH_LIMIT + 1);
});
test('converted fixture capability still cannot activate production or bypass observation drift', async () => {
  const d = unknown(), p = await probe(d), next = c.convertFixtureProbeToSample(p.proof, d);
  assert.throws(c.issueProductionIdentity, { code: 'REAL_IDENTITY_ISSUANCE_DISABLED' });
  await assert.rejects(c.runFixture(next.capability, d), { code: 'OBSERVATION_IDENTITY_DRIFT' });
  const r = await c.runFixture(next.capability, next.observedFixture); assert.equal(r.productionActivationAllowed, false);
  assert.ok(!JSON.stringify(r).includes('synthetic-only')); assert.ok(!JSON.stringify(r).includes('fixture-site'));
});
