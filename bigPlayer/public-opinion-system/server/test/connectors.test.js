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

test('Q1 request path uses fixed exact HTTPS origins instead of configurable hosts', async () => {
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'evil.example.com' }, {
    credentialContext: { loadApiToken: async () => 'token' },
    fetchImpl: async url => ({ ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: {} }) })
  });
  const q1Source = { config: { baseUrl: 'https://club.q1.com?env=web&gameId=game&gameVersion=1' } };
  await assert.doesNotReject(() => connector.requestQ1('/api/club/v1/auth/user/context', q1Source, 'token'));
  assert.equal(connector.hostAllowed('https://evil.example.com/x'), true);
});

test('Q1 token loading prefers explicit account, then source account, then legacy source', async () => {
  const subjects = [];
  const credentialContext = {
    async loadApiToken(subject, credentialType) {
      subjects.push({ subject, credentialType });
      return 'token';
    }
  };
  const connector = new BigPlayerH5Connector({}, { credentialContext });
  const sourceAccount = { id: 'source-account' };
  const explicitAccount = { id: 'explicit-account' };
  const source = { id: 'source-id', account: sourceAccount };

  await connector.loadApiToken(source, credentialContext, explicitAccount);
  await connector.loadApiToken(source, credentialContext);
  await connector.loadApiToken({ id: 'legacy-source' }, credentialContext);

  assert.deepEqual(subjects, [
    { subject: explicitAccount, credentialType: 'api_token' },
    { subject: sourceAccount, credentialType: 'api_token' },
    { subject: { id: 'legacy-source' }, credentialType: 'api_token' }
  ]);
});

test('Q1 auth refresh reloads the API token with the bound account', async () => {
  const account = { id: 'account-id', platform: 'bigplayer_h5' };
  const source = { id: 'source-id', account, config: { baseUrl: 'https://club.q1.com?env=web&gameId=game&gameVersion=1' } };
  const loadedSubjects = [];
  let requestCount = 0;
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true' }, {
    credentialContext: {
      async loadApiToken(subject) {
        loadedSubjects.push(subject);
        return 'refreshed-token';
      }
    },
    authRefreshCoordinator: { async refresh() {} },
    fetchImpl: async (url, options) => {
      requestCount += 1;
      if (requestCount === 1) return { ok: false, status: 401, url: String(url) };
      assert.equal(options.headers.authorization, 'Bearer refreshed-token');
      return { ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: {} }) };
    }
  });

  await connector.requestQ1('/api/club/v1/auth/user/context', source, 'expired-token');

  assert.deepEqual(loadedSubjects, [account]);
  assert.equal(requestCount, 2);
});

test('Q1 discovery propagates cancellation through requests and auth refresh', async () => {
  let token = 'expired'; const requestSignals = []; let refreshSignal = null;
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_TIMEOUT_MS: '1000' }, {
    credentialContext: { async loadApiToken() { return token; } },
    authRefreshCoordinator: { async refresh({ signal }) { refreshSignal = signal; token = 'fresh'; } },
    fetchImpl: async (url, options) => {
      requestSignals.push(options.signal);
      if (requestSignals.length === 1) return { ok: false, status: 401, url: String(url) };
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
    }
  });
  const controller = new AbortController();
  const discovery = connector.discoverFeeds({ source: { config: { baseUrl: 'https://club.q1.com?env=web&gameId=game&gameVersion=1' } }, account: { id: 'a1' }, signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(Object.assign(new Error('lease lost'), { code: 'SYNC_RUN_LEASE_LOST' }));
  await assert.rejects(discovery, error => error.code === 'CONNECTOR_PAGE_FAILED' && error.cause?.code === 'SYNC_RUN_LEASE_LOST');
  assert.equal(refreshSignal, controller.signal);
  assert.equal(requestSignals.length, 2);
  assert.ok(requestSignals.every(signal => signal !== controller.signal && signal.aborted));
});

test('Q1 request path rejects private, reserved, unsafe-port, and malicious redirect targets', async () => {
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com,club-en.q1.com' }, {
    credentialContext: { loadApiToken: async () => 'token' },
    fetchImpl: async () => ({ ok: true, status: 200, url: 'https://club.q1.com.evil.example/redirect', json: async () => ({ code: 0 }) })
  });
  for (const baseUrl of [
    'https://10.0.0.1?env=web&gameId=game&gameVersion=1',
    'https://192.168.1.1?env=web&gameId=game&gameVersion=1',
    'https://169.254.0.1?env=web&gameId=game&gameVersion=1',
    'https://192.0.2.1?env=web&gameId=game&gameVersion=1',
    'https://[::1]?env=web&gameId=game&gameVersion=1',
    'https://[fe80::1]?env=web&gameId=game&gameVersion=1',
    'https://[fd00::1]?env=web&gameId=game&gameVersion=1',
    'https://club.q1.com:8443?env=web&gameId=game&gameVersion=1',
  ]) {
    await assert.rejects(
      () => connector.requestQ1('/api/club/v1/auth/user/context', { config: { baseUrl } }, 'token'),
      error => error.code === 'H5_URL_OUTSIDE_ALLOWED_HOSTS'
    );
  }
  await assert.rejects(
    () => connector.requestQ1('/api/club/v1/auth/user/context', { config: { baseUrl: 'https://club.q1.com?env=web&gameId=game&gameVersion=1' } }, 'token'),
    error => error.cause?.code === 'H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS'
  );
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
