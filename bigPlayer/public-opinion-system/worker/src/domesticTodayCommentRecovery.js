'use strict';
const crypto = require('node:crypto');
const { validateScope, ACCOUNT_ID, SITE_ID, WINDOW_START } = require('./domesticTodayRecovery');
const { flattenCommentTree } = require('../../server/src/connectors/baseConnector');
const { completeDetailBlocks } = require('../../server/src/connectors/lastNightDetailBlockContract');
const fail = code => { throw Object.assign(new Error(code), { code }); };
function normalizeComments(page, postId, window) {
  const all = flattenCommentTree(page.items, { rootPlatformContentId: postId });
  return all.map(item => {
    const time = Date.parse(item.publishedAt);
    if (!Number.isFinite(time)) fail('DOMESTIC_COMMENT_TIME_INVALID');
    const url = new URL(item.sourceUrl);
    if (url.origin !== 'https://club.q1.com' || url.searchParams.get('postId') !== postId) fail('DOMESTIC_COMMENT_URL_SCOPE');
    const blocks = item.rawPayload?.content;
    const nontext = Array.isArray(blocks) && blocks.length > 0 && blocks.every(block => [1, 5].includes(block?.type));
    if (nontext) completeDetailBlocks({ id: item.externalId, content: blocks }, item.externalId);
    return { ...item, body: nontext ? '' : item.body, contentType: 'comment', boardId: '2', publishedAt: new Date(time),
      rawPayload: item.rawPayload, fingerprint: crypto.createHash('sha256')
        .update(JSON.stringify([postId, item.externalId, item.body, item.rawPayload, Boolean(item.isDeleted)])).digest('hex'),
      inWindow: time >= window.from && time < window.to };
  });
}
// Explicit parent/root task, no global DB scan. Out-of-window parent comments
// may only be resolved from existing rows, never fabricated or timestamp-shifted.
async function recoverDomesticComments({ repo, connector, source, account, plan, now = Date.now(), signal, onPhase = () => {} } = {}) {
  onPhase('validate_scope');
  const window = validateScope({ source, account, plan, now });
  if (!/^\d+$/.test(plan.postId || '') || (plan.commentId != null && !/^\d+$/.test(plan.commentId))) fail('DOMESTIC_COMMENT_TARGET_REQUIRED');
  const owner = `domestic-comment:${crypto.randomUUID()}`, lock = `public-opinion-sync-account-${ACCOUNT_ID}`;
  onPhase('account_lock'); if (!await repo.acquireAdvisoryLock(lock, 0)) fail('DOMESTIC_ACCOUNT_BUSY');
  let checkpoint;
  try {
    onPhase('parent_preflight'); await repo.assertDomesticParent(account, plan.postId, plan.commentId);
    const identity = { accountId: ACCOUNT_ID, siteId: SITE_ID, taskKind: plan.commentId ? 'domestic_today_reply_recovery' : 'domestic_today_comment_recovery',
      taskKey: `${plan.postId}:${plan.commentId || 'root'}:0`, syncScope: 'comments', rootPlatformContentId: plan.postId,
      windowStart: WINDOW_START, windowEnd: plan.publishedTo };
    const report = { status: 'PARTIAL_COMMENTS', postId: plan.postId, commentId: plan.commentId || null, pages: 0,
      contentIds: [], replyTargets: [], aiQueued: 0, allCommentsComplete: false };
    onPhase('checkpoint_read'); const existing = await repo.getSyncCheckpoint(identity);
    if (existing?.status === 'completed') return { ...report, status: 'ALREADY_COMPLETED_COMMENT_TASK' };
    for (let n = 0; n < plan.maxPages; n += 1) {
      if (signal?.aborted) fail('DOMESTIC_CANCELLED');
      onPhase('checkpoint_claim'); checkpoint = await repo.claimSyncCheckpoint({ ...identity, leaseOwner: owner, leaseSeconds: 300, syncMode: 'incremental' });
      if (!checkpoint) fail('DOMESTIC_CHECKPOINT_BUSY');
      const cursor = checkpoint.cursor || null;
      // Keep full ancestry in the authenticated page, filter only at storage.
      onPhase('provider_comment_page'); const page = await connector.listComments({ source, account, postId: plan.postId, commentId: plan.commentId || null,
        sortType: 0, cursor, limit: 20, dailyBounded: false, signal });
      if (!Array.isArray(page?.items) || typeof page.hasMore !== 'boolean' || (page.hasMore && (!page.nextCursor || page.nextCursor === cursor))) fail('DOMESTIC_PAGINATION_INVALID');
      if (Array.isArray(page.raw?.data) && page.raw.data.length === 0
        && (page.raw.hasMore === true || Number(page.raw.total) > 0)) fail('DOMESTIC_COMMENT_BOUNDARY_INCOMPLETE');
      onPhase('normalize_comment_page'); const items = normalizeComments(page, plan.postId, window);
      const needed = new Set(items.filter(item => item.inWindow).map(item => item.externalId));
      for (const target of page.replyTargets || []) needed.add(String(target.commentId));
      const byId = new Map(items.map(item => [item.externalId, item]));
      for (const id of needed) {
        const parent = byId.get(id)?.platformParentId;
        if (parent && parent !== plan.postId) needed.add(String(parent));
      }
      // Reply targets MUST be durable with the page, including empty today pages.
      onPhase('store_comment_page'); const committed = await repo.storeDomesticComments({ account, postId: plan.postId, items: items.filter(item => needed.has(item.externalId)),
        replyTargets: page.replyTargets || [], checkpoint, leaseOwner: owner, requestCursor: cursor, plan });
      const eligible = committed.contents.filter(entry => !entry.content.is_deleted && String(entry.content.body || '').trim()).map(entry => entry.content.id);
      if (eligible.length) {
        onPhase('ai_enqueue'); const queued = await repo.enqueueAnalysisBatch({ contentIds: eligible, profile: 'light', version: plan.analysisVersion, triggerReason: 'domestic_today_comment_recovery' });
        if (queued.failed) fail('DOMESTIC_AI_ENQUEUE_FAILED'); report.aiQueued += Number(queued.submitted || 0);
      }
      const status = page.hasMore ? 'idle' : 'completed';
      onPhase('checkpoint_release'); const released = await repo.releaseSyncCheckpoint(checkpoint.id, { status, cursor: page.nextCursor, leaseOwner: owner });
      if (!released || released.status !== status || released.lease_owner) fail('DOMESTIC_CHECKPOINT_RELEASE_FAILED');
      checkpoint = null; report.pages += 1;
      report.contentIds.push(...committed.contents.map(entry => entry.content.id)); report.replyTargets.push(...(page.replyTargets || []));
      if (!page.hasMore) { report.status = 'COMPLETED_COMMENT_TASK_AI_QUEUED'; break; }
    }
    return report;
  } finally {
    try { if (checkpoint) await repo.releaseSyncCheckpoint(checkpoint.id, { status: 'idle', leaseOwner: owner }); }
    finally { await repo.releaseAdvisoryLock(lock); }
  }
}
module.exports = { recoverDomesticComments, normalizeComments };
