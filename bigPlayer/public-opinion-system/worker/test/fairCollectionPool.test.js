const test = require('node:test');
const assert = require('node:assert/strict');
const { createFairCollectionPool } = require('../../shared/fairCollectionPool');
const { createCollectionRequestGate } = require('../../shared/collectionRequestGate');
const tick = () => new Promise(resolve => setTimeout(resolve, 2));
test('real scan intake executes 45 site jobs without account conflicts or starvation', async () => {
  const { runOnce } = require('../src/worker');
  const jobs = Array.from({ length: 45 }, (_, n) => ({ id: `site-${n}`, source_id: `source-${Math.floor(n / 3)}`, account_id: `account-${Math.floor(n / 3)}`, source: { id: `source-${Math.floor(n / 3)}` } }));
  const busy = new Set(), seen = new Set(); let active = 0, maximum = 0;
  await runOnce({ sourceConcurrency: 3, repo: { listRunnableSyncRuns: async () => jobs, listManualDueSources: async () => [], listDueSources: async () => [] }, runSource: async (_, source, job) => {
    assert(!busy.has(job.account_id)); busy.add(job.account_id); active++; maximum = Math.max(maximum, active); assert(!seen.has(job.id)); seen.add(job.id); await tick(); active--; busy.delete(job.account_id);
  } });
  assert.equal(seen.size, 45); assert.equal(maximum, 3);
});
test('15 communities with 3 sites share three slots, each account serial; initial and later intake share the bound', async () => {
  const pool = createFairCollectionPool(3), activeAccounts = new Set(), visited = new Set(); let active = 0, max = 0;
  const submit = (account, site) => pool.submit(account, async () => {
    assert(!activeAccounts.has(account)); activeAccounts.add(account); active++; max = Math.max(max, active); assert(active <= 3);
    visited.add(account); await tick(); active--; activeAccounts.delete(account); return site;
  });
  const work = [];
  for (let a = 0; a < 15; a++) for (let site = 0; site < 3; site++) work.push(submit(`account-${a}`, site));
  await tick(); work.push(submit('account-0', 'polled'), submit('new-account', 'polled'));
  assert.equal((await Promise.all(work)).length, 47); await pool.idle(); assert.equal(max, 3); assert.equal(visited.size, 16); assert.deepEqual(pool.inventory(), { active: 0, waiting: 0, limit: 3 });
});
test('exception frees account and capacity, a later job resumes without duplicate execution', async () => {
  const pool = createFairCollectionPool(1); let executions = 0;
  const a = pool.submit('a', async () => { executions++; throw Error('worker failure'); });
  const b = pool.submit('a', async () => ++executions); await assert.rejects(a); assert.equal(await b, 2); await pool.idle();
});
test('credential gate serializes shared credentials, honors Retry-After and aborts cancelled waits', async () => {
  let clock = 0; const sleeps = []; const gate = createCollectionRequestGate({ intervalMs: 500, now: () => clock, wait: async delay => { sleeps.push(delay); clock += delay; } });
  let active = 0; const limited = gate(async () => { assert.equal(active++, 0); await tick(); active--; return { status: 429, headers: new Headers({ 'retry-after': '2' }) }; });
  const options = { headers: { authorization: 'same-test-credential' } };
  await Promise.all([limited('https://example.test/posts', options), limited('https://example.test/comments', options)]); assert.deepEqual(sleeps, [2000]);
  await assert.rejects(limited('https://example.test/posts', { ...options, signal: AbortSignal.abort() }), { name: 'AbortError' });
});
