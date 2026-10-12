'use strict';
const crypto = require('node:crypto');
const { validateScope, normalizePost, ACCOUNT_ID, SITE_ID, WINDOW_START } = require('./domesticTodayRecovery');
const fail = code => { throw Object.assign(new Error(code), { code }); };

// Separate from frozen v8 home recovery. One explicitly selected feed per
// invocation; the manager serializes it with home runs using the same lock.
async function recoverDomesticFeed({ repo, connector, source, account, plan, now = Date.now(), signal } = {}) {
  const window = validateScope({ source, account, plan, now });
  const owner = `domestic-feed:${crypto.randomUUID()}`, lock = `public-opinion-sync-account-${ACCOUNT_ID}`;
  if (!await repo.acquireAdvisoryLock(lock, 0)) fail('DOMESTIC_ACCOUNT_BUSY');
  let checkpoint, originalEnrich;
  try {
    const feeds = await connector.discoverFeeds({ source, account, signal });
    if (!Array.isArray(feeds) || feeds.some(feed => String(feed.boardId) !== '2')) fail('DOMESTIC_FEED_SCOPE_MISMATCH');
    const inventory = feeds.map(feed => ({ ...feed }));
    const feed = inventory.find(feed => feed.feedKey === plan.feedKey);
    if (!feed || feed.endpointKind === 'merged' || !['info', 'activity'].includes(feed.endpointKind)) fail('DOMESTIC_EXPLICIT_NONHOME_FEED_REQUIRED');
    const identity = { accountId: ACCOUNT_ID, siteId: SITE_ID, taskKind: 'domestic_today_feed_recovery',
      taskKey: feed.feedKey, syncScope: 'posts', rootPlatformContentId: '', windowStart: WINDOW_START,
      windowEnd: plan.publishedTo };
    const report = { status: 'PARTIAL_FEED', feedKey: feed.feedKey, pages: 0, contentIds: [], externalIds: [],
      aiQueued: 0, noTextForAi: 0, inventory, inventorySha256: crypto.createHash('sha256').update(JSON.stringify(inventory)).digest('hex'),
      commentsComplete: false, allFeedsComplete: false };
    const existing = await repo.getSyncCheckpoint(identity);
    if (existing?.status === 'completed') return { ...report, status: 'ALREADY_COMPLETED_FEED' };
    originalEnrich = connector.enrichQ1FeedItems;
    connector.enrichQ1FeedItems = function(input) {
      return originalEnrich.call(this, { ...input, items: input.items.filter(item => {
        const time = Date.parse(item.createTime); if (!Number.isFinite(time)) fail('DOMESTIC_PUBLISHED_TIME_INVALID');
        return time >= window.from && time < window.to;
      }) });
    };
    for (let n = 0; n < plan.maxPages; n += 1) {
      if (signal?.aborted) fail('DOMESTIC_CANCELLED');
      checkpoint = await repo.claimSyncCheckpoint({ ...identity, leaseOwner: owner, leaseSeconds: 300, syncMode: 'incremental' });
      if (!checkpoint) fail('DOMESTIC_CHECKPOINT_BUSY');
      const cursor = checkpoint.cursor || null;
      const page = await connector.listFeedContents({ source, account, feed, cursor, limit: 20, dailyBounded: false, segmentId: owner, signal });
      if (!Array.isArray(page?.items) || typeof page.hasMore !== 'boolean' || (page.hasMore && (!page.nextCursor || page.nextCursor === cursor))) fail('DOMESTIC_PAGINATION_INVALID');
      const items = page.items.map(item => normalizePost(item, window));
      const incomplete = page.raw?.paginationDiagnostics?.incomplete || page.raw?.data?.offsetCeilingReached === true;
      const committed = await repo.upsertContentPage({ account, items, syncScope: 'posts', checkpointId: checkpoint.id,
        leaseOwner: owner, nextCursor: cursor, hasMore: true, syncMode: 'incremental', feed });
      const textIds = new Set(items.filter(item => item.title?.trim() || item.body?.trim()).map(item => item.externalId));
      const eligible = committed.contents.filter(entry => !entry.content.is_deleted && textIds.has(String(entry.content.external_id))).map(entry => entry.content.id);
      report.noTextForAi += items.filter(item => !item.isDeleted && !textIds.has(item.externalId)).length;
      if (eligible.length) {
        const queued = await repo.enqueueAnalysisBatch({ contentIds: eligible, profile: 'light', version: plan.analysisVersion, triggerReason: 'domestic_today_feed_recovery' });
        if (queued.failed) fail('DOMESTIC_AI_ENQUEUE_FAILED'); report.aiQueued += Number(queued.submitted || 0);
      }
      const status = page.hasMore || incomplete ? 'idle' : 'completed';
      const released = await repo.releaseSyncCheckpoint(checkpoint.id, { status, cursor: incomplete && !page.nextCursor ? cursor : page.nextCursor, leaseOwner: owner });
      if (!released || released.status !== status || released.lease_owner) fail('DOMESTIC_CHECKPOINT_RELEASE_FAILED');
      checkpoint = null; report.pages += 1;
      report.contentIds.push(...committed.contents.map(entry => entry.content.id)); report.externalIds.push(...items.map(item => item.externalId));
      if (incomplete) { report.errorCode = 'DOMESTIC_PROVIDER_INCOMPLETE'; break; }
      if (!page.hasMore) { report.status = 'COMPLETED_CAPTURED_FEED_AI_QUEUED'; break; }
    }
    return report;
  } finally {
    if (originalEnrich) connector.enrichQ1FeedItems = originalEnrich;
    try { if (checkpoint) await repo.releaseSyncCheckpoint(checkpoint.id, { status: 'idle', leaseOwner: owner }); }
    finally { await repo.releaseAdvisoryLock(lock); }
  }
}
module.exports = { recoverDomesticFeed };
