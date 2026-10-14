const { createHash } = require('node:crypto');

function boardIdOf(source) {
  let config = source?.config || {};
  if (typeof config === 'string') {
    try { config = JSON.parse(config); } catch { config = {}; }
  }
  const boardId = String(config.boardId || '').trim();
  return /^[1-9]\d*$/.test(boardId) && Number.isSafeInteger(Number(boardId)) ? boardId : null;
}

function boardRunIdentity({ sourceId, communityId, boardId, scope = 'collection', windowStart, windowEnd, siteId = '' }) {
  if (!sourceId || !communityId || !boardId || !windowStart || !windowEnd) {
    const error = new Error('BigPlayer run requires source, community, board and bounded window');
    error.code = 'BOARD_RUN_SCOPE_INVALID';
    throw error;
  }
  const timestamp = value => {
    const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T') + (String(value).includes('T') ? '' : 'Z'));
    if (Number.isNaN(date.getTime())) throw new TypeError('invalid BigPlayer run window');
    return date.toISOString();
  };
  return createHash('sha256').update(JSON.stringify([sourceId, communityId, boardId, scope, timestamp(windowStart), timestamp(windowEnd), siteId || ''])).digest('hex');
}

module.exports = { boardIdOf, boardRunIdentity };
