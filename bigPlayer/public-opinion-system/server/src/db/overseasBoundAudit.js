'use strict';
const crypto = require('node:crypto');
const { canonical, contractOf, isTrustedRunContractJournal } = require('../../../worker/src/overseasBigPlayerRunContractJournal');
const { iso, verifyPersistedOverseasContract } = require('../../../worker/src/overseasBigPlayerNetworkContractVerifier');
const { isOverseasStageCoverageLedger } = require('./overseasStageCoverage');
const { assertRow } = require('../../../worker/src/overseasBigPlayerPageStore');
const proofs = new WeakMap(), adapters = new WeakSet();
const VERSION = 'overseas-unique-links-v1';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function uuid(value) { const h = sha(value); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; }
function binding(c) {
  const auditId = uuid(canonical({ format: 'overseas-bound-audit-v1', runId: c.runId, leaseEpoch: c.leaseEpoch }));
  return { format: 'overseas-bound-audit-v1', auditId, bindingEventId: uuid(`binding:${auditId}`), terminalEventId: uuid(`terminal:${auditId}`),
    syncRunId: c.runId, leaseEpoch: c.leaseEpoch, leaseOwner: c.leaseOwner, sourceId: c.sourceId, accountId: c.accountId,
    gameId: c.gameId, communityId: c.communityId, siteId: c.siteId, contractSha256: sha(canonical(c)), manifestSha256: c.manifestSha256 };
}
function parse(raw) { let v; try { v = JSON.parse(raw); } catch { fail('OVERSEAS_AUDIT_EVIDENCE_INVALID'); } if (canonical(v) !== raw) fail('OVERSEAS_AUDIT_EVIDENCE_INVALID'); return v; }
function same(row, c) { return row && row.source_id === c.sourceId && row.account_id === c.accountId && row.site_id === c.siteId
  && Number(row.lease_epoch) === c.leaseEpoch && iso(row.window_start) === c.windowStart && iso(row.window_end) === c.windowEnd; }
function createOverseasBoundAudit({ repo, journal, ledger, scheduledProof } = {}) {
  if (!repo?.pool?.getConnection || !isTrustedRunContractJournal(journal) || !isOverseasStageCoverageLedger(ledger)) fail('OVERSEAS_AUDIT_BRAND_REQUIRED');
  require('./overseasStageCoverage').assertCoverageSafetyContext(ledger,{repo,journal,scheduledProof});
  const scheduled=scheduledProof?require('./overseasScheduledAdmissionStore').scheduledFirstClaimContext(scheduledProof,repo):null;
  if(scheduled)ledger.assertContext({repo,journal,scheduledProof});
  async function transaction(work, readonly = false) {
    const conn = await repo.pool.getConnection(); let started = false, committing = false, destroyed = false;
    try {
      await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      if (readonly) await conn.query('START TRANSACTION READ ONLY'); else await conn.beginTransaction(); started = true;
      const result = await work(conn);
      if (readonly) await conn.rollback(); else { committing = true; await conn.commit(); committing = false; } started = false; return result;
    } catch (error) {
      if (committing) { destroyed = true; conn.destroy(); fail('OVERSEAS_AUDIT_COMMIT_UNKNOWN'); }
      if (started) try { await conn.rollback(); } catch { destroyed = true; conn.destroy(); } throw error;
    } finally { if (!destroyed) conn.release(); }
  }
  async function one(conn, sql, params) { const [rows] = await conn.query(sql, params); if (rows.length > 1) fail('OVERSEAS_AUDIT_ROW_CONFLICT'); return rows[0]; }
  async function check(value) { const c = contractOf(value); await journal.read(c); return c; }
  async function live(conn, c) {
    if(scheduled)await scheduled.fence(conn,c,{lock:true});
    const row = await one(conn, 'SELECT *,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_sync_runs WHERE id=? FOR UPDATE', [c.runId]);
    if (!same(row, c) || row.status !== 'running' || row.lease_owner !== c.leaseOwner || Number(row.live) !== 1) fail('OVERSEAS_AUDIT_LEASE_CONFLICT');
    await verifyPersistedOverseasContract({ query: async (sql, params) => (await conn.query(sql + ' FOR UPDATE', params))[0] }, c); return row;
  }
  async function bound(conn, c, lock = false) {
    const b = binding(c), suffix = lock ? ' FOR UPDATE' : '';
    const event = await one(conn, 'SELECT * FROM po_audit_events WHERE id=?' + suffix, [b.bindingEventId]);
    const row = await one(conn, 'SELECT * FROM po_collection_runs WHERE id=?' + suffix, [b.auditId]);
    if (!event || !row || row.source_id !== c.sourceId || event.source_id !== c.sourceId || event.account_id !== c.accountId || event.game_id !== c.gameId
      || event.actor_type !== 'system' || event.event_type !== 'overseas_bound_audit' || event.outcome !== 'success' || canonical(parse(event.detail)) !== canonical(b)) fail('OVERSEAS_AUDIT_BINDING_UNPROVEN');
    return { b, row };
  }
  async function insertEvent(conn, c, id, type, detail) {
    await conn.query('INSERT INTO po_audit_events (id,game_id,source_id,account_id,actor_type,event_type,outcome,detail) VALUES (?,?,?,?,?,?,?,?)',
      [id, c.gameId, c.sourceId, c.accountId, 'system', type, 'success', canonical(detail)]);
  }
  async function create(value) {
    const c = await check(value), b = binding(c);
    await transaction(async conn => {
      await live(conn, c);
      const existing = await one(conn, 'SELECT * FROM po_collection_runs WHERE id=? FOR UPDATE', [b.auditId]);
      if (existing) { const found = await bound(conn, c, true); if (found.row.status !== 'running' || found.row.finished_at !== null) fail('OVERSEAS_AUDIT_ALREADY_TERMINAL'); return; }
      if (await one(conn, 'SELECT id FROM po_audit_events WHERE id=? FOR UPDATE', [b.bindingEventId])) fail('OVERSEAS_AUDIT_BINDING_UNPROVEN');
      await conn.query('INSERT INTO po_collection_runs (id,source_id,status) VALUES (?,?,?)', [b.auditId, c.sourceId, 'running']);
      await insertEvent(conn, c, b.bindingEventId, 'overseas_bound_audit', b);
      if(scheduled)await scheduled.fence(conn,c,{lock:true});
    });
    const proof = Object.freeze({ auditId: b.auditId }); proofs.set(proof, { c, adapter }); return { id: b.auditId, auditProof: proof };
  }
  async function durable(conn, c, lock = true, completed = false, terminal=false) {
    const [links] = await conn.query('SELECT rc.content_id,rc.change_type,rc.sync_scope,c.* FROM po_sync_run_contents rc JOIN po_contents c ON c.id=rc.content_id WHERE rc.run_id=? ORDER BY rc.content_id' + (lock ? ' FOR UPDATE' : ''), [c.runId]);
    const counts = { discovered: 0, stored: 0, posts: 0, comments: 0, replies: 0 }, seen = new Set();
    for (const link of links) {
      if (!link.content_id || seen.has(link.content_id) || !['posts', 'comments'].includes(link.sync_scope) || !['inserted', 'changed', 'unchanged'].includes(link.change_type)) fail('OVERSEAS_AUDIT_COUNTER_INVALID');
      seen.add(link.content_id); await assertRow(link, c);
      const raw = typeof link.raw_payload === 'string' ? JSON.parse(link.raw_payload) : link.raw_payload;
      if (raw?.recoveryContextAncestor) fail('OVERSEAS_AUDIT_CONTEXT_LINK_CONFLICT');
      const depth = Number(link.content_depth);
      if (!Number.isSafeInteger(depth) || depth < 0) fail('OVERSEAS_AUDIT_ANCESTRY_INVALID');
      if (link.sync_scope === 'posts') {
        if (depth !== 0 || link.content_type !== 'post' || link.root_content_id !== null || link.parent_content_id !== null) fail('OVERSEAS_AUDIT_ANCESTRY_INVALID'); counts.posts++;
      } else {
        if (depth < 1 || link.content_type !== 'comment' || !link.root_content_id || !link.parent_content_id) fail('OVERSEAS_AUDIT_ANCESTRY_INVALID');
        const [parents] = await conn.query('SELECT * FROM po_contents WHERE id IN (?,?)' + (lock ? ' FOR UPDATE' : ''), [link.root_content_id, link.parent_content_id]);
        const root = parents.find(p => p.id === link.root_content_id), parent = parents.find(p => p.id === link.parent_content_id);
        if (!root || !parent || root.content_type !== 'post' || Number(root.content_depth) !== 0 || Number(parent.content_depth) !== depth - 1 || Number(root.is_deleted) || Number(parent.is_deleted)
          || (depth === 1 ? parent.id !== root.id : parent.root_content_id !== root.id)) fail('OVERSEAS_AUDIT_ANCESTRY_INVALID');
        await assertRow(root, c); await assertRow(parent, c); counts[depth === 1 ? 'comments' : 'replies']++;
      }
      counts.discovered++; if (link.change_type !== 'unchanged') counts.stored++;
    }
    if (links.length) await ledger.verifyLinkedTasks(conn, c, links, { lock, completed, terminal });
    return { counts, linksSha256: sha(canonical(links)) };
  }
  async function finish({ proof, status, errorCode = null, errorMessage = null, sourceStatus = status, sourceErrorMessage = errorMessage } = {}) {
    const context = proofs.get(proof); if (context?.adapter !== adapter) fail('OVERSEAS_AUDIT_PROOF_INVALID');
    if (!['completed_full', 'completed_authorized_scope', 'partial', 'failed', 'awaiting_manual_verification'].includes(status)) fail('OVERSEAS_AUDIT_TERMINAL_INVALID');
    if ((sourceStatus === 'success' && !status.startsWith('completed')) || (status.startsWith('completed') && (errorCode || errorMessage))) fail('OVERSEAS_AUDIT_TERMINAL_INVALID');
    const c = await check(context.c);
    return transaction(async conn => {
      await live(conn, c);
      // Coverage acquires manifest/tasks before audit locks, matching page path.
      let progress;
      const [manifests] = await conn.query('SELECT run_id FROM po_overseas_stage_manifests WHERE run_id=? FOR UPDATE', [c.runId]);
      if (!manifests.length && !status.startsWith('completed')) {
        const [[links]] = await conn.query('SELECT COUNT(*) AS n FROM po_sync_run_contents WHERE run_id=?', [c.runId]);
        if (Number(links.n) !== 0) fail('OVERSEAS_AUDIT_COVERAGE_UNPROVEN');
        progress = { taskSetSha256: null, completionSetSha256: null, schemaSha256: null };
      } else progress = await ledger.readProgress(conn, c);
      if (status.startsWith('completed')) {
        const verdict = await ledger.assessTerminal(conn, c);
        if (verdict.status !== 'completed_authorized_scope') { status = 'partial'; sourceStatus = 'partial'; errorCode = 'OVERSEAS_COVERAGE_PARTIAL'; errorMessage = verdict.reason; }
      }
      const evidence = await durable(conn, c, true, status.startsWith('completed')), { b, row } = await bound(conn, c, true);
      if (row.status !== 'running' || row.finished_at !== null) fail('OVERSEAS_AUDIT_ALREADY_TERMINAL');
      // Preserve markSourceRun's existing success/failed semantics. The caller
      // selects that policy; coverage downgrade must never publish success.
      let sourceEffect = null;
      // Scheduled child terminal cannot publish source success/failure;
      // the full parent aggregate owns that effect (not implemented here).
      if (!scheduled && (sourceStatus === 'success' || sourceStatus === 'failed')) {
        const failedMessage = sourceErrorMessage || errorCode || 'unknown';
        await conn.query(`UPDATE po_sources s JOIN po_sync_runs r ON r.source_id=s.id
          SET ${sourceStatus === 'success' ? 's.last_success_at=UTC_TIMESTAMP(3),s.last_error=NULL' : 's.last_error=?'}
          WHERE s.id=? AND s.game_id=? AND s.community_id=? AND s.platform='bigplayer_h5'
            AND r.id=? AND r.account_id=? AND r.site_id=? AND r.status='running'
            AND r.lease_owner=? AND r.lease_epoch=? AND r.lease_until>UTC_TIMESTAMP(3)`,
        [...(sourceStatus === 'failed' ? [failedMessage] : []), c.sourceId, c.gameId, c.communityId, c.runId, c.accountId, c.siteId, c.leaseOwner, c.leaseEpoch]);
        const source = await one(conn, 'SELECT last_success_at,last_error FROM po_sources WHERE id=?', [c.sourceId]);
        if (!source || (sourceStatus === 'failed' ? source.last_error !== failedMessage : source.last_success_at === null || source.last_error !== null)) fail('OVERSEAS_AUDIT_SOURCE_CONFLICT');
        sourceEffect = { status: sourceStatus, lastSuccessAt: source.last_success_at == null ? null : iso(source.last_success_at), lastError: source.last_error };
      }
      const terminal = { format: 'overseas-bound-terminal-v1', ...b, status, errorCode, errorMessage, counterVersion: VERSION,
        ...evidence, sourceEffect, taskSetSha256: progress.taskSetSha256, completionSetSha256: progress.completionSetSha256, schemaSha256: progress.schemaSha256 };
      if(scheduled)await scheduled.fence(conn,c,{lock:true});
      const [updated] = await conn.query('UPDATE po_sync_runs SET status=?,finished_at=UTC_TIMESTAMP(3),discovered_count=?,stored_count=?,error_code=?,error_message=?,next_retry_at=NULL,lease_owner=NULL,lease_until=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND status=\'running\' AND lease_owner=? AND lease_epoch=? AND lease_until>UTC_TIMESTAMP(3)',
        [status, evidence.counts.discovered, evidence.counts.stored, errorCode, errorMessage, c.runId, c.leaseOwner, c.leaseEpoch]);
      if (updated.affectedRows !== 1) fail('OVERSEAS_AUDIT_LEASE_CONFLICT');
      const [audit] = await conn.query('UPDATE po_collection_runs SET status=?,finished_at=UTC_TIMESTAMP(3),discovered_count=?,stored_count=?,analyzed_count=0,alerted_count=0,error_code=?,error_message=? WHERE id=? AND source_id=? AND status=\'running\' AND finished_at IS NULL',
        [status.startsWith('completed') ? 'success' : status, evidence.counts.discovered, evidence.counts.stored, errorCode, errorMessage, b.auditId, c.sourceId]);
      if (audit.affectedRows !== 1) fail('OVERSEAS_AUDIT_BINDING_UNPROVEN');
      await insertEvent(conn, c, b.terminalEventId, 'overseas_bound_terminal', terminal); return terminal;
    });
  }
  async function reconcileInTransaction(conn, { contract, status } = {}) {
    const c = await check(contract);
    const [tx] = await conn.query('SELECT @@in_transaction AS active');
    if (tx.length !== 1 || Number(tx[0].active) !== 1) fail('OVERSEAS_AUDIT_TRANSACTION_REQUIRED');
      const { b, row } = await bound(conn, c), run = await one(conn, 'SELECT * FROM po_sync_runs WHERE id=?', [c.runId]);
      const event = await one(conn, 'SELECT * FROM po_audit_events WHERE id=?', [b.terminalEventId]);
      if (!event && same(run, c) && run.status === 'running' && run.lease_owner === c.leaseOwner && row.status === 'running') return { status: 'not_committed', automaticWriteAllowed: false };
      if (!event || !same(run, c) || run.status !== status || !['completed_full', 'completed_authorized_scope', 'partial', 'failed', 'awaiting_manual_verification'].includes(status)) return { status: 'unknown', automaticWriteAllowed: false };
      if(scheduled)await scheduled.terminalFence(conn,c);
      const saved = parse(event.detail);
      const terminalKeys = [...Object.keys(b), 'status', 'errorCode', 'errorMessage', 'counterVersion', 'counts', 'linksSha256', 'sourceEffect', 'taskSetSha256', 'completionSetSha256', 'schemaSha256'].sort();
      if (Object.keys(saved).sort().join(',') !== terminalKeys.join(',')) fail('OVERSEAS_AUDIT_EVIDENCE_INVALID');
      const evidence = await durable(conn, c, false, status.startsWith('completed'),Boolean(scheduled));
      const progress = saved.schemaSha256 === null && !status.startsWith('completed') && evidence.counts.discovered === 0
        ? { taskSetSha256: null, completionSetSha256: null, schemaSha256: null } : await ledger.readProgress(conn, c,{terminal:Boolean(scheduled)});
      if (event.actor_type !== 'system' || event.event_type !== 'overseas_bound_terminal' || event.outcome !== 'success' || event.source_id !== c.sourceId || event.account_id !== c.accountId || event.game_id !== c.gameId
        || canonical(Object.fromEntries(Object.keys(b).map(k => [k, saved[k]]))) !== canonical(b)) fail('OVERSEAS_AUDIT_BINDING_UNPROVEN');
      const accepted = saved.counterVersion === VERSION && saved.status === status && saved.contractSha256 === b.contractSha256
        && saved.linksSha256 === evidence.linksSha256 && canonical(saved.counts) === canonical(evidence.counts)
        && saved.taskSetSha256 === progress.taskSetSha256 && saved.completionSetSha256 === progress.completionSetSha256 && saved.schemaSha256 === progress.schemaSha256
        && run.lease_owner === null && run.lease_until === null && run.next_retry_at === null && run.finished_at !== null
        && Number(run.discovered_count) === evidence.counts.discovered && Number(run.stored_count) === evidence.counts.stored
        && row.status === (status.startsWith('completed') ? 'success' : status) && row.finished_at !== null
        && Number(row.discovered_count) === evidence.counts.discovered && Number(row.stored_count) === evidence.counts.stored
        && row.analyzed_count != null && Number(row.analyzed_count) === 0 && row.alerted_count != null && Number(row.alerted_count) === 0;
      const complete = !status.startsWith('completed') || (progress.coverageStatus === 'sealed' && progress.historySealed && progress.expansionSealed && progress.pending.length === 0);
      const errorsMatch = run.error_code === saved.errorCode && run.error_message === saved.errorMessage && row.error_code === saved.errorCode && row.error_message === saved.errorMessage;
      let sourceMatches = !scheduled || saved.sourceEffect === null;
      if (!scheduled && saved.sourceEffect != null) {
        const source = await one(conn, 'SELECT last_success_at,last_error FROM po_sources WHERE id=?', [c.sourceId]);
        sourceMatches = source && ['success', 'failed'].includes(saved.sourceEffect.status)
          && saved.sourceEffect.lastSuccessAt === (source.last_success_at == null ? null : iso(source.last_success_at)) && saved.sourceEffect.lastError === source.last_error;
      }
      return { status: accepted && complete && errorsMatch && sourceMatches ? 'accepted' : 'unknown', automaticWriteAllowed: false };
  }
  async function reconcile(input = {}) { return transaction(conn => reconcileInTransaction(conn, input), true); }
  async function reportUnboundRunning(sourceId) {
    return transaction(async conn => {
      const [rows] = await conn.query("SELECT id FROM po_collection_runs WHERE source_id=? AND status='running' ORDER BY id", [sourceId]);
      const reports = [];
      for (const row of rows) {
        const [events] = await conn.query("SELECT id FROM po_audit_events WHERE source_id=? AND event_type='overseas_bound_audit' AND JSON_UNQUOTE(JSON_EXTRACT(detail,'$.auditId'))=?", [sourceId, row.id]);
        reports.push({ auditId: row.id, disposition: events.length ? 'binding_requires_exact_contract_review' : 'unbound_running_manual_review', automaticWriteAllowed: false });
      } return reports;
    }, true);
  }
  function assertContext(context) {
    if (context?.repo !== repo || context?.journal !== journal || context?.ledger !== ledger) fail('OVERSEAS_AUDIT_CONTEXT_CONFLICT');
  }
  const adapter = Object.freeze({ create, finish, reconcile, reconcileInTransaction, reportUnboundRunning, assertContext, productionActivationAllowed: false }); adapters.add(adapter); return adapter;
}
module.exports = { createOverseasBoundAudit, COUNTER_VERSION: VERSION, isOverseasBoundAudit: value => adapters.has(value) };
