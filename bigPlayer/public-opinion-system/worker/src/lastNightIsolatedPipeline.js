'use strict';

const { boardIdOf } = require('../../shared/bigPlayerBoard');
const { flattenCommentTree } = require('../../server/src/connectors/baseConnector');
const { BigPlayerH5Connector } = require('../../server/src/connectors/bigPlayerH5Connector');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID } = require('./lastNightOverseasDailyJob');
const fixtureConnectors = new WeakSet();

function reject(code) { const error = new Error(code); error.code = code; throw error; }

function assertScope({ source, account, sites, publishedFrom, publishedTo }) {
  if (String(source?.id) !== SOURCE_ID || String(source.game_id) !== GAME_ID ||
    String(source.community_id) !== COMMUNITY_ID || source.region_code !== 'overseas' ||
    source.platform !== 'bigplayer_h5' || String(boardIdOf(source)) !== BOARD_ID ||
    String(account?.source_id) !== SOURCE_ID || account.platform !== 'bigplayer_h5') {
    reject('LAST_NIGHT_ISOLATED_SCOPE_MISMATCH');
  }
  if (!Array.isArray(sites) || sites.length !== 3 ||
    new Set(sites.map(site => String(site.siteId))).size !== 3 ||
    new Set(sites.map(site => String(site.url))).size !== 3) reject('LAST_NIGHT_ISOLATED_SITES_INVALID');
  for (const site of sites) {
    let url;
    try { url = new URL(site.url); } catch { reject('LAST_NIGHT_ISOLATED_SITES_INVALID'); }
    if (!site.siteId || url.protocol !== 'https:' || url.hostname !== 'club-en.q1.com' ||
      (url.port && url.port !== '443') || url.username || url.password || url.hash ||
      url.toString() !== site.url) reject('LAST_NIGHT_ISOLATED_SITES_INVALID');
  }
  const from = Date.parse(publishedFrom);
  const to = Date.parse(publishedTo);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to ||
    to - from > 7 * 24 * 60 * 60 * 1000) reject('LAST_NIGHT_ISOLATED_WINDOW_INVALID');
}

function scopedSource(source, site) {
  const config = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
  return { ...source, siteId: site.siteId, site_id: site.siteId, siteUrl: site.url,
    config: { ...config, baseUrl: site.url } };
}

function registerIsolatedFixtureConnector(connector) {
  if (!connector || typeof connector !== 'object' || connector instanceof BigPlayerH5Connector) {
    reject('LAST_NIGHT_FIXTURE_CONNECTOR_INVALID');
  }
  fixtureConnectors.add(connector);
  return connector;
}

function assertConnectorSiteIdentity(connector, sites) {
  if (fixtureConnectors.has(connector)) return;
  if (!(connector instanceof BigPlayerH5Connector)) reject('LAST_NIGHT_FIXTURE_CONNECTOR_REQUIRED');
  const signatures = sites.map(site => {
    const url = new URL('/api/club/v1/auth/user/context', site.url);
    const language = new URL(site.url).searchParams.get('lang') || 'zh-Hans';
    return JSON.stringify([url.origin, url.pathname, url.search, language]);
  });
  if (new Set(signatures).size !== sites.length) reject('LAST_NIGHT_UPSTREAM_SITE_COLLISION');
  reject('LAST_NIGHT_UPSTREAM_SITE_IDENTITY_UNVERIFIED');
}

function assertCollectionAdmission({ source, account, sites, connector, publishedFrom, publishedTo }) {
  assertScope({ source, account, sites, publishedFrom, publishedTo });
  assertConnectorSiteIdentity(connector, sites);
}

function assertPage(page, cursor) {
  if (!page || !Array.isArray(page.items) || typeof page.hasMore !== 'boolean' ||
    (page.hasMore && (!page.nextCursor || page.nextCursor === cursor)) ||
    page.capability !== 'authorized_scope' || page.raw?.paginationDiagnostics?.incomplete) {
    reject('LAST_NIGHT_ISOLATED_PAGE_INCOMPLETE');
  }
}

async function pages({ load, commit, renew, maxPages, state = null }) {
  if (state?.status === 'complete') return;
  let cursor = state?.nextCursor ?? null;
  for (let index = Number(state?.pageSeq || 0); index < maxPages; index += 1) {
    await renew();
    const page = await load(cursor);
    await renew();
    assertPage(page, cursor);
    await commit(page, cursor);
    if (!page.hasMore) return;
    cursor = page.nextCursor;
  }
  reject('LAST_NIGHT_ISOLATED_PAGE_BUDGET');
}

async function collectIsolated({ source, account, sites, connector, credentialContext, store,
  publishedFrom, publishedTo, pageSize = 20, maxPagesPerFeed = 100, maxCommentPages = 100,
  retryFailed = false, heartbeatMs = 30000, signal } = {}) {
  assertCollectionAdmission({ source, account, sites, connector, publishedFrom, publishedTo });
  if (!connector?.discoverFeeds || !connector?.listFeedContents || !connector?.listComments ||
    !store?.startRun || !store?.loadPageState || !store?.commitPage ||
    !store?.finishRun || !store?.failRun || !store?.renewRunLease ||
    !store?.registerFeeds || !store?.registerTask ||
    !Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxPagesPerFeed) || maxPagesPerFeed < 1 ||
    !Number.isInteger(maxCommentPages) || maxCommentPages < 1 ||
    !Number.isInteger(heartbeatMs) || heartbeatMs < 10 || heartbeatMs > 60000) reject('LAST_NIGHT_ISOLATED_DEPS_INVALID');
  const result = [];
  for (const site of sites) {
    if (signal?.aborted) reject('LAST_NIGHT_ISOLATED_ABORTED');
    const siteSource = scopedSource(source, site);
    const run = await store.startRun({ sourceId: SOURCE_ID, accountId: account.id,
      communityId: COMMUNITY_ID, boardId: BOARD_ID, siteId: site.siteId,
      siteUrl: site.url, publishedFrom, publishedTo, retryFailed });
    if (run.status === 'completed') {
      result.push({ siteId: site.siteId, runId: run.id, status: 'completed' });
      continue;
    }
    let heartbeatFailure = null;
    let pendingHeartbeat = Promise.resolve();
    const renew = async () => {
      await pendingHeartbeat;
      if (heartbeatFailure) throw heartbeatFailure;
      await store.renewRunLease(run.id, run.leaseEpoch);
    };
    const heartbeat = setInterval(() => {
      pendingHeartbeat = pendingHeartbeat.then(() => store.renewRunLease(run.id, run.leaseEpoch))
        .catch(error => { heartbeatFailure = error; });
    }, heartbeatMs);
    heartbeat.unref?.();
    try {
      const feeds = await connector.discoverFeeds({ source: siteSource, account, credentialContext, signal });
      if (!Array.isArray(feeds) || !feeds.length || feeds.some(feed => String(feed.boardId) !== BOARD_ID) ||
        new Set(feeds.map(feed => feed.feedKey)).size !== feeds.length) reject('LAST_NIGHT_ISOLATED_FEEDS_INVALID');
      await renew();
      await store.registerFeeds(run.id, run.leaseEpoch, feeds);
      for (const feed of feeds) {
        const postKey = { runId: run.id, scope: 'posts', feedKey: feed.feedKey, rootPostId: '' };
        await pages({ maxPages: maxPagesPerFeed, renew,
          state: await store.loadPageState(postKey),
          load: cursor => connector.listFeedContents({ source: siteSource, account, credentialContext,
            feed, cursor, limit: pageSize, dailyBounded: true, publishedFrom, publishedTo, signal }),
          commit: async (page, cursor) => {
            for (const post of page.items) {
              if (!post.externalId || !['post', 'activity'].includes(post.contentType)) {
                reject('LAST_NIGHT_ISOLATED_POST_INVALID');
              }
              const commentKey = { runId: run.id, scope: 'comments', feedKey: feed.feedKey,
                rootPostId: post.externalId };
              await store.registerTask({ ...commentKey, leaseEpoch: run.leaseEpoch });
              await pages({ maxPages: maxCommentPages, renew,
                state: await store.loadPageState(commentKey),
                load: commentCursor => connector.listComments({ source: siteSource, account,
                  credentialContext, postId: post.externalId, cursor: commentCursor, limit: pageSize,
                  dailyBounded: true, publishedFrom, publishedTo, signal }),
                commit: async (commentPage, commentCursor) => {
                  for (const target of commentPage.replyTargets || []) {
                    if (String(target.postId) !== String(post.externalId) || !target.commentId) {
                      reject('LAST_NIGHT_ISOLATED_REPLY_TARGET_INVALID');
                    }
                    const replyKey = { runId: run.id, scope: 'replies', feedKey: feed.feedKey,
                      rootPostId: post.externalId, commentId: String(target.commentId) };
                    await store.registerTask({ ...replyKey, leaseEpoch: run.leaseEpoch });
                    await pages({ maxPages: maxCommentPages, renew,
                      state: await store.loadPageState(replyKey),
                      load: replyCursor => connector.listComments({ source: siteSource, account,
                        credentialContext, postId: post.externalId, commentId: target.commentId,
                        sortType: target.sortType, cursor: replyCursor, limit: pageSize,
                        dailyBounded: true, publishedFrom, publishedTo, signal }),
                      commit: (replyPage, replyCursor) => store.commitPage({ ...replyKey,
                        leaseEpoch: run.leaseEpoch, sourceId: SOURCE_ID, siteId: site.siteId,
                        boardId: BOARD_ID, cursor: replyCursor, nextCursor: replyPage.nextCursor,
                        hasMore: replyPage.hasMore,
                        items: flattenCommentTree(replyPage.items, { rootPlatformContentId: post.externalId }) }) });
                  }
                  await store.commitPage({ runId: run.id, leaseEpoch: run.leaseEpoch,
                    sourceId: SOURCE_ID, siteId: site.siteId, boardId: BOARD_ID, scope: 'comments',
                    rootPostId: post.externalId, feedKey: feed.feedKey, cursor: commentCursor,
                    nextCursor: commentPage.nextCursor, hasMore: commentPage.hasMore,
                    items: flattenCommentTree(commentPage.items, { rootPlatformContentId: post.externalId }) });
                } });
            }
            await store.commitPage({ runId: run.id, sourceId: SOURCE_ID, siteId: site.siteId,
              leaseEpoch: run.leaseEpoch,
              boardId: BOARD_ID, scope: 'posts', feedKey: feed.feedKey, rootPostId: '', cursor,
              nextCursor: page.nextCursor, hasMore: page.hasMore, items: page.items });
          } });
      }
      clearInterval(heartbeat);
      await renew();
      await store.finishRun(run.id, run.leaseEpoch);
      result.push({ siteId: site.siteId, runId: run.id, status: 'completed' });
    } catch (error) {
      clearInterval(heartbeat);
      await pendingHeartbeat;
      await store.failRun(run.id, run.leaseEpoch,
        error.cause?.code || error.details?.cause || error.code || 'LAST_NIGHT_ISOLATED_FAILED');
      throw error;
    }
  }
  return { status: 'collected', sourceId: SOURCE_ID, siteRuns: result };
}

async function consumeIsolatedAnalysis({ store, ai, deepPolicy, limit = 20, heartbeatMs = 30000 } = {}) {
  if (!store?.claimAnalysisJobs || !store?.renewAnalysisJobLease ||
    !store?.completeAnalysisJob || !store?.failAnalysisJob ||
    !ai?.analyzeBatch || !ai?.configured || typeof deepPolicy !== 'function' ||
    !Number.isInteger(limit) || limit < 1 || limit > 100 ||
    !Number.isInteger(heartbeatMs) || heartbeatMs < 10 || heartbeatMs > 60000) {
    reject('LAST_NIGHT_ISOLATED_ANALYSIS_DEPS_INVALID');
  }
  if (!ai.configured('light')) reject('LAST_NIGHT_ISOLATED_AI_UNAVAILABLE');
  const jobs = await store.claimAnalysisJobs({ sourceId: SOURCE_ID, limit });
  const active = new Map(jobs.map(job => [job.id, job]));
  let heartbeatFailure = null;
  let pendingHeartbeat = Promise.resolve();
  const heartbeat = setInterval(() => {
    pendingHeartbeat = pendingHeartbeat.then(async () => {
      for (const job of active.values()) await store.renewAnalysisJobLease(job.id, job.leaseEpoch);
    }).catch(error => { heartbeatFailure = error; });
  }, heartbeatMs);
  heartbeat.unref?.();
  try {
    for (const job of jobs) {
      if (String(job.sourceId) !== SOURCE_ID || String(job.boardId) !== BOARD_ID ||
        !['light', 'deep'].includes(job.profile)) reject('LAST_NIGHT_ISOLATED_AI_SCOPE_MISMATCH');
      await pendingHeartbeat;
      if (heartbeatFailure) throw heartbeatFailure;
      if (!ai.configured(job.profile)) reject('LAST_NIGHT_ISOLATED_AI_UNAVAILABLE');
      const [analysis] = await ai.analyzeBatch([job.content], job.profile);
      if (!analysis) reject('LAST_NIGHT_ISOLATED_AI_INCOMPLETE');
      await pendingHeartbeat;
      if (heartbeatFailure) throw heartbeatFailure;
      active.delete(job.id);
      try {
        await store.completeAnalysisJob(job.id, job.leaseEpoch, analysis, {
          queueDeep: job.profile === 'light' && ai.configured('deep') && deepPolicy(analysis, job.content)
        });
      } catch (error) {
        await store.failAnalysisJob(job.id, job.leaseEpoch,
          error.code || 'LAST_NIGHT_ISOLATED_AI_FAILED');
        throw error;
      }
    }
  } catch (error) {
    clearInterval(heartbeat);
    await pendingHeartbeat;
    await Promise.allSettled([...active.values()].map(job => store.failAnalysisJob(job.id,
      job.leaseEpoch, error.code || 'LAST_NIGHT_ISOLATED_AI_FAILED')));
    throw error;
  } finally {
    clearInterval(heartbeat);
    await pendingHeartbeat;
  }
  return { status: 'processed', jobs: jobs.length };
}

module.exports = { assertScope, assertCollectionAdmission, registerIsolatedFixtureConnector,
  collectIsolated, consumeIsolatedAnalysis };
