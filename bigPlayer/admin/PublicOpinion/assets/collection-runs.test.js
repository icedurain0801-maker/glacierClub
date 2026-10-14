const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadHarness(search = '') {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      value: '', innerHTML: '', textContent: '', options: [], disabled: false,
      classList: { add() {}, remove() {}, contains() { return false; } },
      querySelectorAll() { return []; }
    });
    return elements.get(selector);
  };
  const api = {};
  const context = {
    __PUBLIC_OPINION_TEST__: api,
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    fetch: async () => { throw new Error('not used'); },
    history: { replaceState() {} },
    location: { pathname: '/admin/PublicOpinion/collection-runs.html', search },
    addEventListener() {},
    document: { querySelector: element, addEventListener() {} },
    PublicOpinionScope: {
      platformLabel: value => value,
      platformsForRegion: () => [],
      withScope: (_path, _options, request) => request,
      init: () => new Promise(() => {})
    },
    SourceSyncProgress: {
      sequenceOf: () => 1,
      createController: () => ({
        state: { hasMore: false }, snapshot: () => ({ run: {}, items: [], visibleLimit: 50, hasMore: false, loading: false }),
        stop() {}, open() {}, loadMore() {}
      })
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(require.resolve('./collection-runs.js'), 'utf8'), context, { filename: 'collection-runs.js' });
  return api;
}

test('collection run detail separates declared comments, real bodies, and catchup window', () => {
  const api = loadHarness();
  const detail = api.runDetailStats({
    trigger_type: 'scheduled_catchup',
    window_start: '2026-09-14T16:00:09.000Z',
    window_end: '2026-09-21T16:01:09.000Z',
    post_count: 1236,
    actual_comment_body_count: 4265,
    reply_count: 0,
    advertised_comment_count: 4717
  });
  assert.equal(detail.posts, 1236);
  assert.equal(detail.actualCommentBodies, 4265);
  assert.equal(detail.replies, 0);
  assert.equal(detail.advertisedComments, 4717);
  assert.equal(detail.windowText, '窗口：2026-09-14 16:00:09 至 2026-09-21 16:01:09（按实际补跑时刻截止）');
});

test('content type uses persisted feed metadata and never guesses activity from post rows', () => {
  const api = loadHarness();
  assert.equal(api.contentTypeLabel({ content_type: 'post', page_kind: 'activity' }), '动态');
  assert.equal(api.contentTypeLabel({ content_type: 'post', feed_key: 'activity:home' }), '动态');
  assert.equal(api.contentTypeLabel({ content_type: 'comment', page_kind: 'activity' }), '评论');
  assert.equal(api.contentTypeLabel({ content_type: 'post' }), '帖子');
});

test('initial run deep link is consumed once even when scope initialization fires first', () => {
  const api = loadHarness('?runId=run-deep-link');
  assert.equal(api.takePendingRunId(), 'run-deep-link');
  assert.equal(api.takePendingRunId(), '');
});

test('pending run id remains the URL detail id until restoreExpanded consumes it', () => {
  const api = loadHarness('?runId=run-deep-link');
  assert.equal(api.detailRunIdForUrl(), 'run-deep-link');
  assert.equal(api.takePendingRunId(), 'run-deep-link');
  assert.equal(api.detailRunIdForUrl(), '');
});
