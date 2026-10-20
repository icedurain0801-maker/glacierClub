'use strict';
const { scopeOf, assertOwner, boardMarkers, object } = require('../../shared/overseasCommentIntegrity');
const { normalizeSiteUrls } = require('../../server/src/services/bigplayerSiteConfig');

// The comment endpoint is addressed by globally unique postId. Roots with no
// historical language membership are probed once with the same authorized
// account; no language or site membership is invented for those roots.
async function loadSharedCommentTargets(repo, source, account) {
  const scope = scopeOf(source, account);
  if (!scope) return [];
  const sites = normalizeSiteUrls(object(source.config)).siteUrls.filter(site => site.enabled !== false);
  const fallbackSite = sites.filter(site => site.enabled !== false && Number(site.enabled) !== 0)
    .map(site => String(site.siteId || site.site_id || '')).filter(Boolean).sort()[0];
  // Single-site runs have no child run and therefore no explicit siteId.
  // Resolve only an unambiguous saved site; multi-site runs must stay explicit.
  const siteId = String(source.siteId || source.site_id || (sites.length === 1 ? sites[0].siteId : ''));
  if (!siteId || !fallbackSite || !sites.some(site => String(site.siteId || site.site_id) === siteId)) {
    throw Object.assign(new Error('OVERSEAS_COMMENT_SITE_SCOPE_INVALID'), { code: 'OVERSEAS_COMMENT_SITE_SCOPE_INVALID' });
  }
  const rows = await repo.query(`SELECT c.id,c.source_id,c.account_id,c.game_id,c.community_id,c.external_id,c.content_depth,c.raw_payload,
    (SELECT MIN(JSON_UNQUOTE(JSON_EXTRACT(m.feed_metadata,'$.siteId')))
     FROM po_content_feed_memberships m WHERE m.content_id=c.id AND m.account_id=c.account_id
       AND JSON_UNQUOTE(JSON_EXTRACT(m.feed_metadata,'$.boardId'))=?
       AND JSON_UNQUOTE(JSON_EXTRACT(m.feed_metadata,'$.siteId')) IN (${sites.map(() => '?').join(',')})) AS known_site
    FROM po_contents c WHERE c.source_id=? AND c.account_id=? AND c.game_id=? AND c.community_id=?
      AND c.content_depth=0 AND c.is_deleted=0
      AND (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(c.raw_payload,'$.boardId')),
        JSON_UNQUOTE(JSON_EXTRACT(c.raw_payload,'$._overseasScope.boardId')),
        JSON_UNQUOTE(JSON_EXTRACT(c.raw_payload,'$._lastNightScope.boardId')))=?
        OR EXISTS(SELECT 1 FROM po_content_feed_memberships proof WHERE proof.content_id=c.id AND proof.account_id=c.account_id AND JSON_UNQUOTE(JSON_EXTRACT(proof.feed_metadata,'$.boardId'))=?))
    ORDER BY c.published_at DESC,c.id`,
  [scope.boardId, ...sites.map(site => String(site.siteId || site.site_id || '')), scope.sourceId, scope.accountId, scope.gameId, scope.communityId, scope.boardId, scope.boardId]);
  const targets = [];
  for (const row of rows) {
    assertOwner(scope, row);
    if (!/^\d+$/.test(String(row.external_id))) throw Object.assign(new Error('OVERSEAS_COMMENT_PARENT_SCOPE_CONFLICT'), { code: 'OVERSEAS_COMMENT_PARENT_SCOPE_CONFLICT' });
    if ((row.known_site || fallbackSite) === siteId) targets.push(String(row.external_id));
  }
  return targets;
}
async function loadPendingReplies(repo, source, account, window) {
  if (!scopeOf(source, account) || !window?.publishedFrom || !window?.publishedTo) return [];
  const rows = await repo.query(`SELECT task_key,root_platform_content_id FROM po_sync_checkpoints
    WHERE account_id=? AND site_id=? AND task_kind='q1_reply' AND sync_scope='comments'
      AND window_start=? AND window_end=? AND status<>'completed'`,
  [account.id, source.siteId || source.site_id, new Date(window.publishedFrom).toISOString(), new Date(window.publishedTo).toISOString()]);
  return rows.map(row => {
    const match = /^reply:(\d+):([012])$/.exec(row.task_key);
    if (!match || !/^\d+$/.test(row.root_platform_content_id)) throw Object.assign(new Error('OVERSEAS_COMMENT_CHECKPOINT_INVALID'), { code: 'OVERSEAS_COMMENT_CHECKPOINT_INVALID' });
    return { postId: row.root_platform_content_id, commentId: match[1], sortType: Number(match[2]) };
  });
}
module.exports = { loadSharedCommentTargets, loadPendingReplies };
