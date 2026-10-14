const test = require('node:test');
const assert = require('node:assert/strict');

const { FacebookGraphConnector } = require('../src/connectors/facebookGraphConnector');
const {
  buildDeps,
  processDownstream,
  runPagedSource,
  syncStage
} = require('../../worker/src/worker');

const TOKEN = 'facebook-collection-secret-token';
const ENV = {
  FACEBOOK_GRAPH_ENABLED: 'true',
  FACEBOOK_GRAPH_API_VERSION: 'v26.0',
  FACEBOOK_GRAPH_TIMEOUT_MS: '1000',
  FACEBOOK_GRAPH_SYSTEM_ACCESS_TOKEN: TOKEN
};
const SOURCE = {
  id: 'facebook-source-1',
  game_id: '00000000-0000-0000-0000-000000000002',
  community_id: '00000000-0000-0000-0000-000000000102',
  region_code: 'overseas',
  platform: 'facebook',
  display_name: 'Last Light Facebook',
  config: { baseUrl: 'https://www.facebook.com/LastLightSurvival' }
};
const ACCOUNT = {
  id: 'facebook-account-1',
  source_id: SOURCE.id,
  game_id: SOURCE.game_id,
  community_id: SOURCE.community_id,
  platform: 'facebook',
  platform_account_id: 'page-1',
  enabled: 1,
  metadata: {}
};

function response(url, payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: String(url),
    headers: { get: () => null },
    json: async () => payload
  };
}

function collectionConnector(fetchImpl) {
  return new FacebookGraphConnector(ENV, {
    fetchImpl
  });
}

test('posts pagination consumes every after cursor and rebuilds tokenized paging.next on the fixed endpoint', async () => {
  const calls = [];
  const connector = collectionConnector(async (url, options) => {
    const text = String(url);
    calls.push({ url: text, options });
    const after = new URL(text).searchParams.get('after');
    if (!after) return response(url, {
      data: [{ id: 'post-1', message: 'first', created_time: '2026-09-10T01:00:00+0000', permalink_url: 'https://www.facebook.com/page/posts/post-1' }],
      paging: {
        cursors: { after: 'after-1' },
        next: `https://graph.facebook.com/v26.0/page-1/posts?limit=25&after=after-1&access_token=${TOKEN}`
      }
    });
    assert.equal(after, 'after-1');
    return response(url, {
      data: [{ id: 'post-2', message: 'second', created_time: '2026-09-10T02:00:00+0000', permalink_url: 'https://www.facebook.com/page/posts/post-2' }],
      paging: { cursors: {} }
    });
  });

  const first = await connector.listPosts({ source: SOURCE, account: ACCOUNT, limit: 25 });
  assert.equal(first.hasMore, true);
  assert.equal(first.items[0].externalId, 'post-1');
  const cursor = JSON.parse(first.nextCursor);
  assert.deepEqual(cursor, { version: 1, scope: 'posts', resourceId: 'page-1', after: 'after-1' });

  const second = await connector.listPosts({ source: SOURCE, account: ACCOUNT, cursor: first.nextCursor, limit: 25 });
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, null);
  assert.equal(second.items[0].externalId, 'post-2');
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url.includes(TOKEN), false);
    assert.equal(new URL(call.url).searchParams.has('access_token'), false);
    assert.equal(call.options.headers.authorization, `Bearer ${TOKEN}`);
  }
});

test('cursor scope and resource are bound and malformed paging cannot advance collection', async () => {
  let calls = 0;
  const connector = collectionConnector(async () => { calls += 1; throw new Error('must not fetch'); });
  for (const cursor of [
    JSON.stringify({ version: 1, scope: 'comments', resourceId: 'page-1', after: 'x' }),
    JSON.stringify({ version: 1, scope: 'posts', resourceId: 'other-page', after: 'x' }),
    JSON.stringify({ version: 2, scope: 'posts', resourceId: 'page-1', after: 'x' }),
    '{not-json'
  ]) {
    await assert.rejects(
      () => connector.listPosts({ source: SOURCE, account: ACCOUNT, cursor, limit: 25 }),
      error => error.code === 'INVALID_PAGINATION'
    );
  }
  assert.equal(calls, 0);
});

test('comments expose reply targets and replies retain root, parent, and depth two', async () => {
  const connector = collectionConnector(async url => {
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith('/post-1/comments')) return response(url, {
      data: [{ id: 'comment-1', message: 'top', created_time: '2026-09-10T03:00:00+0000', permalink_url: 'https://www.facebook.com/comment-1' }],
      paging: { cursors: {} }
    });
    if (pathname.endsWith('/comment-1/comments')) return response(url, {
      data: [{ id: 'reply-1', message: 'reply', created_time: '2026-09-10T04:00:00+0000', permalink_url: 'https://www.facebook.com/reply-1' }],
      paging: { cursors: {} }
    });
    throw new Error(`unexpected ${pathname}`);
  });

  const comments = await connector.listComments({ source: SOURCE, account: ACCOUNT, postId: 'post-1', limit: 25 });
  assert.deepEqual(comments.replyTargets, [{ postId: 'post-1', commentId: 'comment-1', sortType: 0 }]);
  assert.equal(comments.items[0].rootPlatformContentId, 'post-1');
  assert.equal(comments.items[0].platformParentId, 'post-1');
  assert.equal(comments.items[0].contentDepth, 1);

  const replies = await connector.listReplies({ source: SOURCE, account: ACCOUNT, postId: 'post-1', commentId: 'comment-1', limit: 25 });
  assert.equal(replies.items[0].rootPlatformContentId, 'post-1');
  assert.equal(replies.items[0].platformParentId, 'comment-1');
  assert.equal(replies.items[0].contentDepth, 2);
});

test('page failure releases the checkpoint at the last committed cursor and never advances early', async () => {
  let checkpointCursor = null;
  const commits = [];
  const releases = [];
  const repo = {
    async claimSyncCheckpoint() { return { id: 'checkpoint-posts', cursor: checkpointCursor }; },
    async upsertContentPage(input) {
      commits.push(input);
      checkpointCursor = input.nextCursor;
      return { contents: input.items.map(item => ({ content: { id: `db-${item.externalId}`, content_type: 'post' }, change: 'inserted' })), storedCount: input.items.length };
    },
    async releaseSyncCheckpoint(id, patch) { releases.push({ id, ...patch }); checkpointCursor = patch.cursor; }
  };
  let page = 0;
  const connector = {
    async listPosts() {
      page += 1;
      if (page === 1) return { items: [{ externalId: 'post-1', title: '', body: 'one', sourceUrl: 'https://www.facebook.com/post-1' }], nextCursor: 'cursor-after-page-1', hasMore: true, capability: 'full' };
      const error = new Error('provider unavailable'); error.code = 'FACEBOOK_API_UNAVAILABLE'; throw error;
    }
  };

  await assert.rejects(
    () => syncStage({ repo, leaseOwner: 'worker-1', leaseSeconds: 30, pageBudget: 3, pageSize: 25 }, {
      source: SOURCE,
      account: ACCOUNT,
      connector,
      scope: 'posts',
      syncMode: 'backfill',
      taskKind: 'owned_content',
      taskKey: 'owned'
    }),
    error => error.code === 'FACEBOOK_API_UNAVAILABLE'
  );
  assert.equal(commits.length, 1);
  assert.equal(releases.length, 1);
  assert.equal(releases[0].status, 'failed');
  assert.equal(releases[0].cursor, 'cursor-after-page-1');
  assert.equal(checkpointCursor, 'cursor-after-page-1');
});

test('a Facebook run with one committed page and a later page failure finishes partial, not failed', async () => {
  const finished = [];
  let page = 0;
  const repo = {
    async getDefaultAccount() { return ACCOUNT; },
    async updateAccount() {},
    async updateSourceAuth() {},
    async claimSyncCheckpoint() { return { id: 'checkpoint-posts', cursor: null }; },
    async upsertContentPage(input) {
      return {
        contents: input.items.map(item => ({ content: { id: `db-${item.externalId}`, content_type: 'post' }, change: 'inserted' })),
        storedCount: input.items.length
      };
    },
    async releaseSyncCheckpoint() {},
    async finishSyncRun(id, patch) { finished.push({ kind: 'sync', id, ...patch }); return { id, ...patch }; },
    async finishRun(id, patch) { finished.push({ kind: 'run', id, ...patch }); },
    async markSourceRun(id, patch) { finished.push({ kind: 'source', id, ...patch }); }
  };
  const connector = {
    async installationHealth() { return { installed: true, configured: true }; },
    hasSourceCapability(capability) { return capability === 'posts'; },
    async listPosts() {
      page += 1;
      if (page === 1) return { items: [{ externalId: 'post-1', title: '', body: 'one', publishedAt: new Date(), sourceUrl: 'https://www.facebook.com/post-1' }], nextCursor: 'after-first', hasMore: true, capability: 'full' };
      const error = new Error('Facebook API unavailable'); error.code = 'FACEBOOK_API_UNAVAILABLE'; throw error;
    }
  };
  await runPagedSource({
    repo,
    credentialContext: { async load() { return { apiToken: TOKEN }; } },
    ai: { configured() { return false; } },
    alertEngine: {},
    leaseOwner: 'worker-1',
    leaseSeconds: 30,
    pageBudget: 3,
    pageSize: 25
  }, SOURCE, connector, { id: 'run-1' }, { id: 'sync-run-1', sync_mode: 'backfill' }, ACCOUNT);

  assert.equal(finished.find(item => item.kind === 'sync').status, 'partial');
  assert.equal(finished.find(item => item.kind === 'sync').errorCode, 'FACEBOOK_API_UNAVAILABLE');
  assert.equal(finished.find(item => item.kind === 'source').status, 'partial');
});

test('Facebook replies use a comment-domain checkpoint with platform-specific task identity', async () => {
  const claims = [];
  const repo = {
    async claimSyncCheckpoint(input) { claims.push(input); return { id: 'checkpoint-reply', cursor: null }; },
    async upsertContentPage() { return { contents: [], storedCount: 0 }; },
    async releaseSyncCheckpoint() {}
  };
  const connector = { async listComments() { return { items: [], nextCursor: null, hasMore: false, capability: 'full' }; } };
  await syncStage({ repo, leaseOwner: 'worker-1', leaseSeconds: 30, pageBudget: 1, pageSize: 25 }, {
    source: SOURCE,
    account: ACCOUNT,
    connector,
    scope: 'comments',
    rootPlatformContentId: 'post-1',
    postPlatformId: 'post-1',
    commentId: 'comment-1',
    syncMode: 'backfill',
    taskKind: 'facebook_reply',
    taskKey: 'reply:comment-1'
  });
  assert.deepEqual({
    syncScope: claims[0].syncScope,
    taskKind: claims[0].taskKind,
    taskKey: claims[0].taskKey,
    rootPlatformContentId: claims[0].rootPlatformContentId
  }, {
    syncScope: 'comments',
    taskKind: 'facebook_reply',
    taskKey: 'reply:comment-1',
    rootPlatformContentId: 'post-1'
  });
});

test('three exhausted Facebook levels complete fully and an unchanged second run neither duplicates nor re-enqueues AI', async () => {
  const rows = new Map();
  const commits = [];
  const enqueued = [];
  const finished = [];
  let activeRun = 'sync-run-first';
  const repo = {
    async getDefaultAccount() { return ACCOUNT; },
    async updateAccount() {},
    async updateSourceAuth() {},
    async claimSyncCheckpoint(input) {
      return { id: `${activeRun}:${input.taskKind}:${input.taskKey}`, cursor: null };
    },
    async upsertContentPage(input) {
      commits.push(input);
      const contents = input.items.map(item => {
        const previous = rows.get(item.externalId);
        const change = !previous ? 'inserted' : previous.fingerprint === item.fingerprint ? 'unchanged' : 'changed';
        const content = {
          id: previous?.id || `db-${item.externalId}`,
          external_id: item.externalId,
          content_type: item.contentType,
          content_depth: item.contentDepth,
          platform_parent_id: item.platformParentId,
          published_at: item.publishedAt,
          fingerprint: item.fingerprint
        };
        rows.set(item.externalId, content);
        return { content, change };
      });
      return { contents, storedCount: contents.filter(item => item.change !== 'unchanged').length };
    },
    async releaseSyncCheckpoint() {},
    async listSyncParents() { return [{ root_platform_content_id: 'post-1', post_platform_id: 'post-1' }]; },
    async loadKeywordRules() { return []; },
    async enqueueAnalysisJob(contentId, input) { enqueued.push({ run: activeRun, contentId, input }); },
    async claimAnalysisJobs() { return []; },
    async finishAnalysisJob() {},
    async finishSyncRun(id, patch) { finished.push({ id, ...patch }); return { id, ...patch }; },
    async finishRun() {},
    async markSourceRun() {}
  };
  const connector = {
    async installationHealth() { return { installed: true, configured: true }; },
    hasSourceCapability(capability) { return ['posts', 'comments', 'replies'].includes(capability); },
    async listPosts() {
      return { items: [{ externalId: 'post-1', contentType: 'post', title: '', body: 'post', authorName: '', publishedAt: new Date('2026-09-10T01:00:00Z'), sourceUrl: 'https://www.facebook.com/post-1', fingerprint: 'fp-post' }], nextCursor: null, hasMore: false, capability: 'full' };
    },
    async listComments(input) {
      if (input.commentId) return this.listReplies(input);
      return { items: [{ externalId: 'comment-1', contentType: 'comment', title: '', body: 'comment', authorName: '', publishedAt: new Date('2026-09-10T02:00:00Z'), sourceUrl: 'https://www.facebook.com/comment-1', fingerprint: 'fp-comment', rootPlatformContentId: 'post-1', contentDepth: 1 }], replyTargets: [{ postId: 'post-1', commentId: 'comment-1' }], nextCursor: null, hasMore: false, capability: 'full' };
    },
    async listReplies() {
      return { items: [{ externalId: 'reply-1', contentType: 'comment', title: '', body: 'reply', authorName: '', publishedAt: new Date('2026-09-10T03:00:00Z'), sourceUrl: 'https://www.facebook.com/reply-1', fingerprint: 'fp-reply', rootPlatformContentId: 'post-1', platformParentId: 'comment-1', contentDepth: 2 }], nextCursor: null, hasMore: false, capability: 'full' };
    }
  };
  const deps = {
    repo,
    credentialContext: { async load() { return { apiToken: TOKEN }; } },
    ai: { configured(profile) { return profile === 'light'; }, selectProfile(profile) { return { name: profile, version: `${profile}-v1` }; } },
    alertEngine: {},
    leaseOwner: 'worker-1',
    leaseSeconds: 30,
    pageBudget: 2,
    pageSize: 25
  };

  await runPagedSource(deps, SOURCE, connector, { id: 'run-first' }, { id: activeRun, sync_mode: 'backfill' }, ACCOUNT);
  activeRun = 'sync-run-second';
  await runPagedSource(deps, SOURCE, connector, { id: 'run-second' }, { id: activeRun, sync_mode: 'incremental' }, ACCOUNT);

  assert.equal(rows.size, 3);
  assert.deepEqual([...rows.keys()].sort(), ['comment-1', 'post-1', 'reply-1']);
  assert.equal(rows.get('comment-1').content_depth, 1);
  assert.equal(rows.get('reply-1').content_depth, 2);
  assert.equal(rows.get('reply-1').platform_parent_id, 'comment-1');
  assert.deepEqual(finished.map(item => item.status), ['completed_full', 'completed_full']);
  assert.deepEqual(enqueued.map(item => item.contentId).sort(), ['db-comment-1', 'db-post-1', 'db-reply-1']);
  assert.equal(commits.filter(item => item.taskKind === 'facebook_reply').length, 2);
});

test('Facebook inserted and body-changed content enters light AI while unchanged reruns do not', async () => {
  const enqueued = [];
  const repo = {
    async loadKeywordRules() { return []; },
    async enqueueAnalysisJob(contentId, input) { enqueued.push({ contentId, input }); },
    async claimAnalysisJobs() { return []; },
    async finishAnalysisJob() {}
  };
  const ai = {
    configured(profile) { return profile === 'light'; },
    selectProfile(profile) { return { name: profile, version: `${profile}-v1`, model: 'test' }; }
  };
  const entries = [
    { content: { id: 'db-post-new' }, raw: { title: '', body: 'new', fingerprint: 'fp-new' }, change: 'inserted' },
    { content: { id: 'db-comment-changed' }, raw: { title: '', body: 'changed', fingerprint: 'fp-changed' }, change: 'changed' },
    { content: { id: 'db-reply-same' }, raw: { title: '', body: 'same', fingerprint: 'fp-same' }, change: 'unchanged' }
  ];

  await processDownstream({ repo, ai, alertEngine: {}, leaseOwner: 'worker-1', leaseSeconds: 30 }, SOURCE, entries);
  assert.deepEqual(enqueued.map(item => item.contentId), ['db-post-new', 'db-comment-changed']);
  assert.ok(enqueued.every(item => item.input.profile === 'light' && item.input.triggerReason === 'all_content'));
});

test('Worker registers Facebook and same-account advisory lock prevents a concurrent collection', async () => {
  const productionDeps = buildDeps();
  assert.ok(productionDeps.connectors.facebook instanceof FacebookGraphConnector);

  const lockCalls = [];
  let connectorCalls = 0;
  const repo = {
    async getDefaultAccount() { return ACCOUNT; },
    async acquireAdvisoryLock(name, timeout) { lockCalls.push({ name, timeout }); return false; },
    async releaseAdvisoryLock() { throw new Error('unacquired lock must not be released'); }
  };
  const connector = { async listPosts() { connectorCalls += 1; } };
  const result = await runPagedSource({ repo }, SOURCE, connector, { id: 'run-1' }, { id: 'sync-run-1' }, ACCOUNT);
  assert.deepEqual(result, { skipped: true, reason: 'account_locked' });
  assert.deepEqual(lockCalls, [{ name: `public-opinion-sync-account-${ACCOUNT.id}`, timeout: 0 }]);
  assert.equal(connectorCalls, 0);
  if (productionDeps.repo?.pool?.end) await productionDeps.repo.pool.end();
});
