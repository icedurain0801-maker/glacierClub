const test = require('node:test');
const assert = require('node:assert/strict');
const { BigPlayerH5Connector } = require('../src/connectors/bigPlayerH5Connector');
const { boardIdOf, boardRunIdentity } = require('../../shared/bigPlayerBoard');

const source = boardId => ({ id: 'source-one', community_id: 'community-one', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS', boardId } });

test('board identity isolates source, community, board, scope and window', () => {
  const base = { sourceId: 's1', communityId: 'c1', boardId: '2', windowStart: '2026-09-23T00:00:00Z', windowEnd: '2026-09-24T00:00:00Z' };
  const key = boardRunIdentity(base);
  assert.equal(key, boardRunIdentity({ ...base }));
  for (const change of [{ communityId: 'c2' }, { boardId: '3' }, { sourceId: 's2' }, { scope: 'site' }, { windowEnd: '2026-09-25T00:00:00Z' }, { siteId: 'site-2' }]) assert.notEqual(key, boardRunIdentity({ ...base, ...change }));
  assert.equal(boardIdOf(source('2')), '2');
  for (const invalid of ['', '0', '-1', '2.5', 'NaN']) assert.equal(boardIdOf(source(invalid)), null);
});

test('Q1 source discovers only its configured authorized board', async () => {
  const requested = [];
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: { loadApiToken: async () => 'test-token' },
    fetchImpl: async url => {
      const parsed = new URL(String(url)); requested.push(parsed);
      if (parsed.pathname.endsWith('/user/context')) return { ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: { gameBoards: [{ id: 2, name: '超能世界' }, { id: 3, name: '其他版块' }] } }) };
      return { ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: { groups: [{ id: 10, type: 0, sections: [{ id: 11, name: '公告' }] }] } }) };
    }
  });
  const feeds = await connector.discoverFeeds({ source: source('2'), account: { id: 'account-one', source_id: 'source-one' } });
  assert.ok(feeds.length > 1);
  assert.ok(feeds.every(feed => feed.boardId === '2' && feed.boardName === '超能世界'));
  assert.deepEqual(requested.filter(url => /auth\/board$/.test(url.pathname)).map(url => url.searchParams.get('id')), ['2']);
  requested.length = 0;
  await assert.rejects(() => connector.discoverFeeds({ source: source('4'), account: { id: 'account-one', source_id: 'source-one' } }), error => error.code === 'BOARD_NOT_ACCESSIBLE');
  assert.equal(requested.filter(url => /auth\/board$/.test(url.pathname)).length, 0);
  await assert.rejects(() => connector.discoverFeeds({ source: source(''), account: { id: 'account-one', source_id: 'source-one' } }), error => error.code === 'BOARD_ID_REQUIRED');
});
