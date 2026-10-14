const test = require('node:test');
const assert = require('node:assert/strict');
const { BigPlayerH5Connector } = require('../src/connectors/bigPlayerH5Connector');
const { normalizeSiteUrls } = require('../src/services/bigplayerSiteConfig');
const { isBigPlayerLoginUrl } = require('../../login-session-service/src/adapters/bigPlayerH5Playwright');
const url = 'https://club.iyogames.cn/?env=web&gameId=2144&gameVersion=2144-CN-ZS&lang=zh-CN';
const env = { BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com,club-en.q1.com' };
const credentials = { async loadApiToken() { return 'fixture-token'; } };
test('mainland alternate origin passes source validation; overseas-only scope stays restricted', () => {
  const c = new BigPlayerH5Connector(env);
  assert(c.hostAllowed(url));
  assert.equal(normalizeSiteUrls({ siteUrls: [url] }, { allowedHosts: c.allowedHosts }).baseUrl, url);
  for (const bad of ['http://club.iyogames.cn/', 'https://club.iyogames.cn:8443/', 'https://club.iyogames.cn.evil.test/', 'https://a:secret@club.iyogames.cn/', 'https://club.iyogames.cn/#x']) assert.equal(c.hostAllowed(bad), false);
  assert.equal(new BigPlayerH5Connector({ BIGPLAYER_H5_ALLOWED_HOSTS: 'club-en.q1.com' }).hostAllowed(url), false);
});
test('alternate origin uses Q1 board discovery and comment contracts with same-origin enforcement', async () => {
  const calls = [];
  const connector = new BigPlayerH5Connector(env, { credentialContext: credentials, fetchImpl: async input => {
    const u = new URL(input); calls.push(u); assert.equal(u.origin, 'https://club.iyogames.cn');
    const data = u.pathname.endsWith('/user/context') ? { boards: [{ id: 4, name: '欢乐战三国' }] }
      : u.pathname.endsWith('/board') ? { groups: [{ id: 1, type: 0, name: '讨论', sections: [{ id: 10, name: '综合' }] }] }
        : [{ id: 100, content: '评论正文', createTime: '2026-10-12T00:00:00Z' }];
    return { ok: true, status: 200, url: u.toString(), json: async () => ({ code: 0, data, total: 1, hasMore: false }) };
  } });
  const source = { id: 'fixture-source', platform: 'bigplayer_h5', region_code: 'domestic', config: { baseUrl: url, boardId: '4' } };
  const feeds = await connector.discoverFeeds({ source, credentialContext: credentials });
  assert(feeds.length); assert(feeds.every(f => f.boardId === '4'));
  const comments = await connector.listComments({ source, postId: '987', credentialContext: credentials, limit: 20 });
  assert.equal(comments.items[0].externalId, '100');
  assert(calls.some(u => u.pathname === '/api/club/v1/auth/comment/987'));
  const redirected = new BigPlayerH5Connector(env, { credentialContext: credentials, fetchImpl: async () => ({ ok: true, status: 200, url: 'https://club.q1.com/api/club/v1/auth/user/context', json: async () => ({ code: 0, data: {} }) }) });
  await assert.rejects(() => redirected.discoverFeeds({ source, credentialContext: credentials }), e => e.cause?.code === 'H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS');
});
test('login iframe supports exact iyogames host and rejects lookalikes', () => {
  for (const good of ['https://login1.iyogames.cn/h5/account.html', 'https://login1.q1.com/h5/account.html', 'http://login.dev.q1.com/h5/account.html']) assert(isBigPlayerLoginUrl(good));
  for (const bad of ['https://login1.iyogames.cn.evil.test/', 'https://evil.test/?next=https://login1.q1.com', 'http://login1.iyogames.cn/', 'https://user:secret@login1.iyogames.cn/', 'https://login1.iyogames.cn:8443/']) assert.equal(isBigPlayerLoginUrl(bad), false);
});
