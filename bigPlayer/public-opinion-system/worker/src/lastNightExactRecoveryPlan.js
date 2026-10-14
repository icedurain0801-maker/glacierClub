'use strict';
const crypto = require('node:crypto');
const { PARENT, CHILDREN } = require('./lastNightCatchupHandoff');
const { SOURCE_ID, BOARD_ID } = require('./lastNightScope');
const TASK = '100017:circle:activity:552:564:5::1';
const fail = code => { throw Object.assign(new Error(code), { code }); };
function safeCursor(checkpoint) {
  if (checkpoint.cursor == null || checkpoint.cursor === '') {
    // Existing release can overwrite items_fetched with a per-stage count;
    // zero does not prove no prior committed pages. Never resume failed at 0.
    fail('LAST_NIGHT_RECOVERY_CURSOR_UNSAFE');
  }
  let cursor; try { cursor = JSON.parse(checkpoint.cursor); } catch { fail('LAST_NIGHT_RECOVERY_CURSOR_UNSAFE'); }
  if (![1, 2].includes(cursor.version) || cursor.feedKey !== TASK || !Number.isSafeInteger(cursor.offsetId) || cursor.offsetId < 0 || cursor.offsetId >= 10000
    || !Number.isSafeInteger(cursor.pageIndex) || cursor.pageIndex < 1) fail('LAST_NIGHT_RECOVERY_CURSOR_UNSAFE');
  return checkpoint.cursor;
}
function exactRecoveryPlan({ accountId, checkpoints, feeds }) {
  const site2 = Object.values(CHILDREN).find(row => row[0] === '2')[2];
  const site16 = Object.values(CHILDREN).find(row => row[0] === '16')[2];
  const failed = checkpoints.filter(cp => cp.id === '0205567a-70c3-4ca2-a416-456ef2f09a66' && cp.account_id === accountId && cp.site_id === site2 && cp.task_kind === 'q1_feed' && cp.task_key === TASK
    && cp.window_start === '2026-10-02T03:07:34.810Z' && cp.window_end === '2026-10-09T03:07:34.810Z');
  if (failed.length !== 1) fail('LAST_NIGHT_RECOVERY_CHECKPOINT_AMBIGUOUS');
  const cp = failed[0];
  if (cp.status !== 'failed' || cp.error_code !== 'ER_LOCK_DEADLOCK' || cp.sync_scope !== 'posts' || cp.root_platform_content_id !== ''
    || cp.lease_owner != null || cp.lease_until != null || !cp.window_start || !cp.window_end
    || +new Date(cp.window_start) !== +new Date('2026-10-02T03:07:34.810Z') || +new Date(cp.window_end) !== +new Date('2026-10-09T03:07:34.810Z')) fail('LAST_NIGHT_RECOVERY_CHECKPOINT_CHANGED');
  const cursor = safeCursor(cp);
  const parsed = JSON.parse(cursor);
  if (parsed.endpointKind !== 'activity' || parsed.timeOrderVerified !== true || typeof parsed.previousFingerprint !== 'string'
    || !Number.isFinite(Date.parse(parsed.previousOldestPublishedAt))) fail('LAST_NIGHT_RECOVERY_CURSOR_UNSAFE');
  if (checkpoints.some(row => row.site_id === site16)) fail('LAST_NIGHT_RECOVERY_SITE16_NOT_EMPTY');
  const feed = feeds.filter(row => row.feedKey === TASK && String(row.boardId) === BOARD_ID);
  if (feed.length !== 1 || !feeds.length || feeds.some(row => String(row.boardId) !== BOARD_ID)
    || new Set(feeds.map(row => row.feedKey)).size !== feeds.length) fail('LAST_NIGHT_RECOVERY_FEED_CHANGED');
  const plan = { sourceId: SOURCE_ID, parentId: PARENT, accountId, site2, site16, failedCheckpoint: cp, failedFeed: feed[0], cursor,
    site16Feeds: feeds, publishedFrom: '2026-10-02T03:07:34.810Z', publishedTo: '2026-10-09T03:07:34.810Z',
    skipSite9: true, historyPolicy: 'reuse-existing-content-without-overwrite', scope: 'bounded-post-pages-only-not-comments-or-full-chain',
    site2Admission: 'RESUME_EXACT_COMMITTED_CURSOR_REQUEST_NEXT_PAGE' };
  return { ...plan, recoveryHash: crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex') };
}
module.exports = { safeCursor, exactRecoveryPlan, TASK };
