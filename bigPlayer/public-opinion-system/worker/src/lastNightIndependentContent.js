'use strict';
const { normalizeRawContent } = require('../../server/src/connectors/baseConnector');
const { BOARD_ID } = require('./lastNightScope');
const fail = code => { throw Object.assign(new Error(code), { code }); };
function normalizeIndependentPost(item, feed) {
  if (!item || !['post','activity','info'].includes(item.contentType) || String(feed?.boardId) !== BOARD_ID
    || !item.externalId || item.rawPayload?._contentIntegrity?.status !== 'detail_enriched') fail('LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED');
  const raw = item.rawPayload;
  if ([raw.boardId,raw.board_id,item.boardId].some(value=>value!=null && String(value)!==BOARD_ID)) fail('LAST_NIGHT_INCOMING_BOARD_EVIDENCE_REQUIRED');
  const normalized = normalizeRawContent({ ...item, contentType: 'post' });
  return { ...normalized, platformAuthorId: item.platformAuthorId ?? null, contentDepth: 0, isDeleted: false,
    boardId: BOARD_ID, boardName: item.boardName ?? null,
    rawPayload: { ...raw, _contentIntegrity: { ...raw._contentIntegrity },
      _lastNightIncomingEvidence: { requestBoardId: BOARD_ID, feedKey: feed.feedKey, providerBoardId: raw.boardId == null ? null : String(raw.boardId) } } };
}
function assertHistoricalReplacement(before, approved) {
  // Unknown legacy raw is not retroactively assigned incoming board/integrity.
  if (!before || !approved || before.id !== approved.id || before.external_id !== approved.externalId
    || before.fingerprint !== approved.fingerprint || approved.allowUnknownReplacement !== true) fail('LAST_NIGHT_UNKNOWN_HISTORY_REPLACEMENT_DENIED');
  fail('LAST_NIGHT_UNKNOWN_HISTORY_REPLACEMENT_REQUIRES_PROTECTED_JOURNAL');
}
module.exports = { normalizeIndependentPost, assertHistoricalReplacement };
