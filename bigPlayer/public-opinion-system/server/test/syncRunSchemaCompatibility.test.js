const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('../src/db/repository');

const optionalColumns = ['community_id', 'board_id', 'board_name', 'run_scope', 'site_url_snapshot', 'last_request_at'];
const aliases = {
  community_id: ['run_community_id'],
  board_id: ['board_id'],
  board_name: ['board_name'],
  run_scope: ['run_scope'],
  site_url_snapshot: ['site_url_snapshot', 'siteUrl'],
  last_request_at: ['last_request_at', 'lastRequestAt']
};

function isolatedRepo(existingColumns) {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_PORT: 1, DB_NAME: 'sync_run_fixture_never_connects' });
  let poolCalls = 0;
  repo.pool = { async query() { poolCalls += 1; throw new Error('isolated fixture must not connect'); } };
  const calls = [];
  repo.query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('information_schema.COLUMNS')) return [...existingColumns].map(column_name => ({ column_name }));
    if (sql.startsWith('SELECT COUNT(*) AS total')) return [{ total: 1 }];
    if (sql.startsWith('SELECT r.id,')) return [{ id: 'run-fixture', source_id: 'source-fixture' }];
    throw new Error(`unexpected isolated query: ${sql.slice(0, 32)}`);
  };
  return { repo, calls, getPoolCalls: () => poolCalls };
}

for (const [label, present] of [
  ['current schema without 029/030', []],
  ['complete schema', optionalColumns],
  ['partially migrated schema', ['board_id', 'last_request_at']]
]) {
  test(`sync run reads preserve aliases on ${label}`, async () => {
    const { repo, calls, getPoolCalls } = isolatedRepo(present);
    assert.equal((await repo.getSyncRun('run-fixture', { sourceId: 'source-fixture' })).id, 'run-fixture');
    assert.equal((await repo.getLatestSyncRunForSource('source-fixture')).id, 'run-fixture');
    const list = await repo.listSyncRuns({ sourceId: 'source-fixture', page: 1, pageSize: 20 });
    assert.equal(list.total, 1);
    assert.equal(list.items[0].id, 'run-fixture');
    const selects = calls.filter(call => call.sql.startsWith('SELECT r.id,'));
    assert.equal(selects.length, 3);
    assert.equal(calls.filter(call => call.sql.includes('information_schema.COLUMNS')).length, 3);
    for (const { sql } of selects) {
      for (const column of optionalColumns) {
        for (const alias of aliases[column]) {
          const expected = present.includes(column) ? `r.${column} AS ${alias}` : `NULL AS ${alias}`;
          assert.ok(sql.includes(expected), `${label}: ${expected}`);
        }
        if (!present.includes(column)) assert.doesNotMatch(sql, new RegExp(`r\\.${column}\\b`));
      }
      assert.match(sql, /r\.parent_run_id/);
      assert.match(sql, /r\.site_id/);
      assert.match(sql, /r\.trigger_type/);
      assert.match(sql, /r\.window_start/);
      assert.match(sql, /r\.window_end/);
    }
    assert.deepEqual(selects[0].params, ['run-fixture', 'source-fixture']);
    assert.deepEqual(selects[1].params, ['source-fixture']);
    assert.deepEqual(selects[2].params, ['source-fixture', 20, 0]);
    assert.equal(getPoolCalls(), 0);
    assert.ok(calls.every(call => call.sql.startsWith('SELECT ')));
  });
}

test('sync run reads fail closed when schema inspection fails', async () => {
  const { repo, calls, getPoolCalls } = isolatedRepo([]);
  repo.query = async sql => {
    calls.push({ sql });
    throw Object.assign(new Error('fixture metadata denied'), { code: 'ER_ACCESS_DENIED_ERROR' });
  };
  await assert.rejects(repo.listSyncRuns(), { code: 'ER_ACCESS_DENIED_ERROR' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /information_schema\.COLUMNS/);
  assert.equal(getPoolCalls(), 0);
});
