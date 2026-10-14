const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('../src/db/repository');
function harness(rows = [], failInsert = false) {
  const calls = []; let tail = Promise.resolve();
  const repo = Object.create(Repository.prototype);
  repo.pool = { getConnection: async () => {
    let unlock;
    return { beginTransaction: async () => {}, commit: async () => { unlock?.(); unlock = null; }, rollback: async () => { calls.push('rollback'); unlock?.(); unlock = null; }, release: () => calls.push('release'), query: async (sql, args) => {
      calls.push(sql);
      if (sql.startsWith('SELECT id FROM po_accounts')) { const previous = tail; tail = new Promise(r => { unlock = r; }); await previous; return [[{ id: args[0] }]]; }
      if (sql.startsWith('SELECT id FROM po_sync_checkpoints')) return [[...rows].sort((a,b) => Number(b.status === 'completed') - Number(a.status === 'completed') || Number(b.cursor != null) - Number(a.cursor != null) || a.id.localeCompare(b.id)).slice(0,1)];
      if (sql.startsWith('INSERT')) { if (failInsert) throw new Error('insert failure'); rows.push({ id: args[0], status: 'idle' }); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE')) { const row = rows.find(r => r.id === args[3]); if (row.status === 'running') return [{ affectedRows: 0 }]; row.status = 'running'; row.lease_owner = args[0]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('SELECT *')) return [[rows.find(r => r.id === args[0])]];
      throw Error(sql);
    } };
  } };
  return { repo, rows, calls };
}
const input = { accountId: 'account', siteId: null, taskKind: 'q1_feed', taskKey: 'feed', syncScope: 'posts', leaseOwner: 'first' };
test('concurrent nullable-site checkpoint claims create one record and grant one lease', async () => {
  const h = harness(); const claims = await Promise.all([h.repo.claimSyncCheckpoint(input), h.repo.claimSyncCheckpoint({ ...input, leaseOwner: 'second' })]);
  assert.equal(h.rows.length, 1); assert.equal(claims.filter(Boolean).length, 1); assert.equal(h.rows[0].lease_owner, 'first');
});
test('legacy duplicate checkpoints are preserved and only canonical id is claimed', async () => {
  const h = harness([{ id: 'a', status: 'failed', cursor: 'saved' }, { id: 'b', status: 'idle' }]);
  const claimed = await h.repo.claimSyncCheckpoint(input); assert.equal(claimed.id, 'a'); assert.equal(claimed.cursor, 'saved'); assert.equal(h.rows[1].status, 'idle'); assert.equal(h.rows.length, 2);
  assert(h.calls.some(sql => sql.includes("ORDER BY (status='completed') DESC,(`cursor` IS NOT NULL) DESC,id LIMIT 1 FOR UPDATE")));
});
test('checkpoint creation rolls back and releases connection on failure', async () => {
  const h = harness([], true); await assert.rejects(h.repo.claimSyncCheckpoint(input), /insert failure/); assert(h.calls.includes('rollback')); assert(h.calls.includes('release'));
});

test('canonical checkpoint retains saved progress over a lower-id empty duplicate', async () => {
  const h = harness([{ id: 'a', status: 'idle' }, { id: 'z', status: 'failed', cursor: 'saved' }]);
  const claimed = await h.repo.claimSyncCheckpoint(input); assert.equal(claimed.id, 'z'); assert.equal(claimed.cursor, 'saved');
});
