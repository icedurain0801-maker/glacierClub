const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('../src/db/repository');

test('parent projection aggregates child counters and distinct contents within the same account', async () => {
  const repo = Object.create(Repository.prototype);
  repo.query = async () => [];
  const projection = await repo.getSyncRunProjection();
  assert.match(projection, /SUM\(progress_child\.fetched_count\)/);
  assert.match(projection, /progress_child\.parent_run_id=r\.id AND progress_child\.account_id=r\.account_id/);
  for (const alias of ['run_posts', 'run_comments', 'run_replies']) {
    assert.ok(projection.includes(`COUNT(DISTINCT ${alias}.content_id)`));
    assert.ok(projection.includes(`JOIN po_sync_run_contents ${alias} ON ${alias}.run_id=progress_child.id`));
  }
});

test('parent contents use child run IDs with existing account, source and community filters', async () => {
  const repo = Object.create(Repository.prototype);
  const calls = [];
  repo.query = async (sql, params) => {
    calls.push({sql, params});
    return calls.length === 1 ? [{id:'child-one'}, {id:'child-two'}] : [{sequence_no:23}];
  };
  const result = await repo.listSyncRunContents('parent', {accountId:'account', sourceId:'source', communityId:'community', after:20, limit:10});
  assert.deepEqual(result, [{sequence_no:23}]);
  assert.deepEqual(calls[0].params, ['parent']);
  assert.deepEqual(calls[1].params, ['parent', 'child-one', 'child-two', 'posts', 20, 'account', 'source', 'community', 10]);
  assert.match(calls[1].sql, /rc\.run_id IN \(\?,\?,\?\)/);
  assert.match(calls[1].sql, /r\.account_id=\?/);
  assert.match(calls[1].sql, /a\.source_id=\?/);
  assert.match(calls[1].sql, /a\.community_id=\?/);
});
