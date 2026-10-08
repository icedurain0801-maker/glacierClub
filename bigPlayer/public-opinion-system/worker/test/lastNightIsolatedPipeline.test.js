'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { BigPlayerH5Connector } = require('../../server/src/connectors/bigPlayerH5Connector');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID } = require('../src/lastNightOverseasDailyJob');
const { collectIsolated, consumeIsolatedAnalysis,
  registerIsolatedFixtureConnector } = require('../src/lastNightIsolatedPipeline');

const sites = [1, 2, 3].map(index => ({ siteId: `site-${index}`,
  url: `https://club-en.q1.com/?env=web&gameId=2177&gameVersion=1&site=${index}` }));
const source = { id: SOURCE_ID, game_id: GAME_ID, community_id: COMMUNITY_ID,
  region_code: 'overseas', platform: 'bigplayer_h5', config: { boardId: BOARD_ID } };
const account = { id: 'last-night-account', source_id: SOURCE_ID, platform: 'bigplayer_h5' };
const window = { publishedFrom: '2026-10-07T00:00:00.000Z', publishedTo: '2026-10-08T00:00:00.000Z' };

function fakeStore() {
  const content = new Map();
  const jobs = new Map();
  const runs = [];
  const pages = [];
  const tasks = new Set();
  const checkpoints = new Map();
  let writes = 0;
  let renewals = 0;
  const pageKey = input => [input.runId, input.scope, input.feedKey,
    input.rootPostId || '', input.commentId || ''].join(':');
  return { content, jobs, runs, pages, tasks, checkpoints,
    get writes() { return writes; }, get renewals() { return renewals; },
    async startRun(input) {
      const existing = runs.find(run => run.sourceId === input.sourceId && run.siteId === input.siteId &&
        run.publishedFrom === input.publishedFrom && run.publishedTo === input.publishedTo);
      if (existing) {
        if (existing.status === 'failed') {
          if (input.retryFailed !== true) throw Object.assign(new Error('retry approval'), { code: 'LAST_NIGHT_STORE_RETRY_APPROVAL_REQUIRED' });
          existing.status = 'running';
        }
        return existing;
      }
      writes++; const run = { id: `run-${runs.length + 1}`, ...input, status: 'running', leaseEpoch: 1 }; runs.push(run); return run;
    },
    async loadPageState(input) { return checkpoints.get(pageKey(input)) || null; },
    async renewRunLease(id, leaseEpoch) {
      renewals += 1;
      assert.equal(leaseEpoch, 1);
      assert.equal(runs.find(run => run.id === id)?.status, 'running');
    },
    async registerFeeds(runId, leaseEpoch, feeds) {
      assert.equal(leaseEpoch, 1);
      for (const feed of feeds) tasks.add(pageKey({ runId, scope: 'posts', feedKey: feed.feedKey }));
    },
    async registerTask(input) { tasks.add(pageKey(input)); },
    async commitPage(input) {
      assert.ok(tasks.has(pageKey(input)));
      writes++; pages.push(input);
      checkpoints.set(pageKey(input), { nextCursor: input.nextCursor,
        pageSeq: (checkpoints.get(pageKey(input))?.pageSeq || 0) + 1,
        status: input.hasMore ? 'running' : 'complete' });
      for (const item of input.items) {
        const key = [input.sourceId, input.boardId, input.siteId, item.contentType, item.externalId].join(':');
        if (!content.has(key)) {
          content.set(key, item);
          jobs.set(`${key}:light`, { id: `${key}:light`, sourceId: input.sourceId,
            boardId: input.boardId, profile: 'light', content: item, status: 'pending' });
        }
      }
    },
    async finishRun(id, leaseEpoch) {
      assert.equal(leaseEpoch, 1);
      assert.ok([...tasks].filter(key => key.startsWith(`${id}:`)).every(key => checkpoints.get(key)?.status === 'complete'));
      writes++; runs.find(run => run.id === id).status = 'completed';
    },
    async failRun(id, leaseEpoch, code) { assert.equal(leaseEpoch, 1); writes++; Object.assign(runs.find(run => run.id === id), { status: 'failed', code }); },
    async claimAnalysisJobs({ limit }) { return [...jobs.values()].filter(job => job.status === 'pending').slice(0, limit).map(job => { job.status = 'running'; return job; }); },
    async renewAnalysisJobLease(id) { assert.equal(jobs.get(id)?.status, 'running'); },
    async completeAnalysisJob(id, _leaseEpoch, analysis, { queueDeep }) {
      writes++; const job = jobs.get(id); Object.assign(job, { status: 'completed', analysis });
      if (queueDeep) jobs.set(id.replace(/:light$/, ':deep'), { ...job, id: id.replace(/:light$/, ':deep'), profile: 'deep', status: 'pending' });
    },
    async failAnalysisJob(id, _leaseEpoch, code) { writes++; Object.assign(jobs.get(id), { status: 'failed', code }); }
  };
}

function fakeConnector({ incomplete = false, unauthorized = false, activity = false } = {}) {
  return registerIsolatedFixtureConnector({
    async discoverFeeds({ source: siteSource }) {
      assert.equal(siteSource.config.boardId, BOARD_ID);
      assert.equal(siteSource.config.baseUrl, siteSource.siteUrl);
      return [{ boardId: BOARD_ID, feedKey: 'merged', endpointKind: 'merged' }];
    },
    async listFeedContents({ source: siteSource, cursor, dailyBounded, publishedFrom }) {
      assert.equal(dailyBounded, true); assert.equal(publishedFrom, window.publishedFrom);
      if (unauthorized) throw Object.assign(new Error('unauthorized'), { code: 'UNAUTHORIZED' });
      if (cursor) return { items: [{ externalId: 'post-2', contentType: 'post', title: 'second' }], hasMore: false, nextCursor: null, capability: 'authorized_scope' };
      return { items: [{ externalId: 'post-1', contentType: activity ? 'activity' : 'post',
        title: siteSource.siteId }],
        hasMore: true, nextCursor: 'page-2', capability: 'authorized_scope',
        raw: incomplete ? { paginationDiagnostics: { incomplete: true } } : null };
    },
    async listComments({ postId, cursor }) {
      assert.equal(cursor, null);
      return { items: [{ externalId: `comment-${postId}`, contentType: 'comment',
        rootPlatformContentId: postId, platformParentId: null }], hasMore: false,
      nextCursor: null, capability: 'authorized_scope' };
    }
  });
}

test('three sites paginate posts and comments; rerun is idempotent and async AI stays isolated', async () => {
  const store = fakeStore();
  let sharedWrites = 0;
  const options = { source, account, sites, store, connector: fakeConnector(), ...window, maxPagesPerFeed: 2 };
  assert.equal((await collectIsolated(options)).siteRuns.length, 3);
  assert.equal((await collectIsolated(options)).siteRuns.length, 3);
  assert.equal(store.content.size, 12);
  assert.equal(store.jobs.size, 12);
  assert.equal(store.runs.length, 3);
  assert.equal(store.pages.length, 12);
  const ai = { configured: () => true, async analyzeBatch(items, profile) {
    return items.map(() => ({ sentiment: 'negative', profile, needsDeep: profile === 'light' }));
  } };
  assert.equal((await consumeIsolatedAnalysis({ store, ai, deepPolicy: analysis => analysis.needsDeep, limit: 20 })).jobs, 12);
  assert.equal((await consumeIsolatedAnalysis({ store, ai, deepPolicy: analysis => analysis.needsDeep, limit: 20 })).jobs, 12);
  assert.equal(store.jobs.size, 24);
  assert.ok([...store.jobs.values()].every(job => job.status === 'completed'));
  assert.ok(store.writes > 0);
  assert.equal(sharedWrites, 0);
});

test('overseas activity feed items remain valid post-scope roots', async () => {
  const store = fakeStore();
  const result = await collectIsolated({ source, account, sites, store,
    connector: fakeConnector({ activity: true }), ...window, maxPagesPerFeed: 2 });
  assert.equal(result.siteRuns.length, 3);
  assert.equal([...store.content.values()].filter(item => item.contentType === 'activity').length, 3);
  assert.equal([...store.content.values()].filter(item => item.contentType === 'comment').length, 6);
});

test('real connector rejects identical upstream requests before any I/O', async () => {
  const store = fakeStore();
  let requests = 0;
  const connector = new BigPlayerH5Connector({}, { fetchImpl: async () => { requests += 1; } });
  await assert.rejects(collectIsolated({ source, account, sites, store, connector, ...window }),
    { code: 'LAST_NIGHT_UPSTREAM_SITE_COLLISION' });
  assert.equal(requests, 0);
  assert.equal(store.writes, 0);
  const wrapped = {
    discoverFeeds: (...args) => connector.discoverFeeds(...args),
    listFeedContents: (...args) => connector.listFeedContents(...args),
    listComments: (...args) => connector.listComments(...args)
  };
  await assert.rejects(collectIsolated({ source, account, sites, store,
    connector: wrapped, ...window }), { code: 'LAST_NIGHT_FIXTURE_CONNECTOR_REQUIRED' });
  assert.equal(requests, 0);
  assert.equal(store.writes, 0);
  const languages = ['en-US', 'fr-FR', 'ja-JP'];
  const languageSites = sites.map((site, index) => ({ ...site,
    url: `${site.url}&lang=${languages[index]}` }));
  await assert.rejects(collectIsolated({ source, account, sites: languageSites,
    store, connector, ...window }),
  { code: 'LAST_NIGHT_UPSTREAM_SITE_IDENTITY_UNVERIFIED' });
  assert.equal(requests, 0);
  assert.equal(store.writes, 0);
});

test('slow AI renews every claimed job before the first analysis returns', async () => {
  const jobs = [1, 2].map(n => ({ id: `job-${n}`, leaseEpoch: 1,
    sourceId: SOURCE_ID, boardId: BOARD_ID, profile: 'light', content: { title: 'fixture' } }));
  const renewed = [];
  const completed = [];
  const store = {
    claimAnalysisJobs: async () => jobs,
    renewAnalysisJobLease: async id => { renewed.push(id); },
    completeAnalysisJob: async id => { completed.push(id); },
    failAnalysisJob: async () => { throw new Error('unexpected failure'); }
  };
  const result = await consumeIsolatedAnalysis({ store,
    ai: { configured: () => true, analyzeBatch: async () => {
      await new Promise(resolve => setTimeout(resolve, 35));
      return [{ sentiment: 'neutral' }];
    } }, deepPolicy: () => false, limit: 2, heartbeatMs: 10 });
  assert.equal(result.jobs, 2);
  assert.deepEqual(completed, ['job-1', 'job-2']);
  assert.ok(renewed.includes('job-2'));
  assert.ok(renewed.length >= 2);
});

test('AI lease loss prevents result commit and fails the claimed batch', async () => {
  const failed = [];
  let completed = 0;
  const error = Object.assign(new Error('lease lost'), { code: 'LAST_NIGHT_STORE_AI_LEASE_LOST' });
  const store = {
    claimAnalysisJobs: async () => [{ id: 'job-1', leaseEpoch: 1,
      sourceId: SOURCE_ID, boardId: BOARD_ID, profile: 'light', content: {} }],
    renewAnalysisJobLease: async () => { throw error; },
    completeAnalysisJob: async () => { completed += 1; },
    failAnalysisJob: async id => { failed.push(id); }
  };
  await assert.rejects(consumeIsolatedAnalysis({ store,
    ai: { configured: () => true, analyzeBatch: async () => {
      await new Promise(resolve => setTimeout(resolve, 35));
      return [{ sentiment: 'neutral' }];
    } }, deepPolicy: () => false, heartbeatMs: 10 }),
  { code: 'LAST_NIGHT_STORE_AI_LEASE_LOST' });
  assert.equal(completed, 0);
  assert.deepEqual(failed, ['job-1']);
});

test('scope mismatch, incomplete pagination and unauthorized response fail closed', async () => {
  const store = fakeStore();
  await assert.rejects(collectIsolated({ source: { ...source, region_code: 'domestic' }, account, sites,
    store, connector: fakeConnector(), ...window }), { code: 'LAST_NIGHT_ISOLATED_SCOPE_MISMATCH' });
  assert.equal(store.writes, 0);
  await assert.rejects(collectIsolated({ source, account, sites, store,
    connector: fakeConnector({ incomplete: true }), ...window }),
  { code: 'LAST_NIGHT_ISOLATED_PAGE_INCOMPLETE' });
  assert.equal(store.runs[0].status, 'failed');
  const unauthorizedStore = fakeStore();
  await assert.rejects(collectIsolated({ source, account, sites, store: unauthorizedStore,
    connector: fakeConnector({ unauthorized: true }), ...window }), { code: 'UNAUTHORIZED' });
  assert.equal(unauthorizedStore.runs[0].status, 'failed');
  assert.equal(store.content.size, 0);
  assert.equal(unauthorizedStore.content.size, 0);
});

test('comment failure preserves post cursor and resumes committed comment page', async () => {
  const store = fakeStore();
  const postCursors = [];
  const commentCursors = [];
  let failSecondCommentPage = true;
  const connector = registerIsolatedFixtureConnector({
    async discoverFeeds() { return [{ boardId: BOARD_ID, feedKey: 'merged' }]; },
    async listFeedContents({ source: siteSource, cursor }) {
      if (siteSource.siteId !== 'site-1') return { items: [], hasMore: false, capability: 'authorized_scope' };
      postCursors.push(cursor);
      return cursor === 'p2'
        ? { items: [{ externalId: 'post-2', contentType: 'post' }], hasMore: false, capability: 'authorized_scope' }
        : { items: [{ externalId: 'post-1', contentType: 'post' }], hasMore: true,
          nextCursor: 'p2', capability: 'authorized_scope' };
    },
    async listComments({ postId, cursor }) {
      if (postId === 'post-2') return { items: [], hasMore: false, capability: 'authorized_scope' };
      commentCursors.push(cursor);
      if (cursor === 'c2' && failSecondCommentPage) {
        failSecondCommentPage = false;
        throw Object.assign(new Error('temporary failure'), { code: 'UPSTREAM_FAILED' });
      }
      return cursor === 'c2'
        ? { items: [{ externalId: 'comment-2', contentType: 'comment' }], hasMore: false, capability: 'authorized_scope' }
        : { items: [{ externalId: 'comment-1', contentType: 'comment' }], hasMore: true,
          nextCursor: 'c2', capability: 'authorized_scope' };
    }
  });
  const options = { source, account, sites, store, connector, ...window,
    maxPagesPerFeed: 2, maxCommentPages: 2 };
  await assert.rejects(collectIsolated(options), { code: 'UPSTREAM_FAILED' });
  assert.equal(store.loadPageState && (await store.loadPageState({ runId: 'run-1', scope: 'posts', feedKey: 'merged' })), null);
  assert.equal((await store.loadPageState({ runId: 'run-1', scope: 'comments', feedKey: 'merged', rootPostId: 'post-1' })).nextCursor, 'c2');
  assert.equal((await collectIsolated({ ...options, retryFailed: true })).status, 'collected');
  assert.deepEqual(postCursors, [null, null, 'p2']);
  assert.deepEqual(commentCursors, [null, 'c2', 'c2']);
  assert.equal(store.content.size, 4);
  assert.equal(store.runs.length, 3);
});

test('retry cannot reset the persisted page budget', async () => {
  const store = fakeStore();
  const connector = fakeConnector();
  await assert.rejects(collectIsolated({ source, account, sites, store, connector,
    ...window, maxPagesPerFeed: 1 }), { code: 'LAST_NIGHT_ISOLATED_PAGE_BUDGET' });
  const pageCount = store.pages.length;
  await assert.rejects(collectIsolated({ source, account, sites, store, connector,
    ...window, maxPagesPerFeed: 1, retryFailed: true }),
  { code: 'LAST_NIGHT_ISOLATED_PAGE_BUDGET' });
  assert.equal(store.pages.length, pageCount);
});

test('run lease renews while an upstream page request is in flight', async () => {
  const store = fakeStore();
  const connector = fakeConnector();
  const original = connector.listFeedContents;
  connector.listFeedContents = async input => {
    await new Promise(resolve => setTimeout(resolve, 60));
    return original(input);
  };
  await collectIsolated({ source, account, sites, store, connector,
    ...window, maxPagesPerFeed: 2, heartbeatMs: 10 });
  assert.ok(store.renewals >= 20);
});
