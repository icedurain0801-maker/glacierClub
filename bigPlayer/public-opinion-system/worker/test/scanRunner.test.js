const test = require('node:test');
const assert = require('node:assert/strict');
const { createScanRunner } = require('../src/scanRunner');

test('timer ticks during a scan never queue an immediate follow-up scan', async () => {
  let calls = 0; let release;
  const tick = createScanRunner(async () => { calls++; await new Promise(resolve => { release = resolve; }); });
  const first = tick(); await Promise.resolve();
  assert.equal(tick(), first); assert.equal(tick(), first);
  release(); await first;
  assert.equal(calls, 1);
  const next = tick(); await Promise.resolve(); assert.equal(calls, 2); release(); await next;
});

test('failed scan releases the guard for a later timer tick', async () => {
  let calls = 0;
  const tick = createScanRunner(async () => { if (++calls === 1) throw new Error('failed'); });
  await assert.rejects(tick()); await tick(); assert.equal(calls, 2);
});
