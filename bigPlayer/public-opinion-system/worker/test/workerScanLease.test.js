const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkerScanLease, recoverExpiredRuns, listPoisonedRuns } = require('../src/workerScanLease');

test('two scanner instances are mutually exclusive and old epochs are fenced', async () => {
  let state = { owner: null, epoch: 0, active: false };
  const query = async (sql, params) => {
    assert.match(sql, /UTC_TIMESTAMP\(3\)/);
    if (sql.startsWith('SELECT')) return state.owner === params[0] && state.active ? [{ epoch: state.epoch }] : [];
    if (sql.includes('epoch=epoch+1')) {
      if (state.active) return { affectedRows: 0 };
      state = { owner: params[0], epoch: state.epoch + 1, active: true };
      return { affectedRows: 1 };
    }
    const release = sql.includes('owner_id=NULL');
    const owner = params[release ? 0 : 1];
    const epoch = params[release ? 1 : 2];
    const valid = state.active && state.owner === owner && state.epoch === epoch;
    if (release && valid) state.active = false;
    return { affectedRows: valid ? 1 : 0 };
  };
  const a = createWorkerScanLease(query), b = createWorkerScanLease(query);
  const first = await a.acquire('a');
  assert.equal(await b.acquire('b'), null);
  assert.equal(await a.release(first), true);
  const second = await b.acquire('b');
  assert.equal(second.epoch, first.epoch + 1);
  assert.equal(await a.renew(first), false);
  assert.equal(await a.release(first), false);
  assert.equal(await b.renew(second), true);
});

test('expired recovery is bounded, fences previous owners and converges poison runs', async () => {
  const calls = [];
  const query = async (sql, params) => { calls.push({ sql, params }); return { affectedRows: 100 }; };
  assert.deepEqual(await recoverExpiredRuns(query, { limit: 999 }), { recovered: 100, limit: 100 });
  const { sql, params } = calls[0];
  assert.match(sql, /status='running'.*lease_until<=UTC_TIMESTAMP\(3\)/s);
  assert.match(sql, /status='queued'/);
  assert.match(sql, /lease_epoch=lease_epoch\+1/);
  assert.match(sql, /SYNC_RUN_POISONED/);
  assert.match(sql, /ORDER BY updated_at ASC, id ASC LIMIT \?/);
  assert.deepEqual(params, [3, 3, 600, 100]);
  await listPoisonedRuns(query, 999);
  assert.match(calls[1].sql, /error_code='SYNC_RUN_POISONED'/);
  assert.deepEqual(calls[1].params, [100]);
});
