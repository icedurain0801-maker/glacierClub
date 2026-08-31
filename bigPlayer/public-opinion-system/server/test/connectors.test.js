const test = require('node:test');
const assert = require('node:assert/strict');
const { BigPlayerH5Connector } = require('../src/connectors/bigPlayerH5Connector');
const { ExternalPlatformConnector } = require('../src/connectors/externalConnectors');
const { normalizeRawContent } = require('../src/connectors/baseConnector');

test('external connector fails closed without approved credentials', async () => {
  const connector = new ExternalPlatformConnector('taptap', 'TAPTAP', {});
  assert.deepEqual(await connector.healthCheck(), { platform: 'taptap', configured: false, reason: 'disabled by configuration' });
  await assert.rejects(() => connector.collect(), error => error.code === 'CONNECTOR_NOT_CONFIGURED');
});

test('H5 connector requires enabled authorized session', async () => {
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_BASE_URL: 'https://community.example.com' });
  assert.equal((await connector.healthCheck()).configured, false);
  await assert.rejects(() => connector.collect(), /BIGPLAYER_H5_NOT_CONFIGURED/);
});

test('H5 connector reads baseUrl from per-source config and enforces whitelist', async () => {
  const env = { BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'community.example.com', BIGPLAYER_H5_AUTH_COOKIE: 'sid=1' };
  const connector = new BigPlayerH5Connector(env);
  // 白名单内的 baseUrl → configured
  const inside = await connector.healthCheck({ config: { baseUrl: 'https://community.example.com', startPaths: ['/'] } });
  assert.equal(inside.configured, true);
  // 白名单外的 baseUrl（含内网）→ fail-closed
  const outside = await connector.healthCheck({ config: { baseUrl: 'http://127.0.0.1:8080' } });
  assert.equal(outside.configured, false);
  assert.match(outside.reason, /allowed hosts/);
  // 无 baseUrl → fail-closed
  const noUrl = await connector.healthCheck({ config: {} });
  assert.equal(noUrl.configured, false);
  assert.equal(noUrl.reason, 'baseUrl not configured');
});

test('H5 connector hostAllowed reflects exact env whitelist hosts', () => {
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com,a.example.com' });
  assert.equal(connector.hostAllowed('https://club.q1.com/x'), true);
  assert.equal(connector.hostAllowed('https://a.example.com/x'), true);
  assert.equal(connector.hostAllowed('https://club.q1.com.evil.example/x'), false);
  assert.equal(connector.hostAllowed('https://evil.club.q1.com/x'), false);
  assert.equal(connector.hostAllowed('http://127.0.0.1'), false);
});

test('H5 comments capability is available only after probing a real post sample', async () => {
  const calls = [];
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'community.example.com' }, {
    credentialContext: { loadApiToken: async () => 'token' },
    fetchImpl: async url => {
      calls.push(String(url));
      return { ok: true, status: 200, url: String(url), json: async () => String(url).includes('/comments') ? { data: { items: [], hasMore: false } } : { data: { items: [{ id: 'post-1' }], hasMore: false } } };
    }
  });
  const source = { config: { baseUrl: 'https://community.example.com', postsApiUrl: 'https://community.example.com/posts', commentsApiUrl: 'https://community.example.com/posts/:postId/comments' } };
  const result = await connector.detectCapabilities({ source, account: { platform_account_id: 'account-1' }, postId: 'post-1' });
  assert.equal(result.posts.status, 'available');
  assert.equal(result.comments.status, 'available');
  assert.equal(result.comments.samplePostId, 'post-1');
  assert.ok(calls.some(url => url.includes('/comments')));
});

test('H5 comments capability stays configured and untested when no post sample exists', async () => {
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'community.example.com' }, {
    credentialContext: { loadApiToken: async () => 'token' },
    fetchImpl: async url => ({ ok: true, status: 200, url: String(url), json: async () => ({ data: { items: [], hasMore: false } }) })
  });
  const source = { config: { baseUrl: 'https://community.example.com', postsApiUrl: 'https://community.example.com/posts', commentsApiUrl: 'https://community.example.com/posts/:postId/comments' } };
  const result = await connector.detectCapabilities({ source, account: { platform_account_id: 'account-1' } });
  assert.equal(result.comments.status, 'configured');
  assert.equal(result.comments.untested, true);
});
test('H5 comments capability reports unauthorized and limited probe results', async () => {
  for (const response of [{ ok: false, status: 401 }, { ok: false, status: 429 }]) {
    const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'community.example.com' }, { credentialContext: { loadApiToken: async () => 'token' }, fetchImpl: async url => ({ ...response, url: String(url), headers: { get: () => null }, json: async () => ({}) }) });
    const source = { config: { baseUrl: 'https://community.example.com', postsApiUrl: 'https://community.example.com/posts', commentsApiUrl: 'https://community.example.com/posts/:postId/comments' } };
    const result = await connector.detectCapabilities({ source, account: { platform_account_id: 'account-1' }, postId: 'post-1' });
    assert.equal(result.comments.status, response.status === 401 ? 'unauthorized' : 'limited');
  }
});
test('content normalization produces stable fingerprint', () => {
  const first = normalizeRawContent({ externalId: 'p1', sourceUrl: 'https://example.com/p1', title: '标题', body: '正文', authorName: '作者' });
  const second = normalizeRawContent({ externalId: 'p2', sourceUrl: 'https://example.com/p2', title: '标题', body: '正文', authorName: '作者' });
  assert.equal(first.fingerprint, second.fingerprint);
});
