'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CommunityProvider } = require('../src/services/communityProvider');

const validCommunity = {
  id: ' community-1 ',
  gameId: ' game-1 ',
  name: ' Community One ',
  status: 'enabled',
  sortOrder: '7',
  regionCode: ' domestic '
};

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, async json() { return body; } };
}

function provider(fetchImpl, env = {}, now = () => 1_000) {
  return new CommunityProvider({
    COMMUNITY_PROVIDER_URL: 'https://provider.example.test/communities',
    COMMUNITY_PROVIDER_TOKEN: ' secret-token ',
    COMMUNITY_PROVIDER_TIMEOUT_MS: '100',
    COMMUNITY_PROVIDER_CACHE_TTL_MS: '1000',
    ...env
  }, { fetchImpl, now });
}

test('community provider sends bearer auth and normalizes direct array payloads', async () => {
  let request;
  const subject = provider(async (url, options) => {
    request = { url, options };
    return response([validCommunity]);
  });

  const items = await subject.getCommunities();

  assert.equal(request.url, 'https://provider.example.test/communities');
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers.authorization, 'Bearer secret-token');
  assert.equal(request.options.headers.accept, 'application/json');
  assert.equal(request.options.redirect, 'error');
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.deepEqual(items, [{ id: 'community-1', gameId: 'game-1', name: 'Community One', status: 'enabled', sortOrder: 7, regionCode: 'domestic' }]);
});

test('community provider accepts wrapped data arrays', async () => {
  const subject = provider(async () => response({ data: [validCommunity] }));
  assert.deepEqual(await subject.getCommunities(), [{ id: 'community-1', gameId: 'game-1', name: 'Community One', status: 'enabled', sortOrder: 7, regionCode: 'domestic' }]);
});

test('community provider rejects invalid payloads and duplicate ids', async (t) => {
  await t.test('invalid item', async () => {
    const subject = provider(async () => response([{ ...validCommunity, status: 'pending' }]));
    await assert.rejects(() => subject.getCommunities(), error => error.code === 'COMMUNITY_PROVIDER_INVALID_RESPONSE' && error.status === 502);
  });

  await t.test('duplicate normalized id', async () => {
    const subject = provider(async () => response([validCommunity, { ...validCommunity, id: 'community-1', name: 'Duplicate' }]));
    await assert.rejects(() => subject.getCommunities(), error => error.code === 'COMMUNITY_PROVIDER_INVALID_RESPONSE' && /duplicate id: community-1/.test(error.message));
  });
});

test('community provider fails closed for non-HTTPS and incomplete configuration', async (t) => {
  for (const [name, env] of [
    ['HTTP URL', { COMMUNITY_PROVIDER_URL: 'http://provider.example.test/communities' }],
    ['missing URL', { COMMUNITY_PROVIDER_URL: '' }],
    ['missing token', { COMMUNITY_PROVIDER_TOKEN: '' }]
  ]) {
    await t.test(name, async () => {
      let called = false;
      const subject = provider(async () => { called = true; return response([]); }, env);
      assert.equal(subject.configured(), false);
      await assert.rejects(() => subject.getCommunities(), error => error.code === 'COMMUNITY_PROVIDER_NOT_CONFIGURED' && error.status === 503);
      assert.equal(called, false);
    });
  }
});

test('community provider aborts timed-out requests and reports timeout', async () => {
  const subject = provider((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  }), { COMMUNITY_PROVIDER_TIMEOUT_MS: '5' });

  await assert.rejects(() => subject.getCommunities(), error => error.code === 'COMMUNITY_PROVIDER_TIMEOUT' && error.status === 504);
});

test('community provider caches results and coalesces concurrent requests', async () => {
  let calls = 0;
  let releaseFirst;
  let now = 10_000;
  const subject = provider(async () => {
    calls += 1;
    if (calls === 1) await new Promise(resolve => { releaseFirst = resolve; });
    return response([{ ...validCommunity, id: `community-${calls}` }]);
  }, {}, () => now);

  const first = subject.getCommunities();
  const concurrent = subject.getCommunities();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  releaseFirst();
  assert.strictEqual(await first, await concurrent);

  const cached = await subject.getCommunities();
  assert.equal(calls, 1);
  assert.equal(cached[0].id, 'community-1');

  now += 1_001;
  const refreshed = await subject.getCommunities();
  assert.equal(calls, 2);
  assert.equal(refreshed[0].id, 'community-2');
});
