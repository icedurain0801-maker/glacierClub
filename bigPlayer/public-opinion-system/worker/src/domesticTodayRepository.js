'use strict';
const crypto = require('node:crypto');
const { SOURCE_ID, ACCOUNT_ID, COMMUNITY_ID } = require('./domesticTodayRecovery');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const COLUMNS = ['id', 'game_id', 'community_id', 'source_id', 'account_id', 'external_id', 'content_type',
  'platform_author_id', 'root_content_id', 'parent_content_id', 'platform_parent_id', 'content_depth', 'is_deleted',
  'author_name', 'title', 'body', 'media', 'published_at', 'source_url', 'engagement', 'fingerprint', 'raw_payload'];
const normalize = value => value instanceof Date ? value.toISOString() : value;
const utcDate = value => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) value = value.replace(' ', 'T') + 'Z';
  return value == null ? null : new Date(value).toISOString();
};
function domesticRepository(repo) {
  const adapter = Object.create(repo);
  adapter.upsertContentPage = async input => {
    const { account, items, checkpointId, leaseOwner, nextCursor } = input;
    if (account?.id !== ACCOUNT_ID || account.source_id !== SOURCE_ID || account.community_id !== COMMUNITY_ID
      || !checkpointId || !leaseOwner || items.length > 20) fail('DOMESTIC_STORE_SCOPE_MISMATCH');
    const conn = await repo.pool.getConnection();
    let commitStarted = false;
    const q = async (sql, params = []) => (await conn.query({ sql, timeout: 8000 }, params))[0];
    try {
      await q('SET SESSION innodb_lock_wait_timeout=3');
      await q('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); await conn.beginTransaction();
      const cp = await q("SELECT id FROM po_sync_checkpoints WHERE id=? AND account_id=? AND lease_owner=? AND status='running' AND lease_until>UTC_TIMESTAMP(3) FOR UPDATE", [checkpointId, ACCOUNT_ID, leaseOwner]);
      if (cp.length !== 1) fail('DOMESTIC_CHECKPOINT_LEASE_LOST');
      const contents = [];
      for (const item of [...items].sort((a, b) => a.externalId.localeCompare(b.externalId))) {
        const rows = await q('SELECT * FROM po_contents WHERE source_id=? AND external_id=? LIMIT 1 FOR UPDATE', [SOURCE_ID, item.externalId]);
        const previous = rows[0];
        if (previous && (previous.account_id !== ACCOUNT_ID || previous.community_id !== COMMUNITY_ID || previous.game_id !== account.game_id)) fail('DOMESTIC_EXISTING_OWNER_MISMATCH');
        if (previous?.raw_payload) {
          const raw = typeof previous.raw_payload === 'string' ? JSON.parse(previous.raw_payload) : previous.raw_payload;
          if (raw?.boardId != null && String(raw.boardId) !== '2') fail('DOMESTIC_EXISTING_BOARD_MISMATCH');
        }
        const values = [previous?.id || crypto.randomUUID(), account.game_id, COMMUNITY_ID, SOURCE_ID, ACCOUNT_ID, item.externalId,
          'post', item.platformAuthorId || null, null, null, null, 0, item.isDeleted ? 1 : 0, item.authorName || null,
          item.title || null, item.body || '', JSON.stringify(item.media || []), item.publishedAt, item.sourceUrl,
          JSON.stringify(item.engagement || {}), item.fingerprint, JSON.stringify(item.rawPayload)];
        const mutable = COLUMNS.slice(6);
        const same = previous && mutable.every(key => {
          const index = COLUMNS.indexOf(key), next = values[index];
          if (key === 'published_at') return utcDate(previous[key]) === utcDate(next);
          if (['raw_payload', 'media', 'engagement'].includes(key)) {
            const old = typeof previous[key] === 'string' ? JSON.parse(previous[key]) : previous[key];
            return JSON.stringify(old) === next;
          }
          return normalize(previous[key]) === normalize(next);
        });
        await q(`INSERT INTO po_contents (${COLUMNS.join(',')},collected_at,first_seen_at,last_seen_at) VALUES (${COLUMNS.map(() => '?').join(',')},UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE ${mutable.map(key => `${key}=VALUES(${key})`).join(',')},last_seen_at=UTC_TIMESTAMP(3)`, values);
        const after = await q('SELECT * FROM po_contents WHERE source_id=? AND external_id=? LIMIT 1', [SOURCE_ID, item.externalId]);
        const row = after[0];
        if (!row || row.account_id !== ACCOUNT_ID || row.fingerprint !== item.fingerprint) fail('DOMESTIC_STORE_READBACK_FAILED');
        contents.push({ change: !previous ? 'inserted' : same ? 'unchanged' : 'changed', content: row });
      }
      const updated = await q("UPDATE po_sync_checkpoints SET `cursor`=?,items_fetched=items_fetched+?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND) WHERE id=? AND lease_owner=? AND status='running' AND lease_until>UTC_TIMESTAMP(3)", [nextCursor, items.length, checkpointId, leaseOwner]);
      if (updated.affectedRows !== 1) fail('DOMESTIC_CHECKPOINT_LEASE_LOST');
      commitStarted = true; await conn.commit();
      return { contents, storedCount: contents.filter(entry => entry.change !== 'unchanged').length };
    } catch (error) {
      if (!commitStarted) await conn.rollback().catch(() => {});
      else error.code = 'DOMESTIC_COMMIT_UNKNOWN';
      throw error;
    } finally { conn.release(); }
  };
  return adapter;
}
async function inspectDomesticSchema(repo) {
  const required = { po_contents: [...COLUMNS, 'collected_at', 'first_seen_at', 'last_seen_at'],
    po_sync_checkpoints: ['id', 'account_id', 'site_id', 'task_kind', 'task_key', 'sync_scope', 'root_platform_content_id',
      'window_start', 'window_end', 'sync_mode', 'status', 'cursor', 'lease_owner', 'lease_until', 'items_fetched', 'error_code', 'error_message', 'last_item_at'] };
  for (const [table, columns] of Object.entries(required)) {
    const rows = await repo.query('SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table]);
    const names = new Set(rows.map(row => row.name));
    if (columns.some(column => !names.has(column))) fail('DOMESTIC_SCHEMA_MISMATCH');
  }
}
module.exports = { domesticRepository, inspectDomesticSchema };
