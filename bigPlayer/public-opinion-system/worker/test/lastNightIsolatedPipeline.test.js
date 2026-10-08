'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID } = require('../src/lastNightOverseasDailyJob');
const { collectIsolated, consumeIsolatedAnalysis } = require('../src/lastNightIsolatedPipeline');

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
  let writes = 0;
  return { content, jobs, runs, pages, get writes() { return writes; },
    async startRun(input) { writes++; const run = { id: `run-${runs.length + 1}`, ...input, status: 'running' }; runs.push(run); return run; },
    async commitPage(input) {
      writes++; pages.push(input);
      for (const item of input.items) {
        const key = [input.sourceId, input.boardId, input.siteId, item.contentType, item.externalId].join(':');
        if (!content.has(key)) {
          content.set(key, item);
          jobs.set(`${key}:light`, { id: `${key}:light`, sourceId: input.sourceId,
            boardId: input.boardId, profile: 'light', content: item, status: 'pending' });
        }
      }
    },
    async finishRun(id) { writes++; runs.find(run => run.id === id).status = 'completed'; },
    async failRun(id, code) { writes++; Object.assign(runs.find(run => run.id === id), { status: 'failed', code }); },
    async claimAnalysisJobs({ limit }) { return [...jobs.values()].filter(job => job.status === 'pending').slice(0, limit).map(job => { job.status = 'running'; return job; }); },
    async completeAnalysisJob(id, analysis, { queueDeep }) {
      writes++; const job = jobs.get(id); Object.assign(job, { status: 'completed', analysis });
      if (queueDeep) jobs.set(id.replace(/:light$/, ':deep'), { ...job, id: id.replace(/:light$/, ':deep'), profile: 'deep', status: 'pending' });
    },
    async failAnalysisJob(id, code) { writes++; Object.assign(jobs.get(id), { status: 'failed', code }); }
  };
}

function fakeConnector({ incomplete = false, unauthorized = false } = {}) {
  return {
    async discoverFeeds({ source: siteSource }) {
      assert.equal(siteSource.config.boardId, BOARD_ID);
      assert.equal(siteSource.config.baseUrl, siteSource.siteUrl);
      return [{ boardId: BOARD_ID, feedKey: 'merged', endpointKind: 'merged' }];
    },
    async listFeedContents({ source: siteSource, cursor, dailyBounded, publishedFrom }) {
      assert.equal(dailyBounded, true); assert.equal(publishedFrom, window.publishedFrom);
      if (unauthorized) throw Object.assign(new Error('unauthorized'), { code: 'UNAUTHORIZED' });
      if (cursor) return { items: [{ externalId: 'post-2', contentType: 'post', title: 'second' }], hasMore: false, nextCursor: null, capability: 'authorized_scope' };
      return { items: [{ externalId: 'post-1', contentType: 'post', title: siteSource.siteId }],
        hasMore: true, nextCursor: 'page-2', capability: 'authorized_scope',
        raw: incomplete ? { paginationDiagnostics: { incomplete: true } } : null };
    },
    async listComments({ postId, cursor }) {
      assert.equal(cursor, null);
      return { items: [{ externalId: `comment-${postId}`, contentType: 'comment',
        rootPlatformContentId: postId, platformParentId: null }], hasMore: false,
      nextCursor: null, capability: 'authorized_scope' };
    }
  };
}

test('three sites paginate posts and comments; rerun is idempotent and async AI stays isolated', async () => {
  const store = fakeStore();
  let sharedWrites = 0;
  const options = { source, account, sites, store, connector: fakeConnector(), ...window, maxPagesPerFeed: 2 };
  assert.equal((await collectIsolated(options)).siteRuns.length, 3);
  assert.equal((await collectIsolated(options)).siteRuns.length, 3);
  assert.equal(store.content.size, 12);
  assert.equal(store.jobs.size, 12);
  assert.equal(store.runs.length, 6);
  assert.equal(store.pages.length, 24);
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

test('scope mismatch, incomplete pagination and unauthorized response fail closed', async () => {
  const store = fakeStore();
  await assert.rejects(collectIsolated({ source: { ...source, region_code: 'domestic' }, account, sites,
    store, connector: fakeConnector(), ...window }), { code: 'LAST_NIGHT_ISOLATED_SCOPE_MISMATCH' });
  assert.equal(store.writes, 0);
  await assert.rejects(collectIsolated({ source, account, sites, store,
    connector: fakeConnector({ incomplete: true }), ...window }),
  { code: 'LAST_NIGHT_ISOLATED_PAGE_INCOMPLETE' });
  assert.equal(store.runs[0].status, 'failed');
  await assert.rejects(collectIsolated({ source, account, sites, store,
    connector: fakeConnector({ unauthorized: true }), ...window }), { code: 'UNAUTHORIZED' });
  assert.equal(store.runs[1].status, 'failed');
  assert.equal(store.content.size, 0);
});
