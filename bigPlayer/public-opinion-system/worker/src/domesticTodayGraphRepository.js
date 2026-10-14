'use strict';
const crypto = require('node:crypto');
const { domesticRepository } = require('./domesticTodayRepository');
const { SOURCE_ID, ACCOUNT_ID, COMMUNITY_ID, SITE_ID, WINDOW_START } = require('./domesticTodayRecovery');
const fail = code => { throw Object.assign(new Error(code), { code }); };
function domesticGraphRepository(repo) {
  const adapter = domesticRepository(repo);
  adapter.assertDomesticParent = async (account, postId, commentId) => {
    const rows = await repo.query('SELECT id,content_type FROM po_contents WHERE source_id=? AND account_id=? AND community_id=? AND external_id=?', [SOURCE_ID, ACCOUNT_ID, COMMUNITY_ID, postId]);
    if (account.id !== ACCOUNT_ID || rows.length !== 1 || rows[0].content_type !== 'post') fail('DOMESTIC_PARENT_POST_MISSING');
    if (commentId) {
      const comments = await repo.query('SELECT id,content_type,root_content_id FROM po_contents WHERE source_id=? AND account_id=? AND community_id=? AND external_id=?', [SOURCE_ID, ACCOUNT_ID, COMMUNITY_ID, commentId]);
      if (comments.length !== 1 || comments[0].content_type !== 'comment' || comments[0].root_content_id !== rows[0].id) fail('DOMESTIC_PARENT_COMMENT_MISSING');
    }
  };
  adapter.storeDomesticComments = async ({ account, postId, items, replyTargets, checkpoint, leaseOwner, requestCursor, plan }) => {
    if (account.id !== ACCOUNT_ID || account.source_id !== SOURCE_ID || account.community_id !== COMMUNITY_ID
      || items.length > 500 || new Set(items.map(item => item.externalId)).size !== items.length) fail('DOMESTIC_COMMENT_STORE_SCOPE');
    const conn = await repo.pool.getConnection();
    let operation = 0;
    const q = async (sql, params = []) => {
      operation += 1;
      try { return (await conn.query({ sql, timeout: 8000 }, params))[0]; }
      catch (error) {
        // Record only a fixed phase and ordinal, never SQL, parameters or body.
        error.recoveryPhase = sql.startsWith('SELECT id FROM po_sync_checkpoints') ? 'checkpoint_fence'
          : sql.startsWith('SELECT id,content_type FROM po_contents') ? 'root_read_lock'
          : sql.startsWith('SELECT id,content_type,root_content_id') ? 'parent_read'
          : sql.startsWith('SELECT * FROM po_contents') ? (sql.includes('FOR UPDATE') ? 'comment_read_lock' : 'comment_readback')
          : sql.startsWith('INSERT INTO po_contents') ? 'comment_upsert'
          : sql.startsWith('INSERT IGNORE INTO po_sync_checkpoints') ? 'reply_target_store'
          : sql.startsWith('UPDATE po_sync_checkpoints') ? 'checkpoint_store'
          : 'transaction_setup';
        error.recoveryOperation = operation;
        throw error;
      }
    };
    let committing = false;
    try {
      await q('SET SESSION innodb_lock_wait_timeout=3'); await q('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); await conn.beginTransaction();
      const cp = await q("SELECT id FROM po_sync_checkpoints WHERE id=? AND account_id=? AND site_id=? AND status='running' AND lease_owner=? AND lease_until>UTC_TIMESTAMP(3) FOR UPDATE", [checkpoint.id, ACCOUNT_ID, SITE_ID, leaseOwner]);
      if (cp.length !== 1) fail('DOMESTIC_CHECKPOINT_LEASE_LOST');
      const roots = await q('SELECT id,content_type FROM po_contents WHERE source_id=? AND account_id=? AND community_id=? AND external_id=? FOR UPDATE', [SOURCE_ID, ACCOUNT_ID, COMMUNITY_ID, postId]);
      if (roots.length !== 1 || roots[0].content_type !== 'post') fail('DOMESTIC_PARENT_POST_MISSING');
      const root = roots[0], contents = [], ancestors = [];
      const pending = [...items];
      // Parents precede children even when provider returns a flat reply page.
      for (let pass = 0; pending.length && pass <= items.length; pass += 1) {
        let progress = false;
        for (let n = 0; n < pending.length;) {
          const item = pending[n];
          if (item.contentType !== 'comment' || String(item.rootPlatformContentId) !== postId || !/^\d+$/.test(item.externalId)) fail('DOMESTIC_COMMENT_IDENTITY_INVALID');
          const parentExternal = item.platformParentId || postId;
          const parents = parentExternal === postId ? [root] : await q('SELECT id,content_type,root_content_id FROM po_contents WHERE source_id=? AND account_id=? AND community_id=? AND external_id=?', [SOURCE_ID, ACCOUNT_ID, COMMUNITY_ID, parentExternal]);
          if (!parents.length) { n += 1; continue; }
          if (parentExternal !== postId && (parents[0].content_type !== 'comment' || parents[0].root_content_id !== root.id)) fail('DOMESTIC_COMMENT_PARENT_CONFLICT');
          const rows = await q('SELECT * FROM po_contents WHERE source_id=? AND external_id=? FOR UPDATE', [SOURCE_ID, item.externalId]);
          const previous = rows[0];
          if (previous && (previous.account_id !== ACCOUNT_ID || previous.community_id !== COMMUNITY_ID || previous.game_id !== account.game_id || previous.content_type !== 'comment' || previous.root_content_id !== root.id)) fail('DOMESTIC_COMMENT_EXISTING_CONFLICT');
          // Old page ancestors are stored only as authenticated context, at the
          // original timestamp, without AI/count inclusion. Never overwrite an
          // existing old context row just to satisfy a child relationship.
          if (!item.inWindow && previous) { ancestors.push(previous.id); pending.splice(n, 1); progress = true; continue; }
          const id = previous?.id || crypto.randomUUID();
          const raw = JSON.stringify({ providerComment: item.rawPayload, boardId: '2', recoveryContextAncestor: !item.inWindow });
          await q('INSERT INTO po_contents (id,game_id,community_id,source_id,account_id,external_id,content_type,platform_author_id,root_content_id,parent_content_id,platform_parent_id,content_depth,is_deleted,author_name,title,body,media,published_at,source_url,engagement,fingerprint,raw_payload,collected_at,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,?,\'comment\',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE body=VALUES(body),media=VALUES(media),raw_payload=VALUES(raw_payload),fingerprint=VALUES(fingerprint),is_deleted=VALUES(is_deleted),last_seen_at=UTC_TIMESTAMP(3)',
            [id, account.game_id, COMMUNITY_ID, SOURCE_ID, ACCOUNT_ID, item.externalId, item.platformAuthorId || null,
              root.id, parents[0].id, parentExternal, parentExternal === postId ? 1 : Math.max(2, item.contentDepth || 2),
              item.isDeleted ? 1 : 0, item.authorName || null, null, item.body || '', JSON.stringify(item.media || []), item.publishedAt,
              item.sourceUrl, JSON.stringify(item.engagement || {}), item.fingerprint, raw]);
          const after = await q('SELECT * FROM po_contents WHERE source_id=? AND external_id=?', [SOURCE_ID, item.externalId]);
          if (after.length !== 1 || after[0].root_content_id !== root.id || after[0].parent_content_id !== parents[0].id) fail('DOMESTIC_COMMENT_READBACK_FAILED');
          if (item.inWindow) contents.push({ change: previous ? 'changed' : 'inserted', content: after[0] }); else ancestors.push(after[0].id);
          pending.splice(n, 1); progress = true;
        }
        if (!progress) fail('DOMESTIC_COMMENT_CONTEXT_MISSING');
      }
      if (pending.length) fail('DOMESTIC_COMMENT_CONTEXT_MISSING');
      for (const target of replyTargets) {
        if (String(target.postId) !== postId || !/^\d+$/.test(String(target.commentId)) || Number(target.sortType || 0) !== 0) fail('DOMESTIC_REPLY_TARGET_INVALID');
        await q("INSERT IGNORE INTO po_sync_checkpoints (id,account_id,site_id,task_kind,task_key,sync_scope,root_platform_content_id,window_start,window_end,sync_mode,status) VALUES (?,?,?,'domestic_today_reply_recovery',?,'comments',?,?,?,'incremental','idle')",
          [crypto.randomUUID(), ACCOUNT_ID, SITE_ID, `${postId}:${target.commentId}:0`, postId, WINDOW_START, plan.publishedTo]);
      }
      const updated = await q("UPDATE po_sync_checkpoints SET `cursor`=?,items_fetched=items_fetched+?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND) WHERE id=? AND lease_owner=? AND status='running' AND lease_until>UTC_TIMESTAMP(3)", [requestCursor, contents.length, checkpoint.id, leaseOwner]);
      if (updated.affectedRows !== 1) fail('DOMESTIC_CHECKPOINT_LEASE_LOST');
      committing = true; await conn.commit(); return { contents, contextAncestorIds: ancestors };
    } catch (error) {
      if (!committing) await conn.rollback().catch(() => {}); else error.code = 'DOMESTIC_COMMENT_COMMIT_UNKNOWN';
      throw error;
    } finally { conn.release(); }
  };
  return adapter;
}
module.exports = { domesticGraphRepository };
