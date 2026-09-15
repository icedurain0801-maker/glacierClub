const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FacebookGraphConnector,
  parseFacebookPageUrl,
  validateGraphUrl
} = require('../src/connectors/facebookGraphConnector');
const { buildExternalConnectors } = require('../src/connectors/externalConnectors');

const SYSTEM_TOKEN = 'deployment-system-token';
const ENV = {
  FACEBOOK_GRAPH_ENABLED: 'true',
  FACEBOOK_GRAPH_API_VERSION: 'v26.0',
  FACEBOOK_GRAPH_TIMEOUT_MS: '1000',
  FACEBOOK_GRAPH_SYSTEM_ACCESS_TOKEN: SYSTEM_TOKEN
};
const SOURCE = { config: { baseUrl: 'https://www.facebook.com/LastLightSurvival?ref=page' } };
const ACCOUNT = { id: 'account-1', platform_account_id: 'page-1' };

function response(payload, { status = 200, url } = {}) {
  return { ok: status >= 200 && status < 300, status, url, headers: { get: () => null }, json: async () => payload };
}

test('connector registry includes the dedicated Facebook Graph connector', () => {
  const connectors = buildExternalConnectors(ENV, { fetchImpl: async () => response({}) });
  assert.ok(connectors.facebook instanceof FacebookGraphConnector);
});

test('Facebook Page URL parsing accepts official HTTPS pages and never requests the page URL', () => {
  assert.deepEqual(parseFacebookPageUrl(SOURCE.config.baseUrl), {
    pageRef: 'LastLightSurvival',
    normalizedUrl: 'https://www.facebook.com/LastLightSurvival'
  });
  for (const value of [
    'http://www.facebook.com/LastLightSurvival',
    'https://facebook.com.evil.example/LastLightSurvival',
    'https://user:pass@facebook.com/LastLightSurvival',
    'https://facebook.com/groups/123',
    'https://facebook.com/LastLightSurvival#token',
    'https://facebook.com/LastLightSurvival?access_token=secret',
    'https://facebook.com/LastLightSurvival?unexpected=value'
  ]) assert.throws(() => parseFacebookPageUrl(value), error => error.code === 'FACEBOOK_URL_INVALID');
});

test('Graph URLs are pinned to HTTPS graph.facebook.com and one approved version', () => {
  assert.equal(validateGraphUrl('https://graph.facebook.com/v26.0/page-1/posts?after=cursor', 'v26.0').hostname, 'graph.facebook.com');
  for (const value of [
    'http://graph.facebook.com/v26.0/page-1/posts',
    'https://graph.facebook.com.evil.example/v26.0/page-1/posts',
    'https://user:pass@graph.facebook.com/v26.0/page-1/posts',
    'https://graph.facebook.com:8443/v26.0/page-1/posts',
    'https://graph.facebook.com/v25.0/page-1/posts',
    'https://graph.facebook.com/v26.0/page-1//posts',
    'https://graph.facebook.com/v26.0/page-1/posts#fragment',
    'https://graph.facebook.com/v26.0/page-1/posts?access_token=secret'
  ]) assert.throws(() => validateGraphUrl(value, 'v26.0'), error => error.code === 'FACEBOOK_PAGING_URL_INVALID');
});

test('Graph requests put token only in Authorization and refuse redirects', async () => {
  const calls = [];
  const connector = new FacebookGraphConnector(ENV, {
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return response({}, { status: 302, url: String(url) });
    }
  });
  await assert.rejects(
    () => connector.requestGraph({ path: 'page-1/posts', params: { limit: 1 }, capability: 'posts' }),
    error => error.code === 'CONNECTOR_PAGE_FAILED' && error.cause?.code === 'FACEBOOK_PAGING_URL_INVALID'
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.headers.authorization, `Bearer ${SYSTEM_TOKEN}`);
  assert.ok(!calls[0].url.includes(SYSTEM_TOKEN));
  assert.ok(!calls[0].url.includes('access_token'));
});

test('paging.next is revalidated before fetch and unsafe URLs never reach the network', async () => {
  let called = false;
  const connector = new FacebookGraphConnector(ENV, { fetchImpl: async () => { called = true; return response({}); } });
  await assert.rejects(
    () => connector.requestNextPage({ nextUrl: 'https://evil.example/v26.0/page-1/posts?after=x', capability: 'posts', page: 2 }),
    error => error.code === 'FACEBOOK_PAGING_URL_INVALID'
  );
  assert.equal(called, false);
});

test('capability detection proves Page management, MODERATE, posts, comments and replies in order', async () => {
  const calls = [];
  const connector = new FacebookGraphConnector(ENV, {
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), authorization: options.headers.authorization });
      const pathname = new URL(String(url)).pathname;
      if (pathname.endsWith('/LastLightSurvival')) return response({ id: 'page-1', name: 'Last Light' }, { url: String(url) });
      if (pathname.endsWith('/me/accounts')) return response({ data: [{ id: 'page-1', tasks: ['MODERATE', 'CREATE_CONTENT'] }] }, { url: String(url) });
      if (pathname.endsWith('/page-1/posts')) return response({ data: [{ id: 'post-1' }] }, { url: String(url) });
      if (pathname.endsWith('/post-1/comments')) return response({ data: [{ id: 'comment-1' }] }, { url: String(url) });
      if (pathname.endsWith('/comment-1/comments')) return response({ data: [] }, { url: String(url) });
      throw new Error('unexpected request');
    }
  });
  const result = await connector.detectCapabilities({ source: SOURCE, account: ACCOUNT });
  assert.equal(result.systemCredentialStatus, 'configured');
  assert.deepEqual(Object.fromEntries(['page', 'pageManagement', 'moderate', 'posts', 'comments', 'replies'].map(key => [key, result[key].status])), {
    page: 'available', pageManagement: 'available', moderate: 'available', posts: 'available', comments: 'available', replies: 'available'
  });
  assert.equal(result.page.pageId, 'page-1');
  assert.equal(result.comments.samplePostId, 'post-1');
  assert.equal(result.replies.sampleCommentId, 'comment-1');
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call => call.authorization === `Bearer ${SYSTEM_TOKEN}` && !call.url.includes(SYSTEM_TOKEN)));
});

test('empty samples mark unprovable downstream capabilities missing and account health fails closed', async () => {
  const connector = new FacebookGraphConnector(ENV, {
    fetchImpl: async url => {
      const pathname = new URL(String(url)).pathname;
      if (pathname.endsWith('/LastLightSurvival')) return response({ id: 'page-1', name: 'Last Light' }, { url: String(url) });
      if (pathname.endsWith('/me/accounts')) return response({ data: [{ id: 'page-1', tasks: ['MODERATE'] }] }, { url: String(url) });
      return response({ data: [] }, { url: String(url) });
    }
  });
  const capabilities = await connector.detectCapabilities({ source: SOURCE, account: ACCOUNT });
  assert.equal(capabilities.page.status, 'available');
  assert.equal(capabilities.posts.status, 'available');
  assert.equal(capabilities.comments.errorCode, 'FACEBOOK_CAPABILITY_MISSING');
  assert.equal(capabilities.replies.errorCode, 'FACEBOOK_CAPABILITY_MISSING');
  const health = await connector.accountHealth({ source: SOURCE, account: ACCOUNT });
  assert.equal(health.authorized, false);
  assert.equal(health.configured, false);
  assert.equal(health.reason, 'FACEBOOK_CAPABILITY_MISSING');
});

test('provider failures expose stable codes without leaking token, URL query or response body', async () => {
  const token = 'private-token-value';
  const connector = new FacebookGraphConnector({ ...ENV, FACEBOOK_GRAPH_SYSTEM_ACCESS_TOKEN: token }, {
    fetchImpl: async url => response({ error: { code: 190, error_subcode: 463, message: `expired ${token}` } }, { status: 400, url: String(url) })
  });
  let caught;
  try { await connector.requestGraph({ path: 'page-1' }); } catch (error) { caught = error; }
  assert.equal(caught.code, 'CONNECTOR_PAGE_FAILED');
  assert.equal(caught.cause.code, 'FACEBOOK_SYSTEM_CREDENTIAL_EXPIRED');
  const exposed = JSON.stringify({ message: caught.message, details: caught.details, cause: { code: caught.cause.code, message: caught.cause.message, details: caught.cause.details } });
  assert.ok(!exposed.includes(token));
  assert.ok(!exposed.includes('expired private'));
  assert.ok(!exposed.includes('access_token'));
});

test('Meta rate-limit codes take precedence over an HTTP 403 status', async () => {
  const connector = new FacebookGraphConnector(ENV, {
    fetchImpl: async url => response({ error: { code: 4, message: 'rate limited' } }, { status: 403, url: String(url) })
  });
  await assert.rejects(
    () => connector.requestGraph({ path: 'page-1/posts', capability: 'posts' }),
    error => error.code === 'CONNECTOR_PAGE_FAILED' && error.cause?.code === 'FACEBOOK_RATE_LIMITED'
  );
});

test('Page ID mismatch returns a stable fail-closed capability result', async () => {
  const connector = new FacebookGraphConnector(ENV, {
    fetchImpl: async url => response({ id: 'different-page', name: 'Other Page' }, { url: String(url) })
  });
  const result = await connector.detectCapabilities({ source: SOURCE, account: ACCOUNT });
  assert.deepEqual(result.page, { status: 'unavailable', errorCode: 'FACEBOOK_PAGE_MISMATCH' });
  assert.equal(result.pageManagement.status, 'untested');
  assert.equal(result.moderate.status, 'untested');
  assert.equal(result.posts.status, 'untested');
  assert.equal(result.comments.status, 'untested');
  assert.equal(result.replies.status, 'untested');
});

test('pending account identity is replaced by the detected Page instead of treated as mismatch', async () => {
  const connector = new FacebookGraphConnector(ENV, {
    fetchImpl: async url => {
      const pathname = new URL(String(url)).pathname;
      if (pathname.endsWith('/LastLightSurvival')) return response({ id: 'page-1', name: 'Last Light' }, { url: String(url) });
      if (pathname.endsWith('/me/accounts')) return response({ data: [{ id: 'page-1', tasks: ['MODERATE'] }] }, { url: String(url) });
      if (pathname.endsWith('/page-1/posts')) return response({ data: [{ id: 'post-1' }] }, { url: String(url) });
      if (pathname.endsWith('/post-1/comments')) return response({ data: [{ id: 'comment-1' }] }, { url: String(url) });
      return response({ data: [] }, { url: String(url) });
    }
  });
  const result = await connector.detectCapabilities({ source: SOURCE, account: { id: 'account-1', platform_account_id: 'pending:account-1' } });
  assert.equal(result.page.status, 'available');
  assert.equal(result.page.pageId, 'page-1');
});

test('posts pagination rebuilds Graph requests from an opaque after cursor and normalizes content', async () => {
  const requested = [];
  const connector = new FacebookGraphConnector(ENV, {
    fetchImpl: async (url, options) => {
      const value = String(url);
      requested.push({ value, authorization: options.headers.authorization });
      const parsed = new URL(value);
      if (parsed.pathname.endsWith('/LastLightSurvival')) return response({ id: 'page-1', name: 'Last Light' }, { url: value });
      if (!parsed.searchParams.has('after')) {
        return response({
          data: [{ id: 'page-1_post-1', message: 'First post', created_time: '2026-09-01T00:00:00+0000', updated_time: '2026-09-02T00:00:00+0000', permalink_url: 'https://www.facebook.com/LastLightSurvival/posts/1', from: { id: 'page-1', name: 'Last Light' } }],
          paging: { cursors: { after: 'after-1' }, next: 'https://graph.facebook.com/v26.0/page-1/posts?after=after-1&access_token=provider-copy' }
        }, { url: value });
      }
      assert.equal(parsed.searchParams.get('after'), 'after-1');
      return response({ data: [{ id: 'page-1_post-2', story: 'Second post', created_time: '2026-09-03T00:00:00+0000' }] }, { url: value });
    }
  });
  const first = await connector.listPosts({ source: SOURCE, account: ACCOUNT, limit: 1 });
  assert.equal(first.items[0].externalId, 'page-1_post-1');
  assert.equal(first.items[0].body, 'First post');
  assert.equal(first.items[0].platformAuthorId, 'page-1');
  assert.equal(first.hasMore, true);
  assert.deepEqual(JSON.parse(first.nextCursor), { version: 1, scope: 'posts', resourceId: 'page-1', after: 'after-1' });
  const second = await connector.listPosts({ source: SOURCE, account: ACCOUNT, cursor: first.nextCursor, limit: 1 });
  assert.equal(second.items[0].body, 'Second post');
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, null);
  assert.ok(requested.every(call => call.authorization === `Bearer ${SYSTEM_TOKEN}`));
  assert.ok(requested.every(call => !call.value.includes('access_token') && !call.value.includes('provider-copy') && !call.value.includes(SYSTEM_TOKEN)));
});

test('comments and replies preserve root, parent and depth while exposing reply targets', async () => {
  const connector = new FacebookGraphConnector(ENV, {
    fetchImpl: async url => {
      const value = String(url);
      const pathname = new URL(value).pathname;
      if (pathname.endsWith('/post-1/comments')) return response({ data: [{ id: 'comment-1', message: 'Top level', created_time: '2026-09-01T01:00:00+0000', from: { id: 'user-1', name: 'A' } }] }, { url: value });
      if (pathname.endsWith('/comment-1/comments')) return response({ data: [{ id: 'reply-1', message: 'Reply', created_time: '2026-09-01T02:00:00+0000', from: { id: 'user-2', name: 'B' } }] }, { url: value });
      throw new Error('unexpected request');
    }
  });
  const comments = await connector.listComments({ source: SOURCE, account: ACCOUNT, postId: 'post-1' });
  assert.equal(comments.capability, 'full');
  assert.equal(comments.items[0].rootPlatformContentId, 'post-1');
  assert.equal(comments.items[0].platformParentId, 'post-1');
  assert.equal(comments.items[0].contentDepth, 1);
  assert.deepEqual(comments.replyTargets, [{ postId: 'post-1', commentId: 'comment-1', sortType: 0 }]);
  const replies = await connector.listReplies({ source: SOURCE, account: ACCOUNT, postId: 'post-1', commentId: 'comment-1' });
  assert.equal(replies.items[0].contentType, 'comment');
  assert.equal(replies.items[0].rootPlatformContentId, 'post-1');
  assert.equal(replies.items[0].platformParentId, 'comment-1');
  assert.equal(replies.items[0].contentDepth, 2);
  const viaComments = await connector.listComments({ source: SOURCE, account: ACCOUNT, postId: 'post-1', commentId: 'comment-1' });
  assert.equal(viaComments.items[0].externalId, 'reply-1');
});

test('paging rejects non-advancing, cross-scope and cross-resource cursors', async () => {
  const connector = new FacebookGraphConnector(ENV, {
    fetchImpl: async url => {
      const value = String(url);
      if (new URL(value).pathname.endsWith('/LastLightSurvival')) return response({ id: 'page-1', name: 'Last Light' }, { url: value });
      return response({ data: [], paging: { cursors: { after: 'same' }, next: 'https://graph.facebook.com/v26.0/page-1/posts?after=same' } }, { url: value });
    }
  });
  const cursor = JSON.stringify({ version: 1, scope: 'posts', resourceId: 'page-1', after: 'same' });
  await assert.rejects(() => connector.listPosts({ source: SOURCE, account: ACCOUNT, cursor }), error => error.code === 'FACEBOOK_PAGING_INCOMPLETE');
  await assert.rejects(
    () => connector.listComments({ source: SOURCE, account: ACCOUNT, postId: 'post-1', cursor }),
    error => error.code === 'INVALID_PAGINATION'
  );
});

test('paging metadata cannot switch Graph collection path even with a valid host and version', async () => {
  const connector = new FacebookGraphConnector(ENV, {
    fetchImpl: async url => {
      const value = String(url);
      return response({ data: [], paging: { cursors: { after: 'next' }, next: 'https://graph.facebook.com/v26.0/other-page/posts?after=next' } }, { url: value });
    }
  });
  await assert.rejects(
    () => connector.listComments({ source: SOURCE, account: ACCOUNT, postId: 'post-1' }),
    error => error.code === 'FACEBOOK_PAGING_INCOMPLETE'
  );
});
