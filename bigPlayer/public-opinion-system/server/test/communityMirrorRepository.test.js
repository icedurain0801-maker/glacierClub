'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('../src/db/repository');

function repositoryWithTransaction(games) {
  const executed = [];
  let released = false;
  const conn = {
    async beginTransaction() { executed.push({ sql: 'BEGIN', params: [] }); },
    async query(sql, params = []) {
      executed.push({ sql, params });
      if (sql.startsWith('SELECT id, region_code FROM po_games')) return [games];
      return [{ affectedRows: 1 }];
    },
    async commit() { executed.push({ sql: 'COMMIT', params: [] }); },
    async rollback() { executed.push({ sql: 'ROLLBACK', params: [] }); },
    release() { released = true; }
  };
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  repo.pool = { async getConnection() { return conn; } };
  return { repo, executed, released: () => released };
}

test('syncCommunityMirror upserts rows, disables absent rows, and commits', async () => {
  const { repo, executed, released } = repositoryWithTransaction([
    { id: 'game-1', region_code: 'domestic' },
    { id: 'game-2', region_code: 'overseas' }
  ]);
  const items = [
    { id: 'community-1', gameId: 'game-1', name: 'Domestic', status: 'enabled', sortOrder: 1, regionCode: 'domestic' },
    { id: 'community-2', gameId: 'game-2', name: 'Overseas', status: 'disabled', sortOrder: 9, regionCode: null }
  ];

  const result = await repo.syncCommunityMirror(items);

  assert.deepEqual(result, { synchronized: 2 });
  assert.equal(executed[0].sql, 'BEGIN');
  const gameLookup = executed.find(call => call.sql.startsWith('SELECT id, region_code FROM po_games'));
  assert.match(gameLookup.sql, /WHERE id IN \(\?,\?\) FOR UPDATE/);
  assert.deepEqual(gameLookup.params, ['game-1', 'game-2']);

  const upserts = executed.filter(call => call.sql.startsWith('INSERT INTO po_communities'));
  assert.equal(upserts.length, 2);
  assert.match(upserts[0].sql, /ON DUPLICATE KEY UPDATE/);
  assert.deepEqual(upserts.map(call => call.params), [
    ['community-1', 'game-1', 'Domestic', 'enabled', 1],
    ['community-2', 'game-2', 'Overseas', 'disabled', 9]
  ]);

  const disable = executed.find(call => call.sql.startsWith("UPDATE po_communities SET status='disabled'"));
  assert.match(disable.sql, /WHERE id NOT IN \(\?,\?\) AND status<>'disabled'/);
  assert.deepEqual(disable.params, ['community-1', 'community-2']);
  assert.equal(executed.at(-1).sql, 'COMMIT');
  assert.equal(executed.some(call => call.sql === 'ROLLBACK'), false);
  assert.equal(released(), true);
});

test('syncCommunityMirror rolls back for unknown game', async () => {
  const { repo, executed, released } = repositoryWithTransaction([{ id: 'game-1', region_code: 'domestic' }]);

  await assert.rejects(
    () => repo.syncCommunityMirror([{ id: 'community-x', gameId: 'missing-game', name: 'Unknown', status: 'enabled', sortOrder: 0, regionCode: null }]),
    error => error.code === 'COMMUNITY_PROVIDER_UNKNOWN_GAME' && /missing-game/.test(error.message)
  );

  assert.equal(executed.some(call => call.sql.startsWith('INSERT INTO po_communities')), false);
  assert.equal(executed.some(call => call.sql === 'COMMIT'), false);
  assert.equal(executed.at(-1).sql, 'ROLLBACK');
  assert.equal(released(), true);
});

test('syncCommunityMirror rolls back for region mismatch', async () => {
  const { repo, executed, released } = repositoryWithTransaction([{ id: 'game-1', region_code: 'domestic' }]);

  await assert.rejects(
    () => repo.syncCommunityMirror([{ id: 'community-1', gameId: 'game-1', name: 'Wrong region', status: 'enabled', sortOrder: 0, regionCode: 'overseas' }]),
    error => error.code === 'COMMUNITY_PROVIDER_REGION_MISMATCH' && /community-1/.test(error.message)
  );

  assert.equal(executed.some(call => call.sql.startsWith('INSERT INTO po_communities')), false);
  assert.equal(executed.some(call => call.sql === 'COMMIT'), false);
  assert.equal(executed.at(-1).sql, 'ROLLBACK');
  assert.equal(released(), true);
});
