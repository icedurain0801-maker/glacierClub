const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const root = process.env.Q1_LANGUAGE_TEST_RUNTIME || path.resolve(__dirname, '..');
const { BigPlayerH5Connector } = require(path.join(root, 'src/connectors/bigPlayerH5Connector'));
const { createQ1LanguageResolver } = require(path.join(root, 'src/connectors/q1LanguageResolver'));
const languages = [{ languageID: 2, code: 'en-US' }, { languageID: 9, code: 'ko-KR' }, { languageID: 16, code: 'ja-jp' }, { languageID: 4, code: '' }];
const response = (data, code = 0) => ({ ok: true, json: async () => ({ code, data }) });
const site = (id, lang = '') => new URL(`https://club-en.q1.com/?env=web&gameId=2162&gameVersion=2162-US-ZS&languageId=${id}${lang ? '&lang=' + lang : ''}`);
test('actual connector uses official ID mapping even when lang is missing or stale', async () => {
  let lookups = 0; const headers = [];
  const connector = new BigPlayerH5Connector({}, { fetchImpl: async (url, options) => {
    if (url.pathname === '/api/club/v1/setting/language') { lookups++; assert.equal(options.headers.authorization, undefined); return response(languages); }
    headers.push(options.headers['content-language']); return response({ items: [] });
  } });
  for (const id of [2, 9, 16]) for (const lang of ['', 'ja-jp']) await connector.requestQ1('/api/club/v1/auth/post/list', { config: { baseUrl: site(id, lang).href } }, 'test-token');
  assert.deepEqual(headers, ['en-US', 'en-US', 'ko-KR', 'ko-KR', 'ja-jp', 'ja-jp']); assert.equal(lookups, 1);
});
test('mainland and legacy overseas without languageId preserve current headers without lookup', async () => {
  const resolve = createQ1LanguageResolver(() => { throw new Error('unexpected lookup'); });
  assert.equal(await resolve(new URL('https://club.q1.com/?languageId=2'), 'zh-Hans'), 'zh-Hans');
  assert.equal(await resolve(new URL('https://club-en.q1.com/?lang=ko-KR'), 'ko-KR'), 'ko-KR');
});
test('unsupported ID cannot silently become Chinese or Japanese', async () => {
  const resolve = createQ1LanguageResolver(async () => response(languages));
  for (const id of [4, 999]) await assert.rejects(resolve(site(id), 'zh-Hans'), { code: 'Q1_LANGUAGE_NOT_SUPPORTED' });
});
test('configuration lookup failure retries rather than caching a default', async () => {
  let calls = 0; const resolve = createQ1LanguageResolver(async () => { if (++calls === 1) throw Error('network'); return response(languages); });
  assert.equal(await resolve(site(9), 'ja-jp'), 'ko-KR');
  assert.equal(calls, 2);
});
test('transient language endpoint outage uses the last successful mapping during a short grace window', async () => {
  let time = 0, calls = 0; const resolve = createQ1LanguageResolver(async () => { calls += 1; if (calls > 1) throw Error('temporary outage'); return response(languages); }, { now: () => time, ttlMs: 10, timeoutMs: 20 });
  assert.equal(await resolve(site(9), ''), 'ko-KR'); time = 11; assert.equal(await resolve(site(9), ''), 'ko-KR');
  assert.equal(calls, 3);
});
test('persistent language endpoint outage still fails closed without a prior mapping', async () => {
  let calls = 0; const resolve = createQ1LanguageResolver(async () => { calls += 1; throw Error('network'); }, { timeoutMs: 20 });
  await assert.rejects(resolve(site(9), 'ja-jp'), { code: 'Q1_LANGUAGE_CONFIG_UNAVAILABLE' });
  assert.equal(calls, 2);
});
test('a successful mapping is refreshed after the grace window expires', async () => {
  let time = 0, calls = 0; const resolve = createQ1LanguageResolver(async () => { calls += 1; return response(languages); }, { now: () => time, ttlMs: 10 });
  assert.equal(await resolve(site(9), ''), 'ko-KR'); time = 1800001; assert.equal(await resolve(site(9), ''), 'ko-KR');
  assert.equal(calls, 2);
});
test('configuration lookup can recover on a later invocation', async () => {
  let calls = 0; const resolve = createQ1LanguageResolver(async () => { if (++calls <= 3) throw Error('network'); return response(languages); });
  await assert.rejects(resolve(site(9), 'ja-jp'), { code: 'Q1_LANGUAGE_CONFIG_UNAVAILABLE' });
  assert.equal(await resolve(site(9), 'ja-jp'), 'ko-KR'); assert.equal(calls, 4);
});
test('malformed config, duplicate ID, invalid ID and unsafe redirect are rejected', async () => {
  await assert.rejects(createQ1LanguageResolver(async () => response({}))(site(2), ''), { code: 'Q1_LANGUAGE_CONFIG_INVALID' });
  await assert.rejects(createQ1LanguageResolver(async () => response([...languages, languages[0]]))(site(2), ''), { code: 'Q1_LANGUAGE_CONFIG_INVALID' });
  await assert.rejects(createQ1LanguageResolver(async () => ({ ...response(languages), url: 'https://example.com/' }))(site(2), ''), { code: 'H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS' });
  await assert.rejects(createQ1LanguageResolver(async () => response(languages))(site('2&languageId=9'), ''), { code: 'Q1_LANGUAGE_ID_INVALID' });
});
test('cache refresh follows changed upstream language mapping', async () => {
  let time = 0, calls = 0; const resolve = createQ1LanguageResolver(async () => { calls++; return response([{ languageID: 2, code: calls === 1 ? 'en-US' : 'en-GB' }]); }, { now: () => time, ttlMs: 10 });
  assert.equal(await resolve(site(2), ''), 'en-US'); time = 11; assert.equal(await resolve(site(2), ''), 'en-GB'); assert.equal(calls, 2);
});
test('cancelled lookup emits cancellation and sends no request', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createQ1LanguageResolver(() => { throw Error('unexpected'); })(site(2), '', controller.signal), { code: 'COLLECTION_CANCELLED' });
});

test('dedicated overseas language lookup honors the longer transport deadline', async () => {
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_TIMEOUT_MS: '60000' }, {
    overseasSiteSession: { tokenFor: async () => 'test-token' },
    fetchImpl: async (url, options) => {
      if (url.pathname === '/api/club/v1/setting/language') {
        await new Promise(resolve => setTimeout(resolve, 11000));
        assert.equal(options.signal.aborted, false);
        return response(languages);
      }
      assert.equal(options.headers['content-language'], 'ko-KR');
      return response({items: []});
    }
  });
  await connector.requestQ1('/api/club/v1/auth/post/list', { config: {baseUrl: site(9).href} }, 'test-token');
});
