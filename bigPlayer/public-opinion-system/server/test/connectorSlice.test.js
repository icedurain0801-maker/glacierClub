const test = require('node:test');
const assert = require('node:assert/strict');
const { encrypt } = require('../src/integrations/credentialCipher');
const { CredentialContext } = require('../src/services/credentialContext');
const { BigPlayerH5Connector } = require('../src/connectors/bigPlayerH5Connector');
const { DouyinConnector } = require('../src/connectors/douyinConnector');
const { DouyinOAuthService } = require('../src/services/douyinOAuthService');
const { ConnectorPageResult } = require('../src/connectors/baseConnector');

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
  const homeRequest = requests.at(-1).url;
  assert.match(homeRequest, /merged-list/); assert.match(homeRequest, /pageIndex=1/); assert.match(homeRequest, /offsetId=0/);
  assert.equal(first.items[0].externalId, '907744'); assert.equal(first.items[0].body, '8月签到'); assert.equal(first.hasMore, true);
  const homeCursor = JSON.parse(first.nextCursor);
  assert.equal(homeCursor.pageIndex, 2); assert.equal(homeCursor.offsetId, 1); assert.equal(homeCursor.feedKey, home.feedKey);
  const second = await connector.listFeedContents({ source, ...home, cursor: first.nextCursor, limit: 1 });
  assert.match(requests.at(-1).url, /pageIndex=2/); assert.match(requests.at(-1).url, /offsetId=1/); assert.equal(second.hasMore, false);

  const circle = feeds.find(feed => feed.pageKind === 'circle' && feed.type === 5);
  const circlePage = await connector.listFeedContents({ source, ...circle, limit: 1 });
  assert.match(requests.at(-1).url, /post\/activity\/list/); assert.match(requests.at(-1).url, /sectionId=21/); assert.match(requests.at(-1).url, /type=5/); assert.doesNotMatch(requests.at(-1).url, /pageIndex=/);
  const circleCursor = JSON.parse(circlePage.nextCursor);
  assert.equal(circleCursor.endpointKind, 'activity'); assert.equal(circleCursor.offsetId, 1);
  await assert.rejects(() => connector.listFeedContents({ source, ...circle, cursor: first.nextCursor, limit: 1 }), error => error.code === 'INVALID_PAGINATION');

  const compat = await connector.listPosts({ source, cursor: first.nextCursor, limit: 1 });
  assert.equal(compat.items[0].externalId, '907745');
  assert.equal(requests.filter(item => item.url.includes('/user/context')).length, 1);
  await assert.rejects(() => connector.listComments({ source, postId: '907744', sortType: 3 }), error => error.code === 'INVALID_PAGINATION');
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

test('Q1 feed treats an undocumented short page as resumable', async () => {
  const requests = [];
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, {
    credentialContext: credentialContext(),
    fetchImpl: async url => {
      const params = new URL(url).searchParams;
      requests.push(params.get('pageIndex'));
      const id = params.get('pageIndex') === '1' ? 1001 : 1002;
      return { ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data: { list: [{ id, title: '帖子' }], total: 3, hasMore: false } }) };
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
      const href = String(url); requests.push(href);
      const params = new URL(href).searchParams;
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
      const href = String(url); requests.push(href);
      const firstPage = new URL(href).searchParams.get('pageIndex') === '1';
      return { ok: true, status: 200, url: href, json: async () => ({ code: 0, total: 20, hasMore: firstPage, data: Array.from({ length: firstPage ? 20 : 1 }, (_, index) => ({ id: firstPage ? index + 1 : 21, title: '帖子' })) }) };
    }
  });
  const first = await connector.listFeedContents({ source, ...feed, limit: 20 });
  assert.equal(first.hasMore, true);
  const second = await connector.listFeedContents({ source, ...feed, cursor: first.nextCursor, limit: 20 });
  assert.equal(second.hasMore, false);
  assert.equal(requests.length, 2);
});
test('Q1 feed and comment pagination reject duplicate non-advancing pages', async () => {
  const source = { id: 's1', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS' } };
  const response = url => ({ ok: true, status: 200, url: String(url), json: async () => ({ code: 0, total: 3, hasMore: true, data: [{ id: 101, content: '重复' }] }) });
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true', BIGPLAYER_H5_ALLOWED_HOSTS: 'club.q1.com' }, { credentialContext: credentialContext(), fetchImpl: response });
  const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null, groupType: null, sectionId: '0', tabName: '首页', type: null, orderType: null, isUltimate: null };
  feed.feedKey = ['2', 'home', 'merged', '', '0', '', '', ''].join(':');
  const firstFeed = await connector.listFeedContents({ source, ...feed, limit: 1 });
  await assert.rejects(() => connector.listFeedContents({ source, ...feed, cursor: firstFeed.nextCursor, limit: 1 }), error => error.code === 'INVALID_PAGINATION');
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
