const test = require('node:test');
const assert = require('node:assert/strict');
const { TapTapConnector, parseSourceConfig, momentText, taptapItem } = require('../src/connectors/taptapConnector');
const { buildExternalConnectors } = require('../src/connectors/externalConnectors');

function jsonResponse(payload) {
  return { ok: true, status: 200, url: 'https://www.taptap.cn/webapiv2/x', json: async () => payload };
}

function moment(id, { title = '标题', summary = '正文内容', author = '用户A', authorId = 1, comments = 2, publishTime = 1787850406, reviewId = null, reviewText = '' } = {}) {
  return {
    id_str: id,
    publish_time: publishTime,
    created_time: publishTime,
    author: { user: { id: authorId, name: author } },
    stat: { comments, ups: 3, pv_total: 100 },
    topic: { title, summary },
    ...(reviewId ? { review: { id: reviewId, contents: { text: reviewText } } } : {})
  };
}

const ENV = { TAPTAP_ENABLED: 'true' };

test('taptap connector requires enablement and reports no-login health', async () => {
  const disabled = new TapTapConnector({});
  assert.equal((await disabled.installationHealth()).installed, false);
  const enabled = new TapTapConnector(ENV);
  const health = await enabled.accountHealth();
  assert.equal(health.installed, true);
  assert.equal(health.authorized, true); // 免登采集：安装即可用
  assert.equal((await enabled.healthCheck()).configured, true);
});

test('taptap connector is registered by buildExternalConnectors', () => {
  const connectors = buildExternalConnectors({ TAPTAP_ENABLED: 'true' });
  assert.ok(connectors.taptap instanceof TapTapConnector);
  assert.equal(connectors.taptap.platform, 'taptap');
  assert.ok(connectors.taptap.hasCapability('posts'));
  assert.ok(connectors.taptap.hasCapability('comments'));
  assert.ok(connectors.taptap.hasCapability('keyword_search'));
});

test('parseSourceConfig extracts deduplicated numeric accountIds', () => {
  const config = parseSourceConfig({ config: JSON.stringify({ accountIds: ['123', '456', '123', 'abc', ''] }) });
  assert.deepEqual(config.accountIds, ['123', '456']);
  assert.deepEqual(parseSourceConfig({ config: {} }).accountIds, []);
  assert.deepEqual(parseSourceConfig({}).accountIds, []);
});

test('momentText combines topic title, summary and review text', () => {
  assert.equal(momentText(moment('1', { title: 't', summary: 's', reviewId: 9, reviewText: 'r' })), 't\ns\nr');
  assert.equal(momentText(moment('1', { title: '', summary: 's' })), 's');
});

test('taptapItem normalizes a moment into raw content', () => {
  const item = taptapItem(moment('842206200169758733', { authorId: 354232745, comments: 23 }));
  assert.equal(item.externalId, '842206200169758733');
  assert.equal(item.contentType, 'post');
  assert.equal(item.authorName, '用户A');
  assert.equal(item.platformAuthorId, '354232745');
  assert.equal(item.sourceUrl, 'https://www.taptap.cn/moment/842206200169758733');
  assert.equal(item.engagement.comments, 23);
  assert.ok(item.publishedAt instanceof Date);
  assert.ok(item.fingerprint);
});

test('listOwnedContents pages per account and advances across accounts', async () => {
  const urls = [];
  const connector = new TapTapConnector(ENV, {
    fetchImpl: async url => {
      urls.push(String(url));
      // 第一页：满页 → 同账号推进；第二页：不满 → 跳到下一账号；第三页：不满且无下一账号 → 结束
      const from = Number(new URL(String(url)).searchParams.get('from'));
      const userId = new URL(String(url)).searchParams.get('user_id');
      const list = userId === '111' && from === 0 ? [1, 2].map(() => ({ moment: moment(String(urls.length)) })) : [{ moment: moment('m' + urls.length) }];
      return jsonResponse({ data: { list } });
    }
  });
  const source = { config: JSON.stringify({ accountIds: ['111', '222'] }) };
  const page1 = await connector.listOwnedContents({ source, limit: 2 });
  assert.equal(page1.items.length, 2);
  assert.equal(page1.hasMore, true);
  assert.deepEqual(JSON.parse(page1.nextCursor), { version: 1, accountIdx: 0, from: 2 });
  const page2 = await connector.listOwnedContents({ source, cursor: page1.nextCursor, limit: 2 });
  assert.equal(page2.hasMore, true);
  assert.deepEqual(JSON.parse(page2.nextCursor), { version: 1, accountIdx: 1, from: 0 });
  const page3 = await connector.listOwnedContents({ source, cursor: page2.nextCursor, limit: 2 });
  assert.equal(page3.hasMore, false);
  assert.equal(page3.nextCursor, null);
});

test('listOwnedContents rejects cursor with invalid account index', async () => {
  const connector = new TapTapConnector(ENV, { fetchImpl: async () => jsonResponse({ data: { list: [] } }) });
  const source = { config: JSON.stringify({ accountIds: ['111'] }) };
  await assert.rejects(
    () => connector.listOwnedContents({ source, cursor: JSON.stringify({ version: 1, accountIdx: 5, from: 0 }), limit: 5 }),
    error => error.code === 'INVALID_PAGINATION'
  );
});

test('listOwnedContents fails closed without accountIds', async () => {
  const connector = new TapTapConnector(ENV);
  await assert.rejects(() => connector.listOwnedContents({ source: {} }), error => error.code === 'CONNECTOR_NOT_CONFIGURED');
});

test('searchContents queries agg-search with types=community and paginates', async () => {
  const urls = [];
  const connector = new TapTapConnector(ENV, {
    fetchImpl: async url => {
      urls.push(String(url));
      const from = Number(new URL(String(url)).searchParams.get('from'));
      const entries = from === 0 ? [1, 2].map(i => ({ moment: moment('s' + i) })) : [{ moment: moment('s3') }];
      return jsonResponse({ data: { list: [{ type: 'community', list: entries }] } });
    }
  });
  const page1 = await connector.searchContents({ keyword: '原神', limit: 2 });
  assert.ok(urls[0].includes('/webapiv2/search/v4/agg-search'));
  assert.ok(urls[0].includes('types=community'));
  assert.ok(urls[0].includes('kw='));
  assert.equal(page1.items.length, 2);
  assert.equal(page1.hasMore, true);
  const page2 = await connector.searchContents({ keyword: '原神', cursor: page1.nextCursor, limit: 2 });
  assert.equal(page2.items.length, 1);
  assert.equal(page2.hasMore, false);
});

test('searchContents requires keyword', async () => {
  const connector = new TapTapConnector(ENV);
  await assert.rejects(() => connector.searchContents({ keyword: '  ' }), error => error.code === 'KEYWORD_REQUIRED');
});

test('listComments resolves review id via moment detail and flattens one and two level comments', async () => {
  const urls = [];
  const connector = new TapTapConnector({ ...ENV, TAPTAP_DELAY_MS: '0' }, {
    fetchImpl: async url => {
      const path = String(url);
      urls.push(path);
      if (path.includes('/webapiv2/moment-mini/v1/multi-get')) {
        assert.ok(path.includes('ids=842206200169758733'));
        return jsonResponse({ data: { list: [{ review: { id: 50242975 } }] } });
      }
      assert.ok(path.includes('/webapiv2/review-comment/v1/by-review'));
      assert.ok(path.includes('order=asc'));
      assert.ok(path.includes('show_top=true'));
      return jsonResponse({
        data: {
          total: 2,
          list: [
            { id: 100, contents: { text: '一级评论' }, ups: 1, created_time: 1635226933, author: { id: 7, name: '甲' } },
            { id: 101, contents: { text: '二级回复' }, ups: 0, created_time: 1635227000, author: { id: 8, name: '乙' }, reply_to_user: { id: 7, name: '甲' } }
          ]
        }
      });
    }
  });
  const page = await connector.listComments({ postId: '842206200169758733', limit: 10 });
  assert.equal(page.items.length, 2);
  const [first, second] = page.items;
  assert.equal(first.externalId, '100');
  assert.equal(first.contentType, 'comment');
  assert.equal(first.contentDepth, 1);
  assert.equal(first.platformParentId, null);
  assert.equal(first.rootPlatformContentId, '842206200169758733');
  assert.equal(second.contentDepth, 2);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, null);
});

test('listComments paginates by total and routes plain moments to moment-comment/by-moment', async () => {
  // moment-mini/multi-get 按 ids 区分：m1 带 review（by-review 线程），m2 不带（by-moment 楼层）。
  const connector = new TapTapConnector({ ...ENV, TAPTAP_DELAY_MS: '0' }, {
    fetchImpl: async url => {
      const path = String(url);
      if (path.includes('moment-mini/v1/multi-get')) {
        const ids = new URL(path).searchParams.get('ids');
        return jsonResponse({ data: { list: ids === 'm1' ? [{ review: { id: 9 } }] : [{}] } });
      }
      if (path.includes('review-comment/v1/by-review')) {
        return jsonResponse({ data: { total: 3, list: [{ id: 1, contents: { text: 'a' }, author: { id: 1, name: 'x' } }] } });
      }
      assert.ok(path.includes('moment-comment/v1/by-moment'));
      assert.ok(path.includes('sort=rank'));
      assert.ok(path.includes('order=desc'));
      return jsonResponse({ data: { total: 2, list: [{ id_str: '20', contents: { json: [{ type: 'paragraph', children: [{ text: '楼层' }] }] }, created_time: 1787000000, author: { id: 5, name: 'y' } }] } });
    }
  });
  const page1 = await connector.listComments({ postId: 'm1', limit: 1 });
  assert.equal(page1.items.length, 1);
  assert.equal(page1.hasMore, true);
  const page2 = await connector.listComments({ postId: 'm1', cursor: page1.nextCursor, limit: 1 });
  assert.equal(page2.hasMore, true);
  const page3 = await connector.listComments({ postId: 'm1', cursor: page2.nextCursor, limit: 1 });
  assert.equal(page3.hasMore, false);
  const plain = await connector.listComments({ postId: 'm2', limit: 5 });
  assert.equal(plain.items.length, 1);
  assert.equal(plain.items[0].body, '楼层'); // 富文本 JSON 提取纯文本
  assert.equal(plain.items[0].contentDepth, 1);
  assert.equal(plain.hasMore, true);
  const plain2 = await connector.listComments({ postId: 'm2', limit: 5, cursor: plain.nextCursor });
  assert.equal(plain2.hasMore, false);
});

test('listComments requires postId', async () => {
  const connector = new TapTapConnector(ENV);
  await assert.rejects(() => connector.listComments({}), error => error.code === 'POST_ID_REQUIRED');
});

test('webapiv2 surfaces http failures as ConnectorPageError with status code', async () => {
  const connector = new TapTapConnector(ENV, {
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) })
  });
  await assert.rejects(
    () => connector.listComments({ postId: 'm1' }),
    error => error.code === 'CONNECTOR_PAGE_FAILED' && error.cause?.code === 'PERMISSION_DENIED'
  );
});

test('webapiv2 rejects API-level failure payloads', async () => {
  const connector = new TapTapConnector(ENV, {
    fetchImpl: async () => jsonResponse({ success: false, data: { msg: 'cache missing' } })
  });
  await assert.rejects(
    () => connector.listComments({ postId: 'm1' }),
    error => error.code === 'CONNECTOR_PAGE_FAILED' && error.cause?.code === 'TAPTAP_API_ERROR'
  );
});
