const test = require('node:test');
const assert = require('node:assert/strict');
const { createReadinessProbe, drainServer } = require('../src/serviceLifecycle');

test('readiness times out, shares in-flight DB work, and recovers', async () => {
  let complete, calls = 0;
  const probe = createReadinessProbe(() => { calls++; return new Promise(resolve => { complete = resolve; }); }, 10);
  assert.deepEqual(await Promise.all([probe(), probe()]), [false, false]);
  assert.equal(calls, 1);
  complete();
  await new Promise(resolve => setImmediate(resolve));
  const next = probe();
  await new Promise(resolve => setImmediate(resolve));
  complete();
  assert.equal(await next, true);
  assert.equal(calls, 2);
});

test('readiness fails closed on dependency error', async () => {
  assert.equal(await createReadinessProbe(() => { throw new Error('DB down'); })(), false);
});

test('shutdown leaves pool open until requests have drained', async () => {
  let drained, ended = false;
  const stopping = drainServer({ close(callback) { drained = callback; }, closeIdleConnections() {} }, { async end() { ended = true; } });
  await Promise.resolve();
  assert.equal(ended, false);
  drained();
  await stopping;
  assert.equal(ended, true);
});
