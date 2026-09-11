const test = require('node:test');
const assert = require('node:assert/strict');
const { encrypt } = require('../src/integrations/credentialCipher');
const { CredentialContext } = require('../src/services/credentialContext');
const { BigPlayerH5Connector } = require('../src/connectors/bigPlayerH5Connector');
const { DouyinConnector } = require('../src/connectors/douyinConnector');
const { DouyinOAuthService } = require('../src/services/douyinOAuthService');
const { ConnectorPageError, ConnectorPageResult } = require('../src/connectors/baseConnector');
const q1PostDetail916457 = require('./fixtures/q1-post-detail-916457.json');

const keyEnv = { CREDENTIAL_ENC_KEY: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90' };
function credentialContext(token = 'account-token', patch = {}) {
  const row = { id: 'cr1', source_id: 's1', status: 'active', expire_at: '2030-01-01T00:00:00Z', secret_cipher: encrypt(token, keyEnv), ...patch };
  return new CredentialContext({ repo: { getCredential: async () => row }, env: keyEnv, now: () => new Date('2026-08-07T00:00:00Z') });
}

test('credential context decrypts active account token and does not leak it in errors', async () => {
  const calls = [];
  const context = new CredentialContext({ repo: { getCredentialByAccount: async (...args) => { calls.push(args); return { id: 'cr1', status: 'active', credential_type: 'oauth', expire_at: '2030-01-01T00:00:00Z', secret_cipher: encrypt(JSON.stringify({ accessToken: 'only-account-token', refreshToken: 'refresh' }), keyEnv) }; } }, env: keyEnv, now: () => new Date('2026-08-07T00:00:00Z') });
  const loaded = await context.load({ accountId: 'a1' }, 'oauth');
  assert.equal(loaded.accountId, 'a1'); assert.equal(loaded.accessToken, 'only-account-token'); assert.equal(loaded.refreshToken, 'refresh');
  assert.deepEqual(calls[0], ['a1', 'oauth', { includeSecret: true }]);
  const broken = new CredentialContext({ repo: { getCredentialByAccount: async () => ({ status: 'active', secret_cipher: 'not-json' }) }, env: keyEnv });
  await assert.rejects(() => broken.load('a1'), error => error.code === 'CREDENTIAL_DECRYPT_FAILED' && !error.message.includes('only-account-token'));
});

test('credential context loads account_password without requiring a token', async () => {
  const secret = JSON.stringify({ account: 'masked-login-account', password: 'password-for-test' });
  const context = new CredentialContext({
    repo: { getCredentialByAccount: async () => ({ id: 'cr-password', status: 'active', credential_type: 'account_password', expire_at: '2030-01-01T00:00:00Z', secret_cipher: encrypt(secret, keyEnv) }) },
    env: keyEnv,
    now: () => new Date('2026-08-07T00:00:00Z')
  });
  const loaded = await context.loadSecretObject('a-password', 'account_password');
  assert.deepEqual(loaded, { account: 'masked-login-account', password: 'password-for-test' });
});

test('credential context rejects inactive and expired credentials', async () => {
  await assert.rejects(() => credentialContext('x', { status: 'failed' }).load('s1'), error => error.code === 'CREDENTIAL_INACTIVE');
  await assert.rejects(() => credentialContext('x', { expire_at: '2020-01-01T00:00:00Z' }).load('s1'), error => error.code === 'CREDENTIAL_EXPIRED');
});

test('credential context exposes explicit token and secret object loaders', async () => {
  const secret = JSON.stringify({ apiToken: 'token-x', nested: { enabled: true } });
  const context = credentialContext(secret);
  assert.equal(await context.loadApiToken('s1'), 'token-x');
  assert.deepEqual(await context.loadSecretObject('s1'), { apiToken: 'token-x', nested: { enabled: true } });
});


test('H5 separates installation from account health and uses account token for JSON API', async () => {
  let request;
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_API_BASE_URL: 'https://community.example.com', BIGPLAYER_H5_ALLOWED_HOSTS: 'community.example.com', BIGPLAYER_H5_BEARER_TOKEN: 'must-not-be-used' }, {
    credentialContext: credentialContext('db-account-token'),
    fetchImpl: async (url, options) => { request = { url: url.toString(), options }; const comments = url.toString().includes('/comments'); return { ok: true, json: async () => ({ data: { items: [{ id: 1 }], next_cursor: comments ? null : 'c2', has_more: comments ? false : true } }) }; }
  });
  assert.equal((await connector.installationHealth()).installed, true);
  assert.equal((await connector.accountHealth({ id: 's1' })).authorized, true);
  const page = await connector.listPosts({ source: { id: 's1' }, account: { platform_account_id: 'tenant/one' }, cursor: 'c1', limit: 5 });
  assert.ok(page instanceof ConnectorPageResult);
  assert.deepEqual(page.items, [{ id: 1 }]); assert.equal(page.nextCursor, 'c2'); assert.equal(page.hasMore, true);
  assert.match(request.url, /\/internal\/opinion\/posts/); assert.match(request.url, /accountId=tenant%2Fone/); assert.match(request.url, /cursor=c1/); assert.equal(request.options.headers.authorization, 'Bearer db-account-token');
  await connector.listComments({ source: { id: 's1' }, postId: 'post/1', cursor: 'c2' });
  assert.match(request.url, /\/internal\/opinion\/posts\/post%2F1\/comments/); assert.doesNotMatch(request.url, /postId=/);
});

test('H5 JSON API rejects source host outside env whitelist', async () => {
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'allowed.example.com' }, { credentialContext: credentialContext() });
  await assert.rejects(() => connector.listPosts({ source: { id: 's1', config: { baseUrl: 'http://127.0.0.1' } } }), error => error.code === 'CONNECTOR_NOT_CONFIGURED');
});

test('Q1 H5 discovers schema feeds and uses endpoint-specific pagination', async () => {
  const requests = [];
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext('Bearer supplied-token'),
    fetchImpl: async (url, options) => {
      const href = String(url); requests.push({ url: href, options });
      if (href.includes('/user/context')) return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { gameBoards: [{ id: 2, name: '超能世界' }] } }) };
      if (href.includes('/v2/auth/board')) return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { id: 2, groups: [
        { id: 10, name: '资讯', type: 0, sections: [{ id: -1, name: '全部' }, { id: 11, name: '公告' }, { id: 12, name: '攻略', children: [{ id: 13, name: '进阶' }] }] },
        { id: 20, name: '圈子', type: 1, sections: [{ id: 21, name: '闲聊' }, { id: 22, name: '阵容' }] }
      ] } }) };
      if (href.includes('/comment/')) return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: [], total: 0 }) };
      const params = new URL(href).searchParams;
      if (new URL(href).pathname === '/api/club/v1/auth/post/') {
        const postId = Number(params.get('postId'));
        return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { id: postId, title: '签到', content: [{ type: 0, data: '8月签到' }] } }) };
      }
      const id = params.get('offsetId') === '0' ? 907744 : 907745;
      return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list: [{ id, title: '签到', content: [{ type: 0, data: '8月签到' }], commentCount: 2, createTime: '2026-08-13T01:10:39Z', user: { account: { id: 5569432 }, personality: { nickName: '打发空闲' } } }], total: 2, hasMore: params.get('offsetId') === '0' } }) };
    }
  });
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS&lang=zh-CN' } };
  const feeds = await connector.discoverFeeds({ source });
  assert.deepEqual(feeds.map(feed => [feed.pageKind, feed.endpointKind, feed.sectionId, feed.type, feed.tabName]), [
    ['home', 'merged', '0', null, '首页'],
    ['info', 'info', '10', 1, '资讯'],
    ['info', 'info', '11', 1, '公告'],
    ['info', 'info', '12', 1, '攻略'],
    ['info', 'info', '13', 1, '进阶'],
    ['circle', 'activity', '20', 3, '全部'],
    ['circle', 'activity', '20', 4, '精选'],
    ['circle', 'activity', '21', 5, '闲聊'],
    ['circle', 'activity', '22', 5, '阵容']
  ]);
  assert.equal(new Set(feeds.map(feed => feed.feedKey)).size, feeds.length);
  assert.equal(requests[0].options.headers.authorization, 'Bearer supplied-token');
  assert.equal(requests[0].options.headers['content-language'], 'zh-Hans');

  const home = feeds[0];
  const first = await connector.listFeedContents({ source, ...home, limit: 1 });
  const homeRequest = requests.filter(item => item.url.includes('/post/model/merged-list')).at(-1).url;
  assert.match(homeRequest, /merged-list/); assert.match(homeRequest, /pageIndex=1/); assert.match(homeRequest, /offsetId=0/);
  assert.equal(first.items[0].externalId, '907744'); assert.equal(first.items[0].body, '8月签到'); assert.equal(first.hasMore, true);
  const homeCursor = JSON.parse(first.nextCursor);
  assert.equal(homeCursor.pageIndex, 2); assert.equal(homeCursor.offsetId, 1); assert.equal(homeCursor.feedKey, home.feedKey);
  const second = await connector.listFeedContents({ source, ...home, cursor: first.nextCursor, limit: 1 });
  const secondHomeRequest = requests.filter(item => item.url.includes('/post/model/merged-list')).at(-1).url;
  assert.match(secondHomeRequest, /pageIndex=2/); assert.match(secondHomeRequest, /offsetId=1/); assert.equal(second.hasMore, false);

  const circle = feeds.find(feed => feed.pageKind === 'circle' && feed.type === 5);
  const circlePage = await connector.listFeedContents({ source, ...circle, limit: 1 });
  const circleRequest = requests.filter(item => item.url.includes('/post/activity/list')).at(-1).url;
  assert.match(circleRequest, /post\/activity\/list/); assert.match(circleRequest, /sectionId=21/); assert.match(circleRequest, /type=5/); assert.doesNotMatch(circleRequest, /pageIndex=/);
  const circleCursor = JSON.parse(circlePage.nextCursor);
  assert.equal(circleCursor.endpointKind, 'activity'); assert.equal(circleCursor.offsetId, 1);
  await assert.rejects(() => connector.listFeedContents({ source, ...circle, cursor: first.nextCursor, limit: 1 }), error => error.code === 'INVALID_PAGINATION');

  const compat = await connector.listPosts({ source, cursor: first.nextCursor, limit: 1 });
  assert.equal(compat.items[0].externalId, '907745');
  assert.equal(requests.filter(item => item.url.includes('/user/context')).length, 1);
  await assert.rejects(() => connector.listComments({ source, postId: '907744', sortType: 3 }), error => error.code === 'INVALID_PAGINATION');
});

test('Q1 feed enriches 916457-shaped summaries from exact detail requests without changing order', async () => {
  const requests = [];
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS&lang=zh-CN' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const secondListItem = { id: 916458, title: '第二条摘要', content: [{ type: 0, data: '第二条列表摘要' }], createTime: '2026-09-10T08:16:00Z' };
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext('detail-account-token'),
    fetchImpl: async (url, options) => {
      const href = String(url);
      requests.push({ href, options });
      const parsed = new URL(href);
      if (parsed.pathname.endsWith('/post/model/merged-list')) {
        return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list: [q1PostDetail916457.listItem, secondListItem], total: 2, hasMore: false } }) };
      }
      if (parsed.pathname === '/api/club/v1/auth/post/') {
        const postId = parsed.searchParams.get('postId');
        const payload = postId === '916457'
          ? q1PostDetail916457.detailPayload
          : { code: 0, data: { ...secondListItem, content: [{ type: 0, data: '第二条完整正文' }] } };
        return { ok: true, status: 200, url: href, json: async () => payload };
      }
      throw new Error(`unexpected request: ${href}`);
    }
  });

  const page = await connector.listFeedContents({ source, ...feed, limit: 20 });
  assert.deepEqual(page.items.map(item => item.externalId), ['916457', '916458']);
  const enriched = page.items[0];
  assert.equal(enriched.body, q1PostDetail916457.expected.detailBody);
  assert.deepEqual(enriched.media, q1PostDetail916457.expected.media);
  assert.equal(enriched.engagement.comments, 37);
  assert.equal(enriched.engagement.likes, 128);
  assert.equal(enriched.engagement.views, 2048);
  assert.deepEqual(enriched.rawPayload._contentIntegrity, { status: 'detail_enriched' });
  assert.equal(page.items[1].body, '第二条完整正文');

  const detailRequests = requests.filter(request => new URL(request.href).pathname === '/api/club/v1/auth/post/');
  assert.equal(detailRequests.length, 2);
  assert.deepEqual(detailRequests.map(request => new URL(request.href).searchParams.get('postId')), ['916457', '916458']);
  for (const request of detailRequests) {
    const parsed = new URL(request.href);
    assert.deepEqual([...parsed.searchParams.keys()].sort(), ['postId', 'source']);
    assert.equal(parsed.searchParams.get('source'), '0');
    assert.equal(request.options.headers.authorization, 'Bearer detail-account-token');
  }
  assert.deepEqual(page.raw.paginationDiagnostics.contentEnrichment, { attempted: 2, enriched: 2, fallback: 0 });
});

test('Q1 detail HTTP/JSON/structure failures preserve the list summary with stable fallback diagnostics', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const cases = [
    ['HTTP', 'DETAIL_FETCH_FAILED', href => ({ ok: false, status: 503, url: href, json: async () => ({}) })],
    ['JSON', 'DETAIL_RESPONSE_INVALID', href => ({ ok: true, status: 200, url: href, json: async () => { throw new SyntaxError('invalid JSON'); } })],
    ['structure', 'DETAIL_RESPONSE_INVALID', href => ({ ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { id: 916457, content: [] } }) })],
    ['image-only content', 'DETAIL_RESPONSE_INVALID', href => ({ ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { id: 916457, content: [{ type: 1, data: 'https://opsoss.q1.com/posts/916457/detail-only.jpg' }] } }) })],
    ['relative image-only content', 'DETAIL_RESPONSE_INVALID', href => ({ ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { id: 916457, content: [{ type: 1, data: '/posts/916457/detail-only.jpg' }] } }) })],
    ['data URI image-only content', 'DETAIL_RESPONSE_INVALID', href => ({ ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { id: 916457, content: [{ type: 1, data: 'data:image/png;base64,aW1hZ2U=' }] } }) })],
    ['identity mismatch', 'DETAIL_RESPONSE_INVALID', href => ({ ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { ...q1PostDetail916457.detailPayload.data, id: 999999 } }) })]
  ];

  for (const [label, fallbackCode, detailResponse] of cases) {
    let detailCalls = 0;
    const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
      credentialContext: credentialContext('detail-account-token'),
      fetchImpl: async url => {
        const href = String(url);
        if (new URL(href).pathname.endsWith('/post/model/merged-list')) {
          return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list: [q1PostDetail916457.listItem], total: 1, hasMore: false } }) };
        }
        detailCalls += 1;
        return detailResponse(href);
      }
    });

    const page = await connector.listFeedContents({ source, ...feed, limit: 20 });
    assert.equal(detailCalls, 1, label);
    assert.equal(page.items.length, 1, label);
    assert.equal(page.items[0].body, q1PostDetail916457.expected.summaryBody, label);
    assert.deepEqual(page.items[0].media, q1PostDetail916457.expected.media, label);
    assert.deepEqual(page.items[0].rawPayload.content, q1PostDetail916457.listItem.content, label);
    assert.deepEqual(page.items[0].rawPayload._contentIntegrity, { status: 'summary_fallback', code: fallbackCode }, label);
    assert.deepEqual(page.raw.paginationDiagnostics.contentEnrichment, { attempted: 1, enriched: 0, fallback: 1 }, label);
    assert.equal(page.hasMore, false, label);
  }
});

test('Q1 detail preserves list metadata, unions media, and strips sensitive detail fields from raw payload', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const listItem = {
    id: 916457,
    title: '列表标题不得丢失',
    content: [
      { type: 0, data: '列表摘要' },
      { type: 1, data: 'https://opsoss.q1.com/posts/916457/list-only.jpg' },
      { type: 1, data: 'https://opsoss.q1.com/posts/916457/shared.jpg' }
    ],
    commentCount: 7,
    thumbsUpCount: 8,
    clickCount: 9,
    createTime: '2026-09-10T08:15:00Z',
    user: { account: { id: 5569432 }, personality: { nickName: '列表作者' } }
  };
  const detail = {
    id: 916457,
    title: null,
    content: [
      { type: 0, data: '详情完整正文' },
      { type: 1, data: 'https://opsoss.q1.com/posts/916457/shared.jpg' },
      { type: 1, data: 'https://opsoss.q1.com/posts/916457/detail-only.jpg' }
    ],
    commentCount: null,
    thumbsUpCount: null,
    createTime: null,
    apiToken: 'detail-top-token-must-not-leak',
    password: 'detail-top-password-must-not-leak',
    user: {
      account: {
        id: null,
        access_token: 'detail-user-token-must-not-leak',
        authorization: 'Bearer detail-authorization-must-not-leak',
        sessionId: 'detail-session-id-must-not-leak',
        apiKey: 'detail-api-key-must-not-leak',
        credential: { value: 'detail-credential-must-not-leak' },
        bearer: 'detail-bearer-must-not-leak',
        privateKey: 'detail-private-key-must-not-leak'
      },
      personality: {
        nickName: null,
        nested: [{ authorization: 'nested-authorization-must-not-leak' }, { sessionId: 'nested-session-must-not-leak' }]
      },
      secret: 'detail-user-secret-must-not-leak'
    }
  };
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext('detail-account-token'),
    fetchImpl: async url => {
      const href = String(url);
      if (new URL(href).pathname.endsWith('/post/model/merged-list')) return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list: [listItem], total: 1, hasMore: false } }) };
      return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: detail }) };
    }
  });

  const page = await connector.listFeedContents({ source, ...feed, limit: 20 });
  const item = page.items[0];
  assert.equal(item.title, listItem.title);
  assert.equal(item.authorName, '列表作者');
  assert.equal(item.platformAuthorId, '5569432');
  assert.equal(item.publishedAt, listItem.createTime);
  assert.deepEqual(item.engagement, { comments: 7, likes: 8, views: 9 });
  assert.match(item.body, /详情完整正文/);
  assert.deepEqual(item.media, [
    'https://opsoss.q1.com/posts/916457/list-only.jpg',
    'https://opsoss.q1.com/posts/916457/shared.jpg',
    'https://opsoss.q1.com/posts/916457/detail-only.jpg'
  ]);
  assert.deepEqual(item.rawPayload._contentIntegrity, { status: 'detail_enriched' });
  const sensitiveKeys = [];
  const sensitiveNames = new Set(['authorization', 'sessionid', 'apikey', 'credential', 'bearer', 'privatekey']);
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (/token|password|secret|cookie/i.test(key) || sensitiveNames.has(normalizedKey)) sensitiveKeys.push(key);
      visit(child);
    }
  };
  visit(item.rawPayload);
  assert.deepEqual(sensitiveKeys, []);
  const serialized = JSON.stringify(item.rawPayload);
  for (const secret of [
    'detail-top-token-must-not-leak', 'detail-top-password-must-not-leak', 'detail-user-token-must-not-leak',
    'detail-authorization-must-not-leak', 'detail-session-id-must-not-leak', 'detail-api-key-must-not-leak',
    'detail-credential-must-not-leak', 'detail-bearer-must-not-leak', 'detail-private-key-must-not-leak',
    'nested-authorization-must-not-leak', 'nested-session-must-not-leak', 'detail-user-secret-must-not-leak'
  ]) assert.doesNotMatch(serialized, new RegExp(secret));
});

test('Q1 detail empty metadata and createTime drift cannot overwrite list identity or daily-window time', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const listItem = {
    id: 916459,
    title: '列表标题',
    content: [{ type: 0, data: '列表摘要' }],
    createTime: '2026-09-10T08:15:00Z',
    user: { account: { id: 5569432 }, personality: { nickName: '列表作者' } }
  };
  const detailItem = {
    id: 916459,
    title: '',
    content: [{ type: 0, data: '详情完整正文' }],
    createTime: '2026-09-12T08:15:00Z',
    user: { account: { id: '' }, personality: { nickName: '' } }
  };
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext('detail-account-token'),
    fetchImpl: async url => {
      const href = String(url);
      if (new URL(href).pathname.endsWith('/post/model/merged-list')) return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list: [listItem], total: 1, hasMore: false } }) };
      return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: detailItem }) };
    }
  });

  const page = await connector.listFeedContents({
    source, ...feed, limit: 20, dailyBounded: true,
    publishedFrom: '2026-09-10T00:00:00Z', publishedTo: '2026-09-11T00:00:00Z'
  });
  assert.equal(page.items.length, 1, 'daily window must use the list createTime rather than drifted detail metadata');
  assert.equal(page.items[0].title, listItem.title);
  assert.equal(page.items[0].authorName, listItem.user.personality.nickName);
  assert.equal(page.items[0].platformAuthorId, String(listItem.user.account.id));
  assert.equal(page.items[0].publishedAt, listItem.createTime);
  assert.equal(page.items[0].body, '详情完整正文');
});

test('Q1 bounded feed rejects missing, invalid, reversed, and over-seven-day windows before any request', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  let requests = 0;
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext(),
    fetchImpl: async () => { requests += 1; throw new Error('must not request an unbounded feed'); }
  });
  const invalidWindows = [
    { publishedTo: '2026-09-11T00:00:00Z' },
    { publishedFrom: '2026-09-10T00:00:00Z' },
    { publishedFrom: 'not-a-date', publishedTo: '2026-09-11T00:00:00Z' },
    { publishedFrom: '2026-09-11T00:00:00Z', publishedTo: '2026-09-11T00:00:00Z' },
    { publishedFrom: '2026-09-03T23:59:59Z', publishedTo: '2026-09-11T00:00:00Z' }
  ];
  for (const window of invalidWindows) {
    await assert.rejects(
      () => connector.listFeedContents({ source, ...feed, limit: 20, dailyBounded: true, ...window }),
      error => error.code === 'COLLECTION_BOUNDARY_UNVERIFIED'
    );
  }
  assert.equal(requests, 0);
});

test('Q1 bounded feed fails closed on missing list createTime before detail enrichment', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  let detailRequests = 0;
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext(),
    fetchImpl: async url => {
      const href = String(url);
      if (new URL(href).pathname === '/api/club/v1/auth/post/') detailRequests += 1;
      return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list: [{ id: 1, title: 'missing time' }], total: 1, hasMore: false } }) };
    }
  });
  await assert.rejects(
    () => connector.listFeedContents({ source, ...feed, limit: 20, dailyBounded: true, publishedFrom: '2026-09-10T00:00:00Z', publishedTo: '2026-09-11T00:00:00Z' }),
    error => error.code === 'COLLECTION_BOUNDARY_UNVERIFIED'
  );
  assert.equal(detailRequests, 0);
});

test('Q1 bounded feed enriches and returns only posts inside the fixed window', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const detailIds = [];
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext(),
    fetchImpl: async url => {
      const href = String(url); const parsed = new URL(href);
      if (parsed.pathname === '/api/club/v1/auth/post/') {
        const id = parsed.searchParams.get('postId'); detailIds.push(id);
        return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { id: Number(id), content: [{ type: 0, data: `detail-${id}` }] } }) };
      }
      return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list: [
        { id: 1, title: 'old', createTime: '2026-09-09T23:59:59Z' },
        { id: 2, title: 'inside', createTime: '2026-09-10T12:00:00Z' },
        { id: 3, title: 'at-end', createTime: '2026-09-11T00:00:00Z' }
      ], total: 3, hasMore: false } }) };
    }
  });
  const page = await connector.listFeedContents({ source, ...feed, limit: 20, dailyBounded: true, publishedFrom: '2026-09-10T00:00:00Z', publishedTo: '2026-09-11T00:00:00Z' });
  assert.deepEqual(page.items.map(item => item.externalId), ['2']);
  assert.deepEqual(detailIds, ['2']);
  assert.equal(page.raw.paginationDiagnostics.contentEnrichment.attempted, 1);
});

test('Q1 listPosts validates and forwards the fixed window before discovery, credentials, or network', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const calls = { discover: 0, credential: 0, network: 0, feed: [] };
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: { async load() { calls.credential += 1; return { apiToken: 'must-not-load' }; } },
    fetchImpl: async () => { calls.network += 1; throw new Error('must not request'); }
  });
  connector.discoverFeeds = async () => { calls.discover += 1; return [feed]; };
  connector.listFeedContents = async input => { calls.feed.push(input); return new ConnectorPageResult({ items: [], nextCursor: null, hasMore: false }); };

  for (const input of [
    { dailyBounded: true, publishedFrom: '2026-09-10T00:00:00Z' },
    { historyStart: '2026-09-10T00:00:00Z' },
    { dailyBounded: true, publishedFrom: '2026-09-10T00:00:00Z', publishedTo: '2026-09-11T00:00:00Z', historyStart: '2026-09-10T01:00:00Z' }
  ]) {
    await assert.rejects(() => connector.listPosts({ source, limit: 20, ...input }), error => error.code === 'COLLECTION_BOUNDARY_UNVERIFIED');
  }
  assert.deepEqual(calls, { discover: 0, credential: 0, network: 0, feed: [] });

  const window = { dailyBounded: true, publishedFrom: '2026-09-10T00:00:00Z', publishedTo: '2026-09-11T00:00:00Z', historyStart: '2026-09-10T00:00:00Z' };
  await connector.listPosts({ source, limit: 20, ...window });
  assert.equal(calls.discover, 1);
  assert.deepEqual(Object.fromEntries(Object.keys(window).map(key => [key, calls.feed[0][key]])), window);
  assert.equal(calls.credential, 0);
  assert.equal(calls.network, 0);
});

test('Q1 detail enrichment propagates abort instead of returning a summary fallback', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const controller = new AbortController();
  const abortReason = Object.assign(new Error('detail enrichment lease lost'), { code: 'COLLECTION_CANCELLED' });
  let detailStarted;
  const started = new Promise(resolve => { detailStarted = resolve; });
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext('detail-account-token'),
    fetchImpl: async (url, options) => {
      const href = String(url);
      if (new URL(href).pathname.endsWith('/post/model/merged-list')) {
        return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list: [q1PostDetail916457.listItem], total: 1, hasMore: false } }) };
      }
      detailStarted();
      return new Promise((resolve, reject) => {
        if (options.signal.aborted) return reject(options.signal.reason);
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    }
  });

  const pending = connector.listFeedContents({ source, ...feed, limit: 20, signal: controller.signal });
  await Promise.race([started, new Promise(resolve => setTimeout(resolve, 20))]);
  controller.abort(abortReason);
  await assert.rejects(pending, error => error === abortReason || error.cause === abortReason || error.code === 'COLLECTION_CANCELLED' || error.cause?.code === 'COLLECTION_CANCELLED');
});

test('Q1 detail worker pool propagates cancellation nested in ConnectorPageError and stops claiming work', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const account = { id: 'a1', platform: 'bigplayer_h5' };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const list = Array.from({ length: 10 }, (_, index) => ({ id: 930000 + index, title: `摘要-${index}`, content: [{ type: 0, data: `摘要-${index}` }] }));
  const controller = new AbortController();
  const abortReason = Object.assign(new Error('nested cancellation'), { code: 'COLLECTION_CANCELLED' });
  const wrappedCancellation = new ConnectorPageError('bigplayer_h5', 'posts', 1, abortReason);
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext('detail-account-token'),
    fetchImpl: async url => {
      const href = String(url);
      return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list, total: list.length, hasMore: false } }) };
    }
  });
  const originalRequestQ1 = connector.requestQ1.bind(connector);
  const claimed = [];
  connector.requestQ1 = async (path, requestSource, apiToken, params, page, capability, authRefreshRetried, signal) => {
    if (path !== '/api/club/v1/auth/post/') return originalRequestQ1(path, requestSource, apiToken, params, page, capability, authRefreshRetried, signal);
    if (signal?.aborted) throw wrappedCancellation;
    claimed.push(String(params.postId));
    if (claimed.length === 1) {
      controller.abort(abortReason);
      throw wrappedCancellation;
    }
    return { code: 0, data: { id: Number(params.postId), content: [{ type: 0, data: `完整正文-${params.postId}` }] } };
  };

  await assert.rejects(
    () => connector.listFeedContents({ source, account, ...feed, limit: 20, signal: controller.signal }),
    error => error === wrappedCancellation || error.cause === abortReason || error.cause?.code === 'COLLECTION_CANCELLED'
  );
  assert.ok(claimed.length >= 1);
  assert.ok(claimed.length <= 4, `abort 后仍领取了 ${claimed.length} 个 detail，超过初始并发槽`);
  assert.ok(claimed.length < list.length, 'abort 后不得继续领取后续 detail');
});

test('Q1 detail worker pool aborts sibling requests for nested daily timeout without aborting the external signal', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const list = Array.from({ length: 8 }, (_, index) => ({ id: 940000 + index, content: [{ type: 0, data: `摘要-${index}` }] }));
  const external = new AbortController();
  const detailSignals = [];
  let siblingAborts = 0;
  let detailCalls = 0;
  const dailyTimeout = Object.assign(new Error('daily run timeout'), { code: 'DAILY_RUN_TIMEOUT' });
  const nestedTimeout = new ConnectorPageError('bigplayer_h5', 'posts', 1, dailyTimeout);
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com', BIGPLAYER_H5_TIMEOUT_MS: '5000' }, {
    credentialContext: credentialContext('detail-account-token'),
    fetchImpl: async (url, options) => {
      const href = String(url);
      if (new URL(href).pathname.endsWith('/post/model/merged-list')) return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list, total: list.length, hasMore: false } }) };
      detailCalls += 1;
      detailSignals.push(options.signal);
      if (detailCalls === 1) throw nestedTimeout;
      return new Promise((resolve, reject) => {
        const onAbort = () => { siblingAborts += 1; reject(options.signal.reason); };
        if (options.signal.aborted) onAbort();
        else options.signal.addEventListener('abort', onAbort, { once: true });
      });
    }
  });
  const hasNestedCode = (error, code) => {
    const seen = new Set();
    let current = error;
    while (current && typeof current === 'object' && !seen.has(current)) {
      if (current.code === code) return true;
      seen.add(current);
      current = current.cause;
    }
    return false;
  };
  let guardTimer;
  const guard = new Promise((resolve, reject) => { guardTimer = setTimeout(() => reject(Object.assign(new Error('detail pool did not settle'), { code: 'TEST_TIMEOUT' })), 250); });
  const startedAt = Date.now();

  try {
    await assert.rejects(
      Promise.race([connector.listFeedContents({ source, ...feed, limit: 20, signal: external.signal }), guard]),
      error => hasNestedCode(error, 'DAILY_RUN_TIMEOUT')
    );
  } finally {
    clearTimeout(guardTimer);
  }
  assert.ok(Date.now() - startedAt < 250, 'nested daily timeout must not wait for per-request timeout');
  assert.equal(external.signal.aborted, false, 'the caller-owned signal must not be aborted internally');
  assert.ok(detailSignals.length > 1, 'the initial concurrent siblings must have started');
  assert.ok(detailSignals.every(signal => signal !== external.signal), 'detail fetches must observe internal/combined signals');
  assert.equal(siblingAborts, detailSignals.length - 1, 'every in-flight sibling must settle through internal cancellation');
});

test('Q1 detail 401 refresh reuses the explicitly supplied credential context and account', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const account = { id: 'explicit-account', source_id: 's1', platform: 'bigplayer_h5' };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const explicitLoads = [];
  const explicitCredentialContext = {
    async loadApiToken(subject, credentialType) {
      explicitLoads.push({ subject, credentialType });
      return explicitLoads.length === 1 ? 'initial-explicit-token' : 'refreshed-explicit-token';
    }
  };
  let defaultContextLoads = 0;
  const refreshCalls = [];
  const authorizations = [];
  let detailAttempts = 0;
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: { async loadApiToken() { defaultContextLoads += 1; return 'wrong-default-token'; } },
    authRefreshCoordinator: { async refresh(input) { refreshCalls.push(input); } },
    fetchImpl: async (url, options) => {
      const href = String(url);
      const parsed = new URL(href);
      authorizations.push(options.headers.authorization);
      if (parsed.pathname.endsWith('/post/model/merged-list')) {
        return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list: [q1PostDetail916457.listItem], total: 1, hasMore: false } }) };
      }
      detailAttempts += 1;
      if (detailAttempts === 1) return { ok: false, status: 401, url: href, json: async () => ({}) };
      return { ok: true, status: 200, url: href, json: async () => q1PostDetail916457.detailPayload };
    }
  });

  const page = await connector.listFeedContents({ source, account, credentialContext: explicitCredentialContext, ...feed, limit: 20 });
  assert.equal(page.items[0].rawPayload._contentIntegrity.status, 'detail_enriched');
  assert.equal(detailAttempts, 2);
  assert.equal(defaultContextLoads, 0);
  assert.equal(explicitLoads.length, 2);
  assert.strictEqual(explicitLoads[0].subject, account);
  assert.strictEqual(explicitLoads[1].subject, account);
  assert.deepEqual(explicitLoads.map(call => call.credentialType), ['api_token', 'api_token']);
  assert.equal(refreshCalls.length, 1);
  assert.strictEqual(refreshCalls[0].account, account);
  assert.deepEqual(authorizations, ['Bearer initial-explicit-token', 'Bearer initial-explicit-token', 'Bearer refreshed-explicit-token']);
});

test('Q1 detail enrichment uses a fixed concurrency limit of at most four', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const list = Array.from({ length: 9 }, (_, index) => ({ id: 920000 + index, title: `摘要-${index}`, content: [{ type: 0, data: `摘要-${index}` }] }));
  let active = 0;
  let maxActive = 0;
  let detailCalls = 0;
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext('detail-account-token'),
    fetchImpl: async url => {
      const href = String(url);
      const parsed = new URL(href);
      if (parsed.pathname.endsWith('/post/model/merged-list')) {
        return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list, total: list.length, hasMore: false } }) };
      }
      detailCalls += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 10));
      active -= 1;
      const id = Number(parsed.searchParams.get('postId'));
      return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { id, title: `详情-${id}`, content: [{ type: 0, data: `完整正文-${id}` }] } }) };
    }
  });

  const page = await connector.listFeedContents({ source, ...feed, limit: 20 });
  assert.equal(detailCalls, list.length);
  assert.ok(maxActive > 1, `expected concurrent detail requests, observed ${maxActive}`);
  assert.ok(maxActive <= 4, `detail concurrency ${maxActive} exceeded fixed limit 4`);
  assert.deepEqual(page.items.map(item => item.externalId), list.map(item => String(item.id)));
  assert.deepEqual(page.raw.paginationDiagnostics.contentEnrichment, { attempted: list.length, enriched: list.length, fallback: 0 });
});

test('Q1 comments omit top-level commentId, advance by last ID and schedule incomplete replies', async () => {
  const requests = [];
  let commentCall = 0;
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext('comment-token'),
    fetchImpl: async (url) => {
      const href = String(url); requests.push(href); commentCall += 1;
      const params = new URL(href).searchParams;
      if (commentCall === 1) return { ok: true, status: 200, url: href, json: async () => ({ code: 0, total: 3, hasMore: true, data: [{ id: 101, content: '顶层', commentCount: 2, replies: [{ id: 201, content: '内嵌回复' }] }] }) };
      if (params.get('commentId') === '101') return { ok: true, status: 200, url: href, json: async () => ({ code: 0, total: 1, data: [{ id: 202, content: '补抓回复' }] }) };
      return { ok: true, status: 200, url: href, json: async () => ({ code: 0, total: 3, data: [{ id: 102, content: '下一页' }] }) };
    }
  });
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const first = await connector.listComments({ source, postId: '907744', limit: 1 });
  assert.doesNotMatch(requests[0], /commentId=/);
  assert.deepEqual(first.items.map(item => item.externalId), ['101']);
  assert.deepEqual(first.items[0].replies.map(item => [item.externalId, item.platformParentId, item.contentDepth]), [['201', '101', 2]]);
  assert.deepEqual(first.replyTargets, [{ postId: '907744', commentId: '101', sortType: 0 }]);
  const cursor = JSON.parse(first.nextCursor);
  assert.equal(cursor.offsetId, '101');
  const second = await connector.listComments({ source, postId: '907744', cursor: first.nextCursor, limit: 1 });
  assert.match(requests[1], /offsetId=101/); assert.doesNotMatch(requests[1], /commentId=/); assert.equal(second.items[0].externalId, '102');
  const replies = await connector.listComments({ source, postId: '907744', commentId: '101', limit: 20 });
  assert.match(requests[2], /commentId=101/); assert.equal(replies.items[0].platformParentId, '101'); assert.equal(replies.items[0].contentDepth, 2); assert.deepEqual(replies.replyTargets, []);
});

test('Q1 bounded comments and replies reject invalid windows before credentials or network', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const calls = { credential: 0, network: 0 };
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: { async load() { calls.credential += 1; return { apiToken: 'must-not-load' }; } },
    fetchImpl: async () => { calls.network += 1; throw new Error('must not request'); }
  });
  for (const input of [
    { dailyBounded: true, publishedFrom: '2026-09-10T00:00:00Z' },
    { historyStart: '2026-09-10T00:00:00Z' },
    { commentId: '101', dailyBounded: true, publishedFrom: '2026-09-10T00:00:00Z', publishedTo: '2026-09-11T00:00:00Z', historyStart: '2026-09-09T00:00:00Z' }
  ]) {
    await assert.rejects(() => connector.listComments({ source, postId: '907744', limit: 20, ...input }), error => error.code === 'COLLECTION_BOUNDARY_UNVERIFIED');
  }
  assert.deepEqual(calls, { credential: 0, network: 0 });
});

test('Q1 bounded comments and replies filter by createTime before returning to the worker', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext('comment-window-token'),
    fetchImpl: async url => {
      const href = String(url); const params = new URL(href).searchParams;
      const data = params.get('commentId')
        ? [
            { id: 301, content: 'old reply', createTime: '2026-09-09T23:59:59Z' },
            { id: 302, content: 'inside reply', createTime: '2026-09-10T13:00:00Z' }
          ]
        : [
            { id: 101, content: 'inside top', createTime: '2026-09-10T12:00:00Z', replies: [
              { id: 201, content: 'old embedded reply', createTime: '2026-09-09T23:59:59Z' },
              { id: 202, content: 'inside embedded reply', createTime: '2026-09-10T12:30:00Z' }
            ] },
            { id: 102, content: 'old top', createTime: '2026-09-09T23:59:59Z' }
          ];
      return { ok: true, status: 200, url: href, json: async () => ({ code: 0, total: data.length, hasMore: false, data }) };
    }
  });
  const window = { dailyBounded: true, publishedFrom: '2026-09-10T00:00:00Z', publishedTo: '2026-09-11T00:00:00Z', historyStart: '2026-09-10T00:00:00Z' };
  const comments = await connector.listComments({ source, postId: '907744', limit: 20, ...window });
  assert.deepEqual(comments.items.map(item => item.externalId), ['101']);
  assert.deepEqual(comments.items[0].replies.map(item => item.externalId), ['202']);
  const replies = await connector.listComments({ source, postId: '907744', commentId: '101', limit: 20, ...window });
  assert.deepEqual(replies.items.map(item => item.externalId), ['302']);
  assert.equal(replies.items[0].platformParentId, '101');
});

test('Q1 bounded comments fail closed when any returned comment lacks createTime', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext(),
    fetchImpl: async url => ({ ok: true, status: 200, url: String(url), json: async () => ({ code: 0, total: 1, hasMore: false, data: [{ id: 101, content: 'top', createTime: '2026-09-10T12:00:00Z', replies: [{ id: 201, content: 'missing time' }] }] }) })
  });
  await assert.rejects(
    () => connector.listComments({ source, postId: '907744', limit: 20, dailyBounded: true, publishedFrom: '2026-09-10T00:00:00Z', publishedTo: '2026-09-11T00:00:00Z' }),
    error => error.code === 'COLLECTION_BOUNDARY_UNVERIFIED'
  );
});

test('Q1 feed treats omitted hasMore as resumable', async () => {
  const requests = [];
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext(),
    fetchImpl: async url => {
      const parsed = new URL(url);
      const params = parsed.searchParams;
      if (parsed.pathname === '/api/club/v1/auth/post/') {
        const id = Number(params.get('postId'));
        return { ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: { id, title: '帖子', content: [{ type: 0, data: `完整正文-${id}` }] } }) };
      }
      requests.push(params.get('pageIndex'));
      const id = params.get('pageIndex') === '1' ? 1001 : 1002;
      return { ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: { list: [{ id, title: '帖子' }], total: 3 } }) };
    }
  });
  const first = await connector.listFeedContents({ source, ...feed, limit: 50 });
  assert.equal(first.items.length, 1);
  assert.equal(first.hasMore, true);
  assert.ok(first.nextCursor);
  const second = await connector.listFeedContents({ source, ...feed, cursor: first.nextCursor, limit: 50 });
  assert.equal(second.items[0].externalId, '1002');
  assert.deepEqual(requests, ['1', '2']);
});

test('Q1 feed continues after a 20-item first page and consumes the remaining page', async () => {
  const requests = [];
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const post = id => ({ id, title: `帖子-${id}`, content: [{ type: 0, data: `正文-${id}` }] });
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext(),
    fetchImpl: async url => {
      const href = String(url);
      const parsed = new URL(href);
      const params = parsed.searchParams;
      if (parsed.pathname === '/api/club/v1/auth/post/') {
        const id = Number(params.get('postId'));
        return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { ...post(id), content: [{ type: 0, data: `完整正文-${id}` }] } }) };
      }
      requests.push(href);
      const firstPage = params.get('pageIndex') === '1';
      const items = firstPage
        ? Array.from({ length: 20 }, (_, index) => post(2000 + index))
        : Array.from({ length: 11 }, (_, index) => post(2020 + index));
      return {
        ok: true,
        status: 200,
        url: href,
        json: async () => firstPage
          ? { code: 0, total: 31, hasMore: 'true', data: items }
          : { code: 0, total: 31, hasMore: 0, data: { list: items } }
      };
    }
  });
  const first = await connector.listFeedContents({ source, ...feed });
  assert.equal(first.items.length, 20);
  assert.equal(first.hasMore, true);
  const firstCursor = JSON.parse(first.nextCursor);
  assert.equal(firstCursor.pageIndex, 2);
  assert.equal(firstCursor.offsetId, 20);
  assert.match(requests[0], /pageSize=20/);
  assert.match(requests[0], /pageIndex=1/);
  assert.match(requests[0], /offsetId=0/);

  const second = await connector.listFeedContents({ source, ...feed, cursor: first.nextCursor });
  assert.equal(second.items.length, 11);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, null);
  assert.match(requests[1], /pageIndex=2/);
  assert.match(requests[1], /offsetId=20/);
});
test('Q1 feed honors explicit hasMore when total is page-local', async () => {
  const requests = [];
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext(),
    fetchImpl: async url => {
      const href = String(url);
      const parsed = new URL(href);
      if (parsed.pathname === '/api/club/v1/auth/post/') {
        const id = Number(parsed.searchParams.get('postId'));
        return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { id, title: '帖子', content: [{ type: 0, data: `完整正文-${id}` }] } }) };
      }
      requests.push(href);
      const firstPage = parsed.searchParams.get('pageIndex') === '1';
      return { ok: true, status: 200, url: href, json: async () => ({ code: 0, total: 20, hasMore: firstPage, data: Array.from({ length: firstPage ? 20 : 1 }, (_, index) => ({ id: firstPage ? index + 1 : 21, title: '帖子' })) }) };
    }
  });
  const first = await connector.listFeedContents({ source, ...feed, limit: 20 });
  assert.equal(first.hasMore, true);
  const second = await connector.listFeedContents({ source, ...feed, cursor: first.nextCursor, limit: 20 });
  assert.equal(second.hasMore, false);
  assert.equal(requests.length, 2);
});
test('Q1 daily window continues through unordered old posts and exposes bounded diagnostics', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  let call = 0;
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext(),
    fetchImpl: async url => {
      call += 1;
      const list = call === 1
        ? [{ id: 1, title: 'old', createTime: '2026-08-09T00:00:00Z' }, { id: 2, title: 'in-window', createTime: '2026-08-11T00:00:00Z' }]
        : [{ id: 3, title: 'later-window', createTime: '2026-08-11T01:00:00Z' }];
      return { ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: { list, total: 3, hasMore: call === 1 } }) };
    }
  });
  const first = await connector.listFeedContents({ source, ...feed, limit: 2, dailyBounded: true, publishedFrom: '2026-08-10T16:00:00Z', publishedTo: '2026-08-11T16:00:00Z' });
  assert.deepEqual(first.items.map(item => item.externalId), ['2']);
  assert.equal(first.hasMore, true);
  assert.equal(first.raw.paginationDiagnostics.providerHasMore, true);
  const second = await connector.listFeedContents({ source, ...feed, cursor: first.nextCursor, limit: 2, dailyBounded: true, publishedFrom: '2026-08-10T16:00:00Z', publishedTo: '2026-08-11T16:00:00Z' });
  assert.deepEqual(second.items.map(item => item.externalId), ['3']);
  assert.equal(second.hasMore, false);
});

test('Q1 bounded feed continues across two out-of-window pages and reaches a later in-window page', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  let feedPage = 0;
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com', BIGPLAYER_H5_FEED_NO_NEW_PAGE_BUDGET: '2' }, {
    credentialContext: credentialContext(),
    fetchImpl: async url => {
      const href = String(url); const parsed = new URL(href);
      if (parsed.pathname === '/api/club/v1/auth/post/') {
        const id = parsed.searchParams.get('postId');
        return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { id: Number(id), content: [{ type: 0, data: `detail-${id}` }] } }) };
      }
      feedPage += 1;
      const createTime = feedPage < 3 ? `2026-09-0${feedPage}T00:00:00Z` : '2026-09-10T12:00:00Z';
      return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list: [{ id: feedPage, title: `page-${feedPage}`, createTime }], total: 3, hasMore: feedPage < 3 } }) };
    }
  });
  const window = { dailyBounded: true, publishedFrom: '2026-09-10T00:00:00Z', publishedTo: '2026-09-11T00:00:00Z' };
  const first = await connector.listFeedContents({ source, ...feed, limit: 1, ...window });
  assert.equal(first.items.length, 0); assert.equal(first.hasMore, true);
  const second = await connector.listFeedContents({ source, ...feed, cursor: first.nextCursor, limit: 1, ...window });
  assert.equal(second.items.length, 0); assert.equal(second.hasMore, true);
  const third = await connector.listFeedContents({ source, ...feed, cursor: second.nextCursor, limit: 1, ...window });
  assert.deepEqual(third.items.map(item => item.externalId), ['3']);
  assert.equal(third.hasMore, false);
});

test('Q1 bounded feed fails closed when provider explicitly reports more after an empty page', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext(),
    fetchImpl: async url => ({ ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: { list: [], hasMore: true } }) })
  });
  await assert.rejects(
    () => connector.listFeedContents({ source, ...feed, limit: 20, dailyBounded: true, publishedFrom: '2026-09-10T00:00:00Z', publishedTo: '2026-09-11T00:00:00Z' }),
    error => error.code === 'COLLECTION_BOUNDARY_INCOMPLETE' && error.details.reason === 'provider_empty_page'
  );
});

test('Q1 bounded feed fails closed when page budget or repeated-page progress cannot prove completion', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const window = { dailyBounded: true, publishedFrom: '2026-09-10T00:00:00Z', publishedTo: '2026-09-11T00:00:00Z' };
  const response = url => {
    const href = String(url); const parsed = new URL(href);
    if (parsed.pathname === '/api/club/v1/auth/post/') {
      const id = parsed.searchParams.get('postId');
      return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { id: Number(id), content: [{ type: 0, data: `detail-${id}` }] } }) };
    }
    return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { list: [{ id: 101, title: 'same', createTime: '2026-09-10T12:00:00Z' }], total: 4, hasMore: true } }) };
  };

  const budgeted = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com', BIGPLAYER_H5_FEED_MAX_PAGES: '1' }, { credentialContext: credentialContext(), fetchImpl: response });
  await assert.rejects(
    () => budgeted.listFeedContents({ source, ...feed, limit: 1, ...window }),
    error => error.code === 'COLLECTION_BOUNDARY_INCOMPLETE' && error.details.reason === 'provider_pagination_budget_exhausted'
  );

  const stalled = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, { credentialContext: credentialContext(), fetchImpl: response });
  const first = await stalled.listFeedContents({ source, ...feed, limit: 1, ...window });
  const duplicate = await stalled.listFeedContents({ source, ...feed, cursor: first.nextCursor, limit: 1, ...window });
  assert.equal(duplicate.items.length, 0); assert.equal(duplicate.hasMore, true);
  await assert.rejects(
    () => stalled.listFeedContents({ source, ...feed, cursor: duplicate.nextCursor, limit: 1, ...window }),
    error => error.code === 'COLLECTION_BOUNDARY_INCOMPLETE' && error.details.reason === 'provider_pagination_stalled'
  );
});

test('Q1 bounded feed reports the provider offset ceiling as incomplete before credentials or network', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const calls = { credential: 0, network: 0 };
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: { async load() { calls.credential += 1; return { apiToken: 'must-not-load' }; } },
    fetchImpl: async () => { calls.network += 1; throw new Error('must not request'); }
  });
  const cursor = JSON.stringify({ version: 2, endpointKind: 'merged', feedKey: feed.feedKey, pageIndex: 501, offsetId: 10000, previousFingerprint: null, pagesFetched: 500, consecutiveNoNewPages: 0, repeatedPageRetries: 0 });
  await assert.rejects(
    () => connector.listFeedContents({ source, ...feed, cursor, limit: 20, dailyBounded: true, publishedFrom: '2026-09-10T00:00:00Z', publishedTo: '2026-09-11T00:00:00Z' }),
    error => error.code === 'COLLECTION_BOUNDARY_INCOMPLETE' && error.details.reason === 'provider_offset_ceiling'
  );
  assert.deepEqual(calls, { credential: 0, network: 0 });
});

test('Q1 feed retries one repeated page and resumes when the provider advances', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  let feedCall = 0;
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext(),
    fetchImpl: async url => {
      const href = String(url);
      const parsed = new URL(href);
      if (parsed.pathname === '/api/club/v1/auth/post/') {
        const id = Number(parsed.searchParams.get('postId'));
        return { ok: true, status: 200, url: href, json: async () => ({ code: 0, data: { id, title: 'post', content: [{ type: 0, data: `full-${id}` }] } }) };
      }
      feedCall += 1;
      const id = feedCall === 3 ? 102 : 101;
      return { ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: { list: [{ id, title: 'post' }], total: 4, hasMore: true } }) };
    }
  });
  const first = await connector.listFeedContents({ source, ...feed, limit: 1 });
  const repeated = await connector.listFeedContents({ source, ...feed, cursor: first.nextCursor, limit: 1 });
  assert.equal(repeated.hasMore, true);
  assert.equal(repeated.items.length, 0);
  assert.equal(repeated.raw.paginationDiagnostics.repeatedPageRetries, 1);
  const recovered = await connector.listFeedContents({ source, ...feed, cursor: repeated.nextCursor, limit: 1 });
  assert.deepEqual(recovered.items.map(item => item.externalId), ['102']);
  assert.equal(recovered.raw.paginationDiagnostics.repeatedPageRetries, 0);
});

test('Q1 feed marks consecutive repeated pages incomplete and de-duplicates them', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const response = url => ({ ok: true, status: 200, url: String(url), json: async () => ({ code: 0, total: 3, hasMore: true, data: [{ id: 101, content: '重复' }] }) });
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, { credentialContext: credentialContext(), fetchImpl: response });
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const firstFeed = await connector.listFeedContents({ source, ...feed, limit: 1 });
  const duplicateFeed = await connector.listFeedContents({ source, ...feed, cursor: firstFeed.nextCursor, limit: 1 });
  assert.equal(duplicateFeed.items.length, 0);
  assert.equal(duplicateFeed.hasMore, true);
  assert.ok(duplicateFeed.nextCursor);
  const stalledFeed = await connector.listFeedContents({ source, ...feed, cursor: duplicateFeed.nextCursor, limit: 1 });
  assert.equal(stalledFeed.items.length, 0);
  assert.equal(stalledFeed.hasMore, false);
  assert.equal(stalledFeed.raw.paginationDiagnostics.code, 'provider_pagination_stalled');
  const firstComments = await connector.listComments({ source, postId: '907744', limit: 1 });
  await assert.rejects(() => connector.listComments({ source, postId: '907744', cursor: firstComments.nextCursor, limit: 1 }), error => error.code === 'INVALID_PAGINATION');
});

test('Douyin OAuth state is one-time and token exchange is mockable', async () => {
  const store = new Map();
  const env = { DOUYIN_CLIENT_KEY: 'key', DOUYIN_CLIENT_SECRET: 'secret', DOUYIN_REDIRECT_URI: 'https://app.example.com/cb', DOUYIN_OAUTH_AUTHORIZE_URL: 'https://open.douyin.com/auth', DOUYIN_OAUTH_TOKEN_URL: 'https://open.douyin.com/token' };
  const oauth = new DouyinOAuthService(env, { stateStore: store, randomBytes: () => Buffer.from('123456789012345678901234'), fetchImpl: async () => ({ ok: true, json: async () => ({ data: { access_token: 'access', refresh_token: 'refresh', open_id: 'open', expires_in: 7200 } }) }) });
  const { state } = oauth.createAuthorizationUrl({ accountId: 's1' });
  const token = await oauth.exchangeCode({ code: 'code', state }); assert.equal(token.accountId, 's1'); assert.equal(token.accessToken, 'access');
  await assert.rejects(() => oauth.exchangeCode({ code: 'code', state }), error => error.code === 'OAUTH_STATE_INVALID');
});

test('Douyin video pagination works and comments fail capability-closed', async () => {
  const oauthService = { configured: () => true };
  const env = { DOUYIN_ENABLED: 'true', DOUYIN_API_BASE_URL: 'https://open.douyin.com' };
  const calls = [];
  const connector = new DouyinConnector(env, { oauthService, credentialContext: { load: async (...args) => { calls.push(args); return { apiToken: 'douyin-token' }; } }, fetchImpl: async () => ({ ok: true, json: async () => ({ data: { list: [{ item_id: 'v1' }], cursor: 20, has_more: true } }) }) });
  const page = await connector.listPosts({ source: { id: 's1' }, cursor: 0, limit: 20 }); assert.equal(page.nextCursor, '20'); assert.equal(page.items[0].item_id, 'v1');
  assert.deepEqual(calls[0], [{ id: 's1' }, 'oauth_access_refresh']);
  await assert.rejects(() => connector.listComments(), error => error.code === 'CAPABILITY_UNSUPPORTED');
  assert.equal(typeof connector.listReplies, 'undefined');
});

test('Douyin scaffold is fail-closed when OAuth installation is incomplete', async () => {
  const connector = new DouyinConnector({ DOUYIN_ENABLED: 'true', DOUYIN_API_BASE_URL: 'https://open.douyin.com' }, { oauthService: { configured: () => false }, credentialContext: credentialContext() });
  assert.equal((await connector.installationHealth()).installed, false);
  await assert.rejects(() => connector.listPosts({ source: { id: 's1' } }), error => error.code === 'CONNECTOR_NOT_CONFIGURED');
});

test('H5 supports direct post and comment endpoints', async () => {
  const requests = [];
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'api.example.com' }, {
    credentialContext: credentialContext('direct-token'),
    fetchImpl: async (url, options) => { requests.push({ url: String(url), options }); return { ok: true, status: 200, url: String(url), headers: { get: () => null }, json: async () => ({ items: [], hasMore: false }) }; }
  });
  const source = { id: 's1', config: { postsApiUrl: 'https://api.example.com/v1/posts', commentsApiUrl: 'https://api.example.com/v1/comments' } };
  const health = await connector.installationHealth(source);
  assert.equal(health.installed, true);
  assert.equal(health.endpoints.replies, undefined);
  await connector.listPosts({ source, account: { platform_account_id: 'tenant-1' }, limit: 1 });
  await connector.listComments({ source, postId: 'post-1', limit: 1 });
  assert.match(requests[0].url, /\/v1\/posts/);
  assert.match(requests[1].url, /\/v1\/comments\?postId=post-1/);
  assert.equal(typeof connector.listReplies, 'undefined');
});

test('H5 recursively flattens children and legacy replies in parent-before-child order', async () => {
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'api.example.com' }, {
    credentialContext: credentialContext('token'),
    fetchImpl: async () => ({ ok: true, status: 200, url: 'https://api.example.com/comments', headers: { get: () => null }, json: async () => ({ items: [{ id: 'c1', children: [{ id: 'c2', replies: [{ id: 'c3' }] }] }], hasMore: false }) })
  });
  const source = { id: 's1', config: { baseUrl: 'https://api.example.com', commentsApiUrl: 'https://api.example.com/comments' } };
  const page = await connector.listComments({ source, postId: 'p1' });
  assert.deepEqual(page.items.map(item => [item.externalId, item.platformParentId, item.contentDepth]), [['c1', null, 1], ['c2', 'c1', 2], ['c3', 'c2', 3]]);
  await assert.rejects(() => connector.listComments({ source, postId: 'p1', limit: 0 }), error => error.code === 'INVALID_PAGINATION');
  const duplicate = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'api.example.com' }, { credentialContext: credentialContext('token'), fetchImpl: async () => ({ ok: true, status: 200, url: 'https://api.example.com/comments', headers: { get: () => null }, json: async () => ({ items: [{ id: 'c1' }, { id: 'c1' }], hasMore: false }) }) });
  await assert.rejects(() => duplicate.listComments({ source, postId: 'p1' }), error => error.code === 'MALFORMED_RESPONSE');
});

test('H5 direct endpoints are all checked against the server allowlist', async () => {
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'api.example.com' }, { credentialContext: credentialContext() });
  const health = await connector.installationHealth({ config: { postsApiUrl: 'https://api.example.com/posts', commentsApiUrl: 'http://127.0.0.1/comments' } });
  assert.equal(health.installed, false);
  assert.match(health.reason, /outside allowed hosts/);
});
