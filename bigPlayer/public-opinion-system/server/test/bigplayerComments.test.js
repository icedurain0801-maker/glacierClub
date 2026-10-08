'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BigPlayerH5Connector } = require('../src/connectors/bigPlayerH5Connector');

const source = { id: 'source-1', platform: 'bigplayer_h5', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=g1&gameVersion=1' } };
const credentials = { async loadApiToken() { return 'fixture-token'; } };

function connectorWithComments() {
  const calls = [];
  const connector = new BigPlayerH5Connector({}, { credentialContext: credentials, fetchImpl: async url => {
    const href = String(url); const parsed = new URL(href); calls.push(href);
    const page = parsed.searchParams.get('offsetId') === '0'
      ? { total: 3, hasMore: true, data: [{ id: 101, content: '根评论', createTime: '2026-09-10T17:00:00Z', commentCount: 3, replies: [{ id: 201, content: '窗口内回复', createTime: '2026-09-10T18:00:00Z' }, { id: 202, content: '右边界回复', createTime: '2026-09-11T16:00:00Z' }] }] }
      : { total: 3, hasMore: false, data: [{ id: 102, content: '窗口外评论', createTime: '2026-09-09T15:00:00Z' }] };
    return { ok: true, status: 200, url: href, json: async () => ({ code: 0, ...page }) };
  } });
  return { connector, calls };
}

test('COMMENT-01/02/04 include post and activity roots with reply linkage and declared/actual counts separated', async () => {
  for (const rootId of ['post-root', 'activity-root']) {
    const { connector, calls } = connectorWithComments();
    const first = await connector.listComments({ source, postId: rootId, credentialContext: credentials, limit: 20, dailyBounded: true, publishedFrom: '2026-09-10T16:00:00Z', publishedTo: '2026-09-11T16:00:00Z' });
    assert.match(calls[0], new RegExp(`/api/club/v1/auth/comment/${rootId}`));
    assert.equal(first.raw.total, 3);
    assert.equal(first.items.length, 1);
    assert.deepEqual(first.items.map(item => [item.externalId, item.rootPlatformContentId, item.platformParentId, item.contentDepth]), [['101', rootId, null, 1]]);
    assert.deepEqual(first.items[0].replies.map(item => [item.externalId, item.rootPlatformContentId, item.platformParentId, item.contentDepth]), [['201', rootId, '101', 2]]);
    assert.equal(first.items.length + first.items[0].replies.length, 2);
    assert.deepEqual(first.replyTargets, [{ postId: rootId, commentId: '101', sortType: 0 }]);
    assert.equal(first.hasMore, true);
    const second = await connector.listComments({ source, postId: rootId, credentialContext: credentials, cursor: first.nextCursor, limit: 20, dailyBounded: true, publishedFrom: '2026-09-10T16:00:00Z', publishedTo: '2026-09-11T16:00:00Z' });
    assert.equal(second.items.length, 0);
    assert.equal(second.hasMore, false);
  }
});

test('COMMENT-03 filters replies by their own timestamp using the same half-open UTC window', async () => {
  const { connector } = connectorWithComments();
  const page = await connector.listComments({ source, postId: 'post-root', credentialContext: credentials, limit: 20, dailyBounded: true, publishedFrom: '2026-09-10T16:00:00Z', publishedTo: '2026-09-11T16:00:00Z' });
  assert.equal(page.items.some(item => item.externalId === '202'), false);
  assert.equal(page.items.every(item => Date.parse(item.publishedAt) >= Date.parse('2026-09-10T16:00:00Z') && Date.parse(item.publishedAt) < Date.parse('2026-09-11T16:00:00Z')), true);
});
