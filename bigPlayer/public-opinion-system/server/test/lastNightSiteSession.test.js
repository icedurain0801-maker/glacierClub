'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createIsolatedLastNightSiteSession } = require('../src/connectors/lastNightSiteSession');
const { BigPlayerH5Connector } = require('../src/connectors/bigPlayerH5Connector');
const source = languageId => ({ id: '081a16d2-5545-4afd-9c65-e04777e4540b', account: { id: 'fixture-account' },
  config: { baseUrl: `https://club-en.q1.com/?gameId=2177&gameVersion=2177-US-ZS&languageId=${languageId}`, boardId: '100017' } });
const response = (url, payload) => ({ ok: true, status: 200, url: String(url), json: async () => payload });

test('isolated authorized flow partitions in-memory tokens and reuses existing context/board/feed parser', async () => {
  const requests = [], evidence = [];
  const rootToken = 'fixture-root+token/&=';
  const transport = async (url, options) => {
    requests.push({ url: new URL(url), options });
    if (url.pathname.endsWith('/setting/language')) return response(url, { code: 0, data: [{ languageID: 2, code: 'en-US' }, { languageID: 9, code: 'ko-KR' }, { languageID: 16, code: 'ja-jp' }] });
    if (url.pathname.endsWith('/login/token')) {
      assert.equal(url.searchParams.get('token'), rootToken);
      assert.equal(url.searchParams.get('sdkToken'), '');
      assert.equal(options.headers.authorization, rootToken);
      return response(url, { code: 0, data: { token: `fixture-site-${url.searchParams.get('languageId')}` } });
    }
    const data = url.pathname.endsWith('/user/context') ? { gameBoards: [{ id: 100017 }] }
      : url.pathname.endsWith('/auth/board') ? { groups: [{ id: 10, type: 0, sections: [{ id: 11, name: 'Fixture' }] }] }
      : url.pathname.endsWith('/auth/post/') ? {id:'fixture-post',content:'fixture full text'}
      : { items: [{id:'fixture-post',title:'Fixture',content:'fixture summary',createTime:'2026-10-09T00:00:00Z',boardId:100017}], hasMore: false, total: 1 };
    return response(url, { code: 0, data });
  };
  const session = createIsolatedLastNightSiteSession({ isolated: true, transport });
  const connector = new BigPlayerH5Connector({}, { fetchImpl: transport, isolatedSiteSession: session,
    credentialContext: { loadApiToken: async () => rootToken } });
  for (const language of [2, 9, 16]) {
    const current = { ...source(language), __recordHttpRequest: item => evidence.push(item) };
    const feeds = await connector.discoverFeeds({ source: current });
    assert.ok(feeds.feeds?.length || feeds.length || feeds.boards);
    const own = requests.filter(item => !item.url.pathname.endsWith('/login/token')).slice(-2);
    assert.ok(own.every(item => item.options.headers.authorization === `fixture-site-${language}`));
    assert.ok(own.every(item => !item.url.searchParams.has('languageId')));
    const page = await connector.listFeedContents({source:current,feed:feeds[0],limit:20});
    assert.equal(page.items[0].externalId,'fixture-post');
    assert.equal(page.items[0].boardId,'100017');
    const feedRequest=requests.findLast(item=>item.url.pathname.endsWith('/merged-list'));
    assert.equal(feedRequest.options.headers.authorization,`fixture-site-${language}`);
    assert.equal(feedRequest.url.searchParams.get('boardId'),'100017');
    assert.equal(feedRequest.url.searchParams.has('languageId'),false);
  }
  assert.equal(requests.filter(item => item.url.pathname.endsWith('/login/token')).length, 3);
  assert.ok(!JSON.stringify(evidence).includes(rootToken));
  assert.ok(!JSON.stringify(evidence).includes('fixture-site-'));
  session.clear();
});

test('tourist, invalid business codes and missing token stop before context with safe errors', async () => {
  for (const payload of [{ code: 1, data: { token: 'fixture-tourist' } }, ...[null, false, '', '0', 2, undefined].map(code => ({ code, data: { token: 'fixture-secret' } })), { code: 0, data: {} }]) {
    let calls = 0;
    const transport = async url => { calls++; return response(url, payload); };
    const session = createIsolatedLastNightSiteSession({ isolated: true, transport });
    const connector = new BigPlayerH5Connector({}, { fetchImpl: transport, isolatedSiteSession: session });
    await assert.rejects(connector.requestQ1('/api/club/v1/auth/user/context', source(2), 'fixture-root'), error => {
      assert.equal(error.code, payload.code === 1 ? 'Q1_TOURIST_LOGIN' : payload.code === 0 ? 'MALFORMED_RESPONSE' : 'Q1_SITE_AUTH_REJECTED');
      assert.ok(!JSON.stringify(error).includes('fixture-')); return true;
    });
    assert.equal(calls, 1);
  }
});

test('scope, production transport, cancellation and redirect fail closed', async () => {
  assert.throws(() => createIsolatedLastNightSiteSession({ isolated: true, transport: globalThis.fetch }), { code: 'PRODUCTION_EXECUTION_DISABLED' });
  let calls = 0;
  const session = createIsolatedLastNightSiteSession({ isolated: true, transport: async url => { calls++; return response('https://club.q1.com/api', { code: 0, data: { token: 'fixture-site' } }); } });
  await assert.rejects(session.tokenFor({ ...source(2), id: 'other' }, 'fixture-root'), { code: 'LAST_NIGHT_SITE_SCOPE_MISMATCH' });
  await assert.rejects(session.tokenFor(source('invalid'), 'fixture-root'), { code: 'LAST_NIGHT_SITE_SCOPE_MISMATCH' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(session.tokenFor(source(2), 'fixture-root', controller.signal), { code: 'COLLECTION_CANCELLED' });
  assert.equal(calls, 0);
  await assert.rejects(session.tokenFor(source(2), 'fixture-root'), { code: 'H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS' });
  assert.equal(calls, 1);
});

test('rejected auth invalidates cache without refreshing shared credentials; transport error does not leak URL', async () => {
  let exchanges = 0, refreshes = 0;
  const transport = async url => url.pathname.endsWith('/setting/language')
    ? response(url, { code: 0, data: [{ languageID: 2, code: 'en-US' }] })
    : url.pathname.endsWith('/login/token')
    ? (exchanges++, response(url, { code: 0, data: { token: 'fixture-site' } }))
    : { ok: false, status: 401, url: String(url) };
  const session = createIsolatedLastNightSiteSession({ isolated: true, transport });
  const connector = new BigPlayerH5Connector({}, { fetchImpl: transport, isolatedSiteSession: session,
    authRefreshCoordinator: { refresh: async () => { refreshes++; } } });
  for (let i = 0; i < 2; i++) await assert.rejects(connector.requestQ1('/api/club/v1/auth/user/context', source(2), 'fixture-root'));
  assert.equal(exchanges, 2); assert.equal(refreshes, 0);
  const failed = createIsolatedLastNightSiteSession({ isolated: true, transport: async url => { throw new Error(String(url)); } });
  await assert.rejects(failed.tokenFor(source(2), 'fixture-root-secret'), error => !JSON.stringify(error).includes('fixture-root-secret') && !error.message.includes('token='));
});
