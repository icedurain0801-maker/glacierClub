'use strict';

const object = value => { if (value && typeof value === 'object') return value; try { return JSON.parse(value) || {}; } catch { return {}; } };
const fail = code => { throw Object.assign(new Error(code), { code }); };
function boardMarkers(row) {
  const raw = object(row?.raw_payload ?? row?.rawPayload);
  return [row?.board_id, raw.boardId, raw._overseasScope?.boardId, raw._lastNightScope?.boardId]
    .filter(value => value != null && value !== '').map(String);
}
function scopeOf(source, account) {
  if (source?.platform !== 'bigplayer_h5' || source.region_code !== 'overseas') return null;
  const boardId = String(object(source.config).boardId || '');
  if (!/^[1-9]\d*$/.test(boardId) || !source.id || !source.game_id || !source.community_id
    || account?.source_id !== source.id || account.game_id !== source.game_id || account.community_id !== source.community_id
    || !account.id) fail('OVERSEAS_COMMENT_SCOPE_INVALID');
  return { boardId, sourceId: source.id, accountId: account.id, gameId: account.game_id, communityId: account.community_id };
}
function assertOwner(scope, row) {
  if (!row || row.source_id !== scope.sourceId || row.account_id !== scope.accountId
    || row.game_id !== scope.gameId || row.community_id !== scope.communityId
    || boardMarkers(row).some(board => board !== scope.boardId)) fail('OVERSEAS_COMMENT_PARENT_SCOPE_CONFLICT');
}
// Missing historical markers are repairable only through a verified root and
// the stored graph. This never changes body, fingerprint, or analysis records.
async function validateCommentAncestry(conn, scope, root, parent, raw, existing) {
  if (!scope) return;
  if (existing) assertOwner(scope, existing);
  if (boardMarkers({ rawPayload: raw.rawPayload }).some(board => board !== scope.boardId)
    || (raw.boardId != null && String(raw.boardId) !== scope.boardId)) fail('OVERSEAS_COMMENT_PARENT_SCOPE_CONFLICT');
  if (!root || !parent) fail('OVERSEAS_COMMENT_PARENT_MISSING');
  assertOwner(scope, root); assertOwner(scope, parent);
  if (Number(root.content_depth) !== 0 || root.root_content_id
    || (parent.id !== root.id && (parent.root_content_id !== root.id || Number(parent.content_depth) < 1))) fail('OVERSEAS_COMMENT_PARENT_SCOPE_CONFLICT');
  if (!boardMarkers(root).length) {
    const [memberships] = await conn.query("SELECT id FROM po_content_feed_memberships WHERE content_id=? AND account_id=? AND JSON_UNQUOTE(JSON_EXTRACT(feed_metadata,'$.boardId'))=? LIMIT 1", [root.id, scope.accountId, scope.boardId]);
    if (!memberships.length) fail('OVERSEAS_COMMENT_ROOT_MEMBERSHIP_REQUIRED');
  }
  for (const row of [...new Map([root, parent].map(row => [row.id, row])).values()]) {
    if (boardMarkers(row).length) continue;
    const payload = { ...object(row.raw_payload), _overseasScope: { boardId: scope.boardId } };
    // Compare-and-set prevents a concurrent scope edit being overwritten.
    const [result] = await conn.query('UPDATE po_contents SET raw_payload=? WHERE id=? AND source_id=? AND account_id=? AND game_id=? AND community_id=? AND raw_payload<=>?',
      [JSON.stringify(payload), row.id, scope.sourceId, scope.accountId, scope.gameId, scope.communityId, row.raw_payload]);
    if (result.affectedRows !== 1) fail('OVERSEAS_COMMENT_SCOPE_REPAIR_RACE');
    row.raw_payload = JSON.stringify(payload);
  }
  raw.rawPayload = { ...object(raw.rawPayload), _overseasScope: { ...object(raw.rawPayload)?._overseasScope, boardId: scope.boardId } };
}
module.exports = { object, boardMarkers, scopeOf, assertOwner, validateCommentAncestry };
