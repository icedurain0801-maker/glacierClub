'use strict';
const crypto = require('node:crypto');

const SOURCE_ID = '5c21f78d-5f67-4467-963d-dcdeb5e26cab';
const ACCOUNT_ID = '70c393cf-9600-11f1-b3d2-d85ed3ae61b0';
const COMMUNITY_ID = '00000000-0000-0000-0000-000000000101';
const WINDOW_START = '2026-10-08T16:00:00.000Z';
const WINDOW_END = '2026-10-09T16:00:00.000Z';
const SITE_ID = 'site-7586e54f3a0cb84f433d59cf6baa1d4d';
const CAPTURE_END = '2026-10-09T04:31:29.177Z';
const EXPECTED_IDS = ['926895', '926891', '926889', '926888', '926887', '926886', '926885', '926884',
  '926881', '926880', '926879', '926878', '926876', '926875', '926874', '926869'];
const fail = code => { throw Object.assign(new Error(code), { code }); };

function validateScope({ source, account, plan, now = Date.now() }) {
  if (source?.id !== SOURCE_ID || account?.id !== ACCOUNT_ID || account.source_id !== SOURCE_ID
    || account.community_id !== COMMUNITY_ID || source.community_id !== COMMUNITY_ID
    || source.platform !== 'bigplayer_h5' || account.platform !== source.platform
    || source.game_id !== account.game_id || source.region_code !== 'domestic'
    || !source.enabled || !account.enabled || source.auth_status !== 'authorized'
    || account.auth_status !== 'authorized') fail('DOMESTIC_SCOPE_MISMATCH');
  for (const subject of [source, account]) {
    if (subject.auth_expire_at && Date.parse(subject.auth_expire_at) <= now) fail('DOMESTIC_AUTH_EXPIRED');
  }
  const config = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
  const url = new URL(config?.baseUrl);
  const sites = (config?.siteUrls || []).filter(site => site?.enabled !== false);
  const site = sites.find(site => site.siteId === SITE_ID);
  if (!site || new URL(site.url).href !== url.href) fail('DOMESTIC_SITE_REGISTRY_MISMATCH');
  if (url.origin !== 'https://club.q1.com' || url.username || url.password
    || url.searchParams.get('gameId') !== '2131' || url.searchParams.get('gameVersion') !== '2131-CN-ZS'
    || url.searchParams.get('env') !== 'web' || Number(config?.boardId) !== 2) fail('DOMESTIC_SITE_MISMATCH');
  const end = Date.parse(plan?.publishedTo);
  if (plan?.sourceId !== SOURCE_ID || plan.accountId !== ACCOUNT_ID || plan.publishedFrom !== WINDOW_START
    || plan.publishedTo !== CAPTURE_END || !Number.isFinite(end) || end <= Date.parse(WINDOW_START) || end > Date.parse(WINDOW_END)
    || end > now || now >= Date.parse(WINDOW_END)
    || !Number.isInteger(plan.maxPages) || plan.maxPages < 1 || plan.maxPages > 50) fail('DOMESTIC_WINDOW_INVALID');
  return { from: Date.parse(WINDOW_START), to: end };
}

function normalizePost(item, window) {
  const time = Date.parse(item?.publishedAt);
  if (!Number.isFinite(time) || time < window.from || time >= window.to) fail('DOMESTIC_ITEM_OUTSIDE_WINDOW');
  if (String(item.boardId) !== '2' || item.contentType !== 'post'
    || !/^\d+$/.test(String(item.externalId))
    || item.rawPayload?._contentIntegrity?.status !== 'detail_enriched') fail('DOMESTIC_DETAIL_REQUIRED');
  const url = new URL(item.sourceUrl);
  if (url.origin !== 'https://club.q1.com' || url.searchParams.get('postId') !== String(item.externalId)) fail('DOMESTIC_DETAIL_ID_MISMATCH');
  return { ...item, contentDepth: 0, rootPlatformContentId: '', platformParentId: null,
    publishedAt: new Date(time), fingerprint: crypto.createHash('sha256')
      .update(JSON.stringify([item.title, item.body, item.media, item.rawPayload, Boolean(item.isDeleted)])).digest('hex') };
}

// No worker import, scheduler invocation, source enumeration or auth refresh.
// Replay the current page after any crash between store and AI enqueue: the
// checkpoint deliberately retains its REQUEST cursor until enqueue succeeds.
async function recoverDomesticToday({ repo, connector, source, account, plan, now = Date.now(), signal, onPhase = () => {} } = {}) {
  onPhase('validate_scope');
  const window = validateScope({ source, account, plan, now });
  const leaseOwner = `domestic-today:${crypto.randomUUID()}`;
  const lockName = `public-opinion-sync-account-${ACCOUNT_ID}`;
  const identity = { accountId: ACCOUNT_ID, siteId: SITE_ID, taskKind: 'domestic_today_recovery',
    taskKey: 'board2:merged:2026-10-09', syncScope: 'posts', rootPlatformContentId: '',
    windowStart: WINDOW_START, windowEnd: new Date(window.to).toISOString() };
  const report = { status: 'PARTIAL_TODAY', sourceId: SOURCE_ID, accountId: ACCOUNT_ID,
    publishedFrom: WINDOW_START, publishedTo: identity.windowEnd, pages: 0, inserted: 0, changed: 0,
    unchanged: 0, aiQueued: 0, noTextForAi: 0, contentIds: [], aiContentIds: [], storedExternalIds: [],
    expectedFirstPageIds: EXPECTED_IDS, missingExpectedIds: EXPECTED_IDS,
    scope: 'domestic-board2-home-posts', commentsComplete: false };
  onPhase('account_lock');
  if (!await repo.acquireAdvisoryLock(lockName, 0)) fail('DOMESTIC_ACCOUNT_BUSY');
  const originalEnrich = connector.enrichQ1FeedItems;
  // Never enrich pinned yesterday/future posts, and never use list summaries as full detail.
  connector.enrichQ1FeedItems = function(input) {
    const selected = input.items.filter(item => {
      const time = Date.parse(item.createTime);
      if (!Number.isFinite(time)) fail('DOMESTIC_PUBLISHED_TIME_INVALID');
      return time >= window.from && time < window.to;
    });
    return originalEnrich.call(this, { ...input, items: selected });
  };
  let checkpoint;
  try {
    onPhase('checkpoint_read'); const existing = await repo.getSyncCheckpoint(identity);
    if (existing?.status === 'completed') return { ...report, status: 'ALREADY_COMPLETED_CAPTURED_WINDOW' };
    for (let n = 0; n < plan.maxPages; n += 1) {
      if (signal?.aborted) fail('DOMESTIC_CANCELLED');
      onPhase('checkpoint_claim'); checkpoint = await repo.claimSyncCheckpoint({ ...identity, syncMode: 'incremental', leaseOwner, leaseSeconds: 300 });
      if (!checkpoint) fail('DOMESTIC_CHECKPOINT_BUSY');
      const requestCursor = checkpoint.cursor || null;
      const feed = { boardId: '2', pageKind: 'home', endpointKind: 'merged', groupId: null,
        groupType: null, sectionId: '0', type: null, orderType: null, isUltimate: null,
        feedKey: '2:home:merged::0:::' };
      // Intentionally unbounded at the connector layer: its time-order heuristic
      // must not stop this non-time-sorted pinned feed. Selection happens above.
      onPhase('provider_page_detail');
      const page = await connector.listFeedContents({ source, account, feed, cursor: requestCursor,
        limit: 20, dailyBounded: false, signal, segmentId: leaseOwner });
      if (!Array.isArray(page?.items) || typeof page.hasMore !== 'boolean'
        || (page.hasMore && (!page.nextCursor || page.nextCursor === requestCursor))) fail('DOMESTIC_PAGINATION_INVALID');
      const incomplete = page.raw?.paginationDiagnostics?.incomplete || page.raw?.data?.offsetCeilingReached === true;
      const items = page.items.map(item => normalizePost(item, window));
      const ids = items.map(item => item.externalId);
      if (new Set(ids).size !== ids.length) fail('DOMESTIC_DUPLICATE_PAGE_IDS');
      onPhase('store_page');
      const committed = await repo.upsertContentPage({ account, items, syncScope: 'posts',
        checkpointId: checkpoint.id, leaseOwner, leaseSeconds: 300,
        nextCursor: requestCursor, hasMore: true, syncMode: 'incremental', feed });
      const eligibleIds = new Set(items.filter(item => String(item.title || '').trim() || String(item.body || '').trim()).map(item => item.externalId));
      report.noTextForAi += items.filter(item => !eligibleIds.has(item.externalId) && !item.isDeleted).length;
      const contentIds = (committed.contents || []).filter(entry => !entry.content?.is_deleted
        && eligibleIds.has(String(entry.content?.external_id ?? entry.content?.id))).map(entry => entry.content?.id);
      if (contentIds.some(id => !id)) fail('DOMESTIC_STORE_RESULT_INVALID');
      // Include unchanged rows: a prior attempt may have stored but not queued AI.
      if (contentIds.length) {
        onPhase('ai_enqueue'); const queued = await repo.enqueueAnalysisBatch({ contentIds, profile: 'light',
          version: plan.analysisVersion, triggerReason: 'domestic_today_recovery' });
        if (queued.failed) fail('DOMESTIC_AI_ENQUEUE_FAILED');
        report.aiQueued += Number(queued.submitted || 0);
      }
      const status = page.hasMore || incomplete ? 'idle' : 'completed';
      // A stopped provider budget is NOT exhaustion. Never persist a null
      // cursor as completion for that case: replay the safe page on resume.
      onPhase('checkpoint_release'); const released = await repo.releaseSyncCheckpoint(checkpoint.id, { status,
        cursor: incomplete && !page.nextCursor ? requestCursor : page.nextCursor, leaseOwner });
      if (!released || released.status !== status || released.lease_owner) fail('DOMESTIC_CHECKPOINT_RELEASE_FAILED');
      checkpoint = null;
      for (const entry of committed.contents || []) if (Object.hasOwn(report, entry.change)) report[entry.change] += 1;
      report.contentIds.push(...(committed.contents || []).map(entry => entry.content?.id).filter(Boolean));
      report.aiContentIds.push(...contentIds); report.storedExternalIds.push(...ids); report.pages += 1;
      if (incomplete) { report.errorCode = 'DOMESTIC_PROVIDER_INCOMPLETE'; break; }
      if (!page.hasMore) { report.status = 'COMPLETED_CAPTURED_HOME_POSTS_AI_QUEUED'; break; }
    }
    report.contentIds = [...new Set(report.contentIds)];
    report.aiContentIds = [...new Set(report.aiContentIds)];
    report.storedExternalIds = [...new Set(report.storedExternalIds)];
    report.missingExpectedIds = EXPECTED_IDS.filter(id => !report.storedExternalIds.includes(id));
    return report;
  } finally {
    connector.enrichQ1FeedItems = originalEnrich;
    try {
      if (checkpoint) await repo.releaseSyncCheckpoint(checkpoint.id, { status: 'idle', leaseOwner });
    } finally { await repo.releaseAdvisoryLock(lockName); }
  }
}
module.exports = { recoverDomesticToday, validateScope, normalizePost, SOURCE_ID, ACCOUNT_ID, COMMUNITY_ID, WINDOW_START, SITE_ID };
