'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BigPlayerH5Connector } = require('../src/connectors/bigPlayerH5Connector');

const source = { id: 'source-1', platform: 'bigplayer_h5', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=g1&gameVersion=1', boardId: '9' } };
const credentials = { async loadApiToken() { return 'fixture-token'; } };

test('BOARD-01/02 falls back to V1 after a V2 server error and returns all 23 fixture feeds', async () => {
  const requests = [];
  const groups = Array.from({ length: 11 }, (_, index) => ({ id: index + 1, type: 0, name: `版块-${index + 1}`, sections: [{ id: index + 101, name: `栏目-${index + 1}` }] }));
  const connector = new BigPlayerH5Connector({}, { credentialContext: credentials, fetchImpl: async url => {
    const parsed = new URL(String(url)); requests.push(parsed.pathname);
    if (parsed.pathname.endsWith('/user/context')) return { ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: { boards: [{ id: 9, name: '主版' }] } }) };
    if (parsed.pathname === '/api/club/v2/auth/board') return { ok: false, status: 500, url: String(url), json: async () => ({ code: 500 }) };
    return { ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: { groups } }) };
  } });
  const feeds = await connector.discoverFeeds({ source, account: { id: 'account-1' }, credentialContext: credentials });
  assert.equal(feeds.length, 23);
  assert.equal(requests.filter(item => item === '/api/club/v2/auth/board').length, 1);
  assert.equal(requests.filter(item => item === '/api/club/v1/auth/board').length, 1);
  assert.equal(new Set(feeds.map(feed => feed.feedKey)).size, 23);
  assert.equal(feeds.filter(feed => feed.endpointKind === 'info').length, 22);
});

for (const status of [403, 404]) test(`board HTTP ${status} fails closed without requesting a fallback`, async () => {
  const requests = [];
  const connector = new BigPlayerH5Connector({}, { credentialContext: credentials, fetchImpl: async url => {
    const pathname = new URL(String(url)).pathname;
    requests.push(pathname);
    if (pathname.endsWith('/user/context')) return { ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: { boards: [{ id: 9, name: '主版' }] } }) };
    return { ok: false, status, url: String(url), json: async () => ({ code: status }) };
  } });
  await assert.rejects(() => connector.discoverFeeds({ source, account: { id: 'account-1' }, credentialContext: credentials }), error => error.code === 'BOARD_NOT_ACCESSIBLE');
  assert.deepEqual(requests, ['/api/club/v1/auth/user/context', '/api/club/v2/auth/board']);
});

test('TYPE/WIN/PAGE use separate activity endpoint, preserve activity type, and enforce [from,to)', async () => {
  const feed = { boardId: '9', pageKind: 'circle', endpointKind: 'activity', groupId: '9', groupType: 1, sectionId: '9', tabName: '全部', type: 3, orderType: null, isUltimate: false };
  feed.feedKey = ['9', 'circle', 'activity', '9', '9', '3', '', '0'].join(':');
  const requests = [];
  const connector = new BigPlayerH5Connector({}, { credentialContext: credentials, fetchImpl: async url => {
    const href = String(url); const parsed = new URL(href); requests.push(href);
    if (parsed.pathname === '/api/club/v1/auth/post/') return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { id: 1, content: [{ type: 0, data: '活动正文' }] } }) };
    return { ok: true, status: 200, url: href, json: async () => ({ code: 0, total: 2, hasMore: false, data: { list: [
      { id: 1, title: '窗口内', createTime: '2026-09-10T16:00:00Z', content: [{ type: 0, data: '摘要' }] },
      { id: 2, title: '右边界', createTime: '2026-09-11T16:00:00Z', content: [{ type: 0, data: '摘要' }] }
    ] } }) };
  } });
  const page = await connector.listFeedContents({ source, feed, limit: 20, credentialContext: credentials, dailyBounded: true, publishedFrom: '2026-09-10T16:00:00Z', publishedTo: '2026-09-11T16:00:00Z' });
  assert.equal(new URL(requests[0]).pathname, '/api/club/v1/auth/post/activity/list');
  assert.deepEqual(page.items.map(item => item.externalId), ['1']);
  assert.equal(page.items[0].contentType, 'activity');
  assert.equal(page.hasMore, false);
});
