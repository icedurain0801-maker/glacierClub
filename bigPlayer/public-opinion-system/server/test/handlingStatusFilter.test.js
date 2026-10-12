const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('../src/db/repository');

test('handling state filters are applied before pagination and use the same current severity and record rules', async () => {
  for (const handlingStatus of ['pending', 'processed', 'not_required']) {
    const repo = Object.create(Repository.prototype), calls = [];
    repo.query = async (sql, params) => { calls.push({ sql, params }); return []; };
    const filters = { handlingStatus, regionCode: 'domestic', communityId: 'community', publishedFrom: '2026-10-10T16:00:00Z', publishedTo: '2026-10-11T16:00:00Z', page: 2, pageSize: 20 };
    await repo.listContents(filters); await repo.listContentTree({ ...filters, contentType: 'comment' }); await repo.countContents(filters);
    assert.equal(calls.length, 3);
    for (const { sql, params } of calls) {
      assert.match(sql, /severity IN \('attention','negative','urgent'\)/);
      if (handlingStatus === 'not_required') assert.match(sql, /COALESCE\(.+severity IN .+,0\)=0/);
      else assert.match(sql, handlingStatus === 'pending' ? /NOT EXISTS \(SELECT 1 FROM po_content_handlings ch/ : /AND EXISTS \(SELECT 1 FROM po_content_handlings ch/);
      assert.match(sql, /ch\.content_id=c\.id|COALESCE/);
      assert.ok(params.includes('community'));
    }
    assert.match(calls[2].sql, /LEFT JOIN po_analyses a/);
    assert.deepEqual(calls[0].params.slice(-2), [20, 20]);
    assert.deepEqual(calls[1].params.slice(-2), [20, 20]);
  }
});

test('invalid handling state is rejected before executing SQL', async () => {
  const repo = Object.create(Repository.prototype);
  repo.query = async () => { throw Error('unexpected database query'); };
  for (const method of ['listContents', 'listContentTree', 'countContents']) await assert.rejects(repo[method]({ handlingStatus: 'invalid' }), { code: 'INVALID_INPUT' });
});
