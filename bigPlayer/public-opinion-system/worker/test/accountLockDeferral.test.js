const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runPagedSource } = require(process.env.PO_WORKER_TEST_MODULE || '../src/worker');
test('busy account returns claimed site run to queue without collection or checkpoint writes', async () => {
  const calls = [];
  const repo = {
    async acquireAdvisoryLock(name, timeout) { calls.push({ name, timeout }); return false; },
    async deferSyncRun() { throw Error('custom finishOnce must own deferral'); },
  };
  const connector = { async listPosts() { throw Error('must not collect'); } };
  const finishOnce = async (status, counts, patch) => { calls.push({ status, counts, patch }); };
  const result = await runPagedSource({ repo }, { id: 'source-1' }, connector, { id: 'audit-1' }, { id: 'child-1' }, { id: 'account-1' }, finishOnce);
  assert.deepEqual(result, { skipped: true, reason: 'account_locked' });
  assert.equal(calls[0].name, 'public-opinion-sync-account-account-1');
  assert.equal(calls[0].timeout, 0);
  assert.equal(calls[1].status, 'partial');
  assert.equal(calls[1].patch.sourceStatus, 'queued');
  assert.equal(calls[1].patch.defer, true);
  assert.equal(calls[1].patch.errorCode, 'SYNC_ACCOUNT_BUSY');
  assert.equal(calls[1].counts.stored, 0);
  assert.match(calls[1].patch.nextRetryAt, /^\d{4}-\d{2}-\d{2} /);
});
test('account deferral retains per-claim owner and epoch fencing through the production finish path', async () => {
  const events = [];
  const repo = {
    async acquireAdvisoryLock() { return false; },
    async deferSyncRun(id, patch) { events.push({ id, patch }); return { id, status: 'queued' }; },
    async finishRun(id, patch) { events.push({ auditId: id, status: patch.status }); },
    async markSourceRun(id, patch) { assert.equal(patch.status, 'queued'); },
  };
  await runPagedSource({ repo, leaseOwner: 'claim-owner' }, { id: 'source-1' }, {}, { id: 'audit-1' }, { id: 'child-1', parent_run_id: 'parent-1', lease_epoch: 7 }, { id: 'account-1' });
  assert.equal(events[0].patch.leaseOwner, 'claim-owner');
  assert.equal(events[0].patch.leaseEpoch, 7);
  assert.equal(events[0].patch.errorCode, 'SYNC_ACCOUNT_BUSY');
  assert.equal(events[1].status, 'partial');
});
