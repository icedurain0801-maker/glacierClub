'use strict';

const { boardIdOf } = require('../../shared/bigPlayerBoard');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID } = require('./lastNightOverseasDailyJob');

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

function assertPage(page, cursor) {
  if (!page || !Array.isArray(page.items) || typeof page.hasMore !== 'boolean' ||
    (page.hasMore && (!page.nextCursor || page.nextCursor === cursor)) ||
    page.capability !== 'authorized_scope' || page.raw?.paginationDiagnostics?.incomplete) {
    reject('LAST_NIGHT_ISOLATED_PAGE_INCOMPLETE');
  }
}

async function pages({ load, commit, maxPages }) {
  let cursor = null;
  for (let index = 0; index < maxPages; index += 1) {
    const page = await load(cursor);
    assertPage(page, cursor);
    await commit(page, cursor);
    if (!page.hasMore) return page.items.length;
    cursor = page.nextCursor;
  }
  reject('LAST_NIGHT_ISOLATED_PAGE_BUDGET');
}

async function collectIsolated({ source, account, sites, connector, credentialContext, store,
  publishedFrom, publishedTo, pageSize = 20, maxPagesPerFeed = 100, maxCommentPages = 100,
  signal } = {}) {
  assertScope({ source, account, sites, publishedFrom, publishedTo });
  if (!connector?.discoverFeeds || !connector?.listFeedContents || !connector?.listComments ||
    !store?.startRun || !store?.commitPage || !store?.finishRun || !store?.failRun ||
    !Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxPagesPerFeed) || maxPagesPerFeed < 1 ||
    !Number.isInteger(maxCommentPages) || maxCommentPages < 1) reject('LAST_NIGHT_ISOLATED_DEPS_INVALID');
  const result = [];
  for (const site of sites) {
    if (signal?.aborted) reject('LAST_NIGHT_ISOLATED_ABORTED');
    const siteSource = scopedSource(source, site);
    const run = await store.startRun({ sourceId: SOURCE_ID, accountId: account.id,
      communityId: COMMUNITY_ID, boardId: BOARD_ID, siteId: site.siteId,
      siteUrl: site.url, publishedFrom, publishedTo });
    try {
      const feeds = await connector.discoverFeeds({ source: siteSource, account, credentialContext, signal });
      if (!Array.isArray(feeds) || !feeds.length || feeds.some(feed => String(feed.boardId) !== BOARD_ID) ||
        new Set(feeds.map(feed => feed.feedKey)).size !== feeds.length) reject('LAST_NIGHT_ISOLATED_FEEDS_INVALID');
      for (const feed of feeds) {
        await pages({ maxPages: maxPagesPerFeed,
          load: cursor => connector.listFeedContents({ source: siteSource, account, credentialContext,
            feed, cursor, limit: pageSize, dailyBounded: true, publishedFrom, publishedTo, signal }),
          commit: async (page, cursor) => {
            await store.commitPage({ runId: run.id, sourceId: SOURCE_ID, siteId: site.siteId,
              boardId: BOARD_ID, scope: 'posts', feedKey: feed.feedKey, cursor,
              nextCursor: page.nextCursor, items: page.items });
            for (const post of page.items) {
              if (!post.externalId || post.contentType !== 'post') reject('LAST_NIGHT_ISOLATED_POST_INVALID');
              await pages({ maxPages: maxCommentPages,
                load: commentCursor => connector.listComments({ source: siteSource, account,
                  credentialContext, postId: post.externalId, cursor: commentCursor, limit: pageSize,
                  dailyBounded: true, publishedFrom, publishedTo, signal }),
                commit: (commentPage, commentCursor) => store.commitPage({ runId: run.id,
                  sourceId: SOURCE_ID, siteId: site.siteId, boardId: BOARD_ID, scope: 'comments',
                  rootPostId: post.externalId, feedKey: feed.feedKey, cursor: commentCursor,
                  nextCursor: commentPage.nextCursor, items: commentPage.items }) });
            }
          } });
      }
      await store.finishRun(run.id);
      result.push({ siteId: site.siteId, runId: run.id, status: 'completed' });
    } catch (error) {
      await store.failRun(run.id, error.code || 'LAST_NIGHT_ISOLATED_FAILED');
      throw error;
    }
  }
  return { status: 'collected', sourceId: SOURCE_ID, siteRuns: result };
}

async function consumeIsolatedAnalysis({ store, ai, deepPolicy, limit = 20 } = {}) {
  if (!store?.claimAnalysisJobs || !store?.completeAnalysisJob || !store?.failAnalysisJob ||
    !ai?.analyzeBatch || !ai?.configured || typeof deepPolicy !== 'function' ||
    !Number.isInteger(limit) || limit < 1) reject('LAST_NIGHT_ISOLATED_ANALYSIS_DEPS_INVALID');
  if (!ai.configured('light')) reject('LAST_NIGHT_ISOLATED_AI_UNAVAILABLE');
  const jobs = await store.claimAnalysisJobs({ sourceId: SOURCE_ID, limit });
  for (const job of jobs) {
    if (String(job.sourceId) !== SOURCE_ID || String(job.boardId) !== BOARD_ID ||
      !['light', 'deep'].includes(job.profile)) reject('LAST_NIGHT_ISOLATED_AI_SCOPE_MISMATCH');
    try {
      if (!ai.configured(job.profile)) reject('LAST_NIGHT_ISOLATED_AI_UNAVAILABLE');
      const [analysis] = await ai.analyzeBatch([job.content], job.profile);
      if (!analysis) reject('LAST_NIGHT_ISOLATED_AI_INCOMPLETE');
      await store.completeAnalysisJob(job.id, analysis, {
        queueDeep: job.profile === 'light' && ai.configured('deep') && deepPolicy(analysis, job.content)
      });
    } catch (error) {
      await store.failAnalysisJob(job.id, error.code || 'LAST_NIGHT_ISOLATED_AI_FAILED');
      throw error;
    }
  }
  return { status: 'processed', jobs: jobs.length };
}

module.exports = { assertScope, collectIsolated, consumeIsolatedAnalysis };
