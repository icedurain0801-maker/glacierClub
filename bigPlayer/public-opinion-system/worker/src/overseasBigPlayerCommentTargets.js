'use strict';
const { boardIdOf } = require('../../shared/bigPlayerBoard');
const { normalizeSiteUrls } = require('../../server/src/services/bigplayerSiteConfig');
const fail = code => { throw Object.assign(new Error(code), { code }); };
function createOverseasCommentScope(source, account) {
  if (source?.platform !== 'bigplayer_h5' || source.region_code !== 'overseas' || !source.id || !source.game_id || !source.community_id
    || !account?.id || account.source_id !== source.id || account.game_id !== source.game_id
    || account.community_id !== source.community_id || account.platform !== source.platform || !boardIdOf(source)) fail('OVERSEAS_COMMENT_SCOPE_INVALID');
  const siteId = source.siteId || source.site_id;
  if (!siteId || !(source.siteUrl || source.site_url_snapshot)) fail('OVERSEAS_COMMENT_SITE_SCOPE_INVALID');
  let config = source.config; if (typeof config === 'string') { try { config = JSON.parse(config); } catch { fail('OVERSEAS_COMMENT_SITE_SCOPE_INVALID'); } }
  const sites = normalizeSiteUrls(config).siteUrls;
  const snapshot = new URL(source.siteUrl || source.site_url_snapshot).toString();
  if (!sites.some(site => site.enabled && site.siteId === siteId && site.url === snapshot) || new URL(snapshot).origin !== 'https://club-en.q1.com') fail('OVERSEAS_COMMENT_SITE_SCOPE_INVALID');
  return Object.freeze({ sourceId: source.id, accountId: account.id, gameId: source.game_id, communityId: source.community_id,
    siteId, boardId: boardIdOf(source) });
}
function assertRow(scope, row) {
  if (!row || row.source_id !== scope.sourceId || row.account_id !== scope.accountId || row.game_id !== scope.gameId
    || row.community_id !== scope.communityId) fail('OVERSEAS_COMMENT_PARENT_SCOPE_MISMATCH');
}
function currentPageCommentTargets(scope, entries) {
  const targets = new Set();
  for (const { content, raw } of entries || []) {
    if (!content || Number(content.is_deleted) || Number(content.content_depth || 0) !== 0) continue;
    assertRow(scope, content);
    if (String(raw?.boardId || '') !== scope.boardId) fail('OVERSEAS_COMMENT_PARENT_SCOPE_MISMATCH');
    const id = String(raw?.externalId || content.external_id || '');
    if (!/^\d+$/.test(id)) fail('OVERSEAS_COMMENT_PARENT_SCOPE_MISMATCH');
    targets.add(id);
  }
  return [...targets];
}
async function walkHistoricalCommentTargets({ scope, loadPage, onTarget, check, pageSize = 200, maxPages = 10000 }) {
  let afterId = ''; const cursors = new Set();
  for (let n = 0; n < maxPages; n++) {
    check(); const page = await loadPage({ ...scope, afterId, limit: pageSize }); check();
    if (!page || !Array.isArray(page.rows) || page.rows.length > pageSize || typeof page.hasMore !== 'boolean') fail('OVERSEAS_COMMENT_TARGET_PAGE_INVALID');
    if (!Number.isSafeInteger(page.coverageGaps ?? 0) || (page.coverageGaps ?? 0) < 0) fail('OVERSEAS_COMMENT_TARGET_PAGE_INVALID');
    if (page.hasMore && (!page.nextCursor || page.nextCursor === afterId || cursors.has(page.nextCursor))) fail('OVERSEAS_COMMENT_TARGET_CURSOR_STALLED');
    for (const row of page.rows) {
      assertRow(scope, row);
      if (String(row.board_id) !== scope.boardId || row.site_id !== scope.siteId || Number(row.content_depth) !== 0
        || Number(row.is_deleted) !== 0 || !/^\d+$/.test(String(row.external_id))) fail('OVERSEAS_COMMENT_PARENT_SCOPE_MISMATCH');
    }
    for (const row of page.rows) { check(); await onTarget(String(row.external_id)); }
    if (page.coverageGaps) fail('OVERSEAS_COMMENT_COVERAGE_INCOMPLETE');
    if (!page.hasMore) return;
    afterId = page.nextCursor; cursors.add(afterId);
  }
  fail('OVERSEAS_COMMENT_TARGET_LIMIT_REACHED');
}
module.exports = { createOverseasCommentScope, currentPageCommentTargets, walkHistoricalCommentTargets };
