'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { issueFixtureIdentity: issue, runFixture: run, constants } = require('../../scripts/overseas-v019-observation-contract');
const fixture = require('./fixtures/overseasObservationIdentity');
async function execute(options = {}, mode = 'sample') { const d = fixture(mode); return run(issue(d), d, options); }
test('sample streams use exactly 24 slots and three single exchanges with clamped timers', async () => {
  const r = await execute({ requestTimeoutMs: 999999, totalTimeoutMs: 999999 });
  assert.equal(r.status, 'ISOLATED_IDENTITY_STREAM_CONTRACT_PASS'); assert.equal(r.requests.length, 24); assert.equal(r.exchangeCount, 3); assert.equal(r.feedCount, 6);
  assert.equal(r.requestTimeoutMs, 10000); assert.equal(r.totalTimeoutMs, 300000); assert.equal(r.releasedReaders, 24);
  assert.ok(r.requests.every(x => x.summarySha256 && x.readBytes > 0 && x.elapsedMs >= 0)); assert.equal(r.realHttpExecuted, false);
});
test('transport and all body chunks share one request deadline', async () => {
  const r = await execute({ requestTimeoutMs: 40, faults: [{ atRequest: 1, transportDelayMs: 25, chunkDelayMs: 25 }] });
  assert.equal(r.status, 'NO_GO'); assert.equal(r.errorCode, 'OBSERVATION_REQUEST_TIMEOUT'); assert.equal(r.requests.length, 1); assert.equal(r.releasedReaders, 1);
});
test('hung transport and body stop batch with no later slot', async () => {
  for (const fault of [{ hangTransport: true }, { hangBody: true }]) {
    const r = await execute({ requestTimeoutMs: 15, faults: [{ atRequest: 1, ...fault }] }); assert.equal(r.errorCode, 'OBSERVATION_REQUEST_TIMEOUT'); assert.equal(r.requests.length, 1);
  }
  const r = await execute({ totalTimeoutMs: 10, faults: [{ atRequest: 1, transportDelayMs: 25 }] }); assert.equal(r.errorCode, 'OBSERVATION_TOTAL_TIMEOUT');
});
test('actual small chunks exceed response limit before storing oversized payload', async () => {
  const baseline = await execute();
  const padding = constants.RESPONSE_LIMIT - baseline.requests[0].readBytes;
  const exact = await execute({ faults: [{ atRequest: 1, paddingBytes: padding, chunkSizeBytes: 1024 }] });
  assert.equal(exact.status, 'ISOLATED_IDENTITY_STREAM_CONTRACT_PASS'); assert.equal(exact.requests[0].readBytes, constants.RESPONSE_LIMIT);
  const oneOver = await execute({ faults: [{ atRequest: 1, paddingBytes: padding + 1 }] });
  assert.equal(oneOver.errorCode, 'OBSERVATION_RESPONSE_BYTES_EXCEEDED'); assert.equal(oneOver.readBytes, constants.RESPONSE_LIMIT + 1);
  const r = await execute({ faults: [{ atRequest: 1, paddingBytes: constants.RESPONSE_LIMIT, chunkSizeBytes: 1024 }] });
  assert.equal(r.errorCode, 'OBSERVATION_RESPONSE_BYTES_EXCEEDED'); assert.equal(r.requests.length, 1); assert.ok(r.readBytes > constants.RESPONSE_LIMIT); assert.equal(r.releasedReaders, 1);
});
test('actual bytes aggregate across slots and failure bytes remain counted', async () => {
  const baseline = await execute(), remainder = baseline.requests.slice(8).reduce((sum, row) => sum + row.readBytes, 0);
  const exactFaults = baseline.requests.slice(0, 8).map((row, i) => ({ atRequest: i + 1, paddingBytes: constants.RESPONSE_LIMIT - row.readBytes - (i === 7 ? remainder : 0) }));
  const exact = await execute({ faults: exactFaults }); assert.equal(exact.status, 'ISOLATED_IDENTITY_STREAM_CONTRACT_PASS'); assert.equal(exact.readBytes, constants.BATCH_LIMIT);
  const oneOver = await execute({ faults: exactFaults.map((f, i) => ({ ...f, paddingBytes: f.paddingBytes + (i === 7 ? 1 : 0) })) });
  assert.equal(oneOver.errorCode, 'OBSERVATION_BATCH_BYTES_EXCEEDED'); assert.equal(oneOver.readBytes, constants.BATCH_LIMIT + 1);
  const faults = Array.from({ length: 10 }, (_, i) => ({ atRequest: i + 1, paddingBytes: 1000000 }));
  const r = await execute({ faults }); assert.equal(r.errorCode, 'OBSERVATION_BATCH_BYTES_EXCEEDED'); assert.equal(r.requests.length, 9); assert.ok(r.readBytes > constants.BATCH_LIMIT);
});
test('redirect HTTP encoding scope UTF8 and JSON errors stop complete batch', async () => {
  for (const fault of [{ redirect: true }, { status: 302 }, { status: 401 }, { status: 403 }, { status: 429 }, { status: 500 }, { encoding: 'gzip' }, { wrongScope: true }, { invalidUtf8: true }, { malformedJson: true }]) {
    const r = await execute({ faults: [{ atRequest: 2, ...fault }] }); assert.equal(r.status, 'NO_GO'); assert.equal(r.requests.length, 2); assert.ok(/^OBSERVATION_/.test(r.errorCode));
    assert.ok(!JSON.stringify(r).includes('synthetic-only')); assert.ok(!JSON.stringify(r).includes('fixture-site'));
  }
});
test('injected transport reader token and callbacks never execute', async () => {
  let called = 0; const d = fixture('auth-only'), cap = issue(d);
  for (const field of ['transport', 'fetch', 'reader', 'token', 'now']) await assert.rejects(run(cap, d, { [field]: () => { called++; } }));
  await assert.rejects(run(cap, d, { faults: [{ atRequest: 1, get paddingBytes() { called++; return 1; } }] }), { code: 'OBSERVATION_ACCESSOR_REJECTED' }); assert.equal(called, 0);
});
test('internal transport consumes site token and exact GET path query descriptor', async () => {
  for (const requestFault of ['token', 'cross-site-token', 'query', 'duplicate-query', 'path', 'descriptor']) {
    const r = await execute({ faults: [{ atRequest: 4, requestFault }] });
    assert.equal(r.status, 'NO_GO'); assert.equal(r.requests.length, 4);
    assert.equal(r.errorCode, ['token', 'cross-site-token'].includes(requestFault) ? 'OBSERVATION_SESSION_REJECTED' : 'OBSERVATION_REQUEST_PLAN_REJECTED');
  }
});
