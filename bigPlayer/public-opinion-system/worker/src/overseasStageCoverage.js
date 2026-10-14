'use strict';
const { isOverseasStageCoverageLedger } = require('../../server/src/db/overseasStageCoverage');
const { taskDescriptor, taskIdentity, schemaDescriptors, pageTargets } = require('./overseasStageTaskIdentity');
const hooks = new WeakSet();
const fail = code => { throw Object.assign(new Error(code), { code }); };
function createOverseasStageCoverage({ repo, ledger } = {}) {
  if (!repo?.pool?.getConnection || !isOverseasStageCoverageLedger(ledger)) fail('OVERSEAS_COVERAGE_BRAND_REQUIRED');
  async function transaction(work, readonly = false) {
    const conn = await repo.pool.getConnection(); let started = false, committing = false, destroyed = false;
    try {
      await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      if (!readonly) { await conn.query('SET SESSION innodb_lock_wait_timeout=3'); await conn.query('SET SESSION max_statement_time=10'); }
      if (readonly) await conn.query('START TRANSACTION READ ONLY'); else await conn.beginTransaction(); started = true;
      const result = await work(conn);
      if (readonly) await conn.rollback(); else { committing = true; await conn.commit(); committing = false; }
      started = false; return result;
    } catch (error) {
      if (committing) { destroyed = true; conn.destroy(); fail('OVERSEAS_COVERAGE_COMMIT_UNKNOWN'); }
      if (started) try { await conn.rollback(); } catch { destroyed = true; conn.destroy(); }
      throw error;
    } finally { if (!destroyed) conn.release(); }
  }
  async function prepare(c, feeds) {
    const schema = await transaction(conn => ledger.prepareSchema(conn, c, { schemaDescriptors: schemaDescriptors(c, feeds) }));
    if (schema.status === 'partial') fail('OVERSEAS_COVERAGE_SCHEMA_DRIFT');
    try { await transaction(conn => ledger.prepareHistorySnapshot(conn, c)); }
    catch (error) {
      if (['OVERSEAS_COVERAGE_HISTORY_BUDGET', 'OVERSEAS_COVERAGE_HISTORY_MEMORY_BUDGET', 'OVERSEAS_COVERAGE_HISTORY_GAP', 'OVERSEAS_COVERAGE_HISTORY_CURSOR_STALLED'].includes(error.code))
        await transaction(conn => ledger.markPartial(conn, c, error.code.toLowerCase().replace('overseas_coverage_', '')));
      throw error;
    }
    return transaction(conn => ledger.readProgress(conn, c), true);
  }
  async function stageState(c, input) {
    const descriptor = taskDescriptor(c, input), key = taskIdentity(descriptor);
    const progress = await transaction(conn => ledger.readProgress(conn, c), true);
    if (!['open', 'sealed'].includes(progress.coverageStatus)) fail('OVERSEAS_COVERAGE_PARTIAL');
    // Missing task must never look completed: confirm it exists in the total set.
    if (!progress.taskIdentities.includes(key)) fail('OVERSEAS_COVERAGE_TASK_MISSING');
    return { completed: !progress.pending.some(d => taskIdentity(d) === key) };
  }
  async function beforePageCommit({ conn, contract, input }) {
    const descriptor = taskDescriptor(contract, { taskKind: input.taskKind, taskKey: input.taskKey, syncScope: input.syncScope,
      rootPlatformContentId: input.rootPlatformContentId || '', feed: input.feed || null,
      commentId: input.taskKind === 'q1_reply' ? input.commentId : null, sortType: input.taskKind === 'q1_reply' ? input.sortType : null });
    const targets = pageTargets(contract, input);
    for (const target of targets.filter(d => d.taskKind === 'q1_reply')) {
      const [rows] = await conn.query('SELECT * FROM po_contents WHERE source_id=? AND external_id IN (?,?) FOR UPDATE', [contract.sourceId, target.rootPlatformContentId, target.commentId]);
      const root = rows.find(r => r.external_id === target.rootPlatformContentId), parent = rows.find(r => r.external_id === target.commentId);
      if (!root || !parent || root.content_type !== 'post' || Number(root.content_depth) !== 0 || parent.content_type !== 'comment'
        || Number(parent.content_depth) !== 1 || parent.root_content_id !== root.id || parent.parent_content_id !== root.id || Number(root.is_deleted) || Number(parent.is_deleted)) fail('OVERSEAS_COVERAGE_REPLY_ANCESTRY_INVALID');
      const { assertRow } = require('./overseasBigPlayerPageStore'); await assertRow(root, contract); await assertRow(parent, contract);
    }
    await ledger.commitPage(conn, contract, { taskDescriptor: descriptor, checkpointId: input.checkpointId,
      derivedTasks: targets, complete: input.hasMore === false, origin: input.syncScope === 'posts' ? 'page' : 'reply' });
  }
  async function seal(c) { return transaction(conn => ledger.sealExpansion(conn, c)); }
  function assertContext(context) {
    if (context?.repo !== repo) fail('OVERSEAS_COVERAGE_CONTEXT_CONFLICT');
    ledger.assertContext(context);
  }
  const hook = Object.freeze({ prepare, stageState, beforePageCommit, seal, ledger, transaction, assertContext, productionActivationAllowed: false });
  hooks.add(hook); return hook;
}
module.exports = { createOverseasStageCoverage, isOverseasStageCoverage: value => hooks.has(value) };
