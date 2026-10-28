'use strict';
const { randomUUID, createHash } = require('node:crypto');
function dateIso(value) { return new Date(String(value).includes('T') ? value : String(value).replace(' ', 'T') + 'Z').toISOString(); }
function checkpointTasks(run, receipt) {
  if (!Array.isArray(receipt.commentTasks)) return [];
  if (!run.site_id || !run.window_start || !run.window_end || receipt.siteId !== run.site_id || String(receipt.boardId) !== '100017') throw new Error('HANDOFF_RECEIPT_SCOPE_INVALID');
  return receipt.commentTasks.map(task => {
    if (!/^\d+$/.test(String(task.postId)) || (task.commentId != null && !/^\d+$/.test(String(task.commentId))) || ![0, 1, 2].includes(Number(task.sortType || 0))) throw new Error('HANDOFF_COMMENT_TASK_INVALID');
    let cursor = task.cursor == null ? null : String(task.cursor);
    if (cursor != null) { const decoded = JSON.parse(cursor); if (decoded.version !== 1 || !/^\d+$/.test(String(decoded.offsetId)) || String(decoded.commentId || '') !== String(task.commentId || '') || Number(decoded.sortType) !== Number(task.sortType || 0)) throw new Error('HANDOFF_CURSOR_INCOMPATIBLE'); }
    return { siteId: run.site_id, root: String(task.postId), kind: task.commentId ? 'q1_reply' : 'comments', key: task.commentId ? `reply:${task.commentId}:${Number(task.sortType || 0)}` : String(task.postId), windowStart: dateIso(run.window_start), windowEnd: dateIso(run.window_end), cursor, status: task.done ? 'completed' : 'idle' };
  });
}
async function migrate(repo, { sourceId, accountId, oldParentId, execute = false }) {
  const conn = await repo.pool.getConnection();
  try {
    await conn.beginTransaction();
    const q = async (sql, args = []) => (await conn.query(sql, args))[0];
    const runs = await q('SELECT id,source_id,account_id,parent_run_id,site_id,status,window_start,window_end,error_message FROM po_sync_runs WHERE parent_run_id=? AND source_id=? AND account_id=? FOR UPDATE', [oldParentId, sourceId, accountId]);
    if (runs.length !== 3 || runs.some(run => !['partial','completed','completed_full','failed'].includes(run.status))) throw new Error('HANDOFF_OLD_RUNS_NOT_TERMINAL');
    const tasks = runs.flatMap(run => checkpointTasks(run, JSON.parse(run.error_message || '{}')));
    const journalKey = createHash('sha256').update(sourceId + ':' + oldParentId + ':shared-v1').digest('hex');
    const prior = await q("SELECT id FROM po_audit_events WHERE source_id=? AND event_type='shared_collector_handoff' AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.journalKey'))=? LIMIT 1", [sourceId, journalKey]);
    if (prior.length) { await conn.rollback(); return { status: 'ALREADY_MIGRATED', journalKey }; }
    let imported = 0;
    for (const task of tasks) {
      const existing = await q('SELECT id,status,`cursor` FROM po_sync_checkpoints WHERE account_id=? AND site_id=? AND task_kind=? AND task_key=? AND sync_scope=\'comments\' AND root_platform_content_id=? AND window_start=? AND window_end=? FOR UPDATE', [accountId, task.siteId, task.kind, task.key, task.root, task.windowStart, task.windowEnd]);
      if (existing.length) throw new Error('HANDOFF_CHECKPOINT_ALREADY_EXISTS');
      if (execute) await q('INSERT INTO po_sync_checkpoints (id,account_id,site_id,task_kind,task_key,sync_scope,root_platform_content_id,window_start,window_end,`cursor`,status,sync_mode) VALUES (?,?,?,?,?,\'comments\',?,?,?,?,?,\'incremental\')', [randomUUID(), accountId, task.siteId, task.kind, task.key, task.root, task.windowStart, task.windowEnd, task.cursor, task.status]);
      imported++;
    }
    const summary = { journalKey, oldParentId, imported, completed: tasks.filter(task => task.status === 'completed').length, pending: tasks.filter(task => task.status !== 'completed').length, preservedOriginalRuns: true, opaqueFeedCursorCopied: false };
    if (execute) {
      const [[lock]] = await conn.query('SELECT IS_USED_LOCK(?) AS owner', ['po-overseas-production:' + sourceId]);
      if (lock.owner != null) throw new Error('DEDICATED_COLLECTOR_STILL_ACTIVE');
      await q("INSERT INTO po_audit_events (id,source_id,account_id,actor_type,event_type,outcome,detail) VALUES (?,?,?,'system','shared_collector_handoff','success',?)", [randomUUID(), sourceId, accountId, JSON.stringify(summary)]);
      await conn.commit();
    } else await conn.rollback();
    return { status: execute ? 'MIGRATED' : 'DRY_RUN', ...summary };
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
}
module.exports = { checkpointTasks, migrate };
