'use strict';
const crypto = require('node:crypto');
const { canonical, contractOf, isTrustedRunContractJournal } = require('../../../worker/src/overseasBigPlayerRunContractJournal');
const { isTrustedManualReceipt } = require('../../../worker/src/overseasManualReceipt');
const { verifyPersistedOverseasContract, iso } = require('../../../worker/src/overseasBigPlayerNetworkContractVerifier');
const identity = require('../../../worker/src/overseasStageTaskIdentity');
const ledgers = new WeakSet(),scheduledLedgers=new WeakMap();
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const scopeOf = c => Object.fromEntries(Object.entries(c).filter(([k]) => !['leaseOwner', 'leaseEpoch'].includes(k)));
function parsed(raw) {
  let value; try { value = JSON.parse(raw); } catch { fail('OVERSEAS_COVERAGE_JSON_INVALID'); }
  if (canonical(value) !== raw) fail('OVERSEAS_COVERAGE_JSON_INVALID'); return value;
}
function descriptorOf(c, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('OVERSEAS_COVERAGE_TASK_INVALID');
  const d = identity.taskDescriptor(c, value);
  if (canonical(d) !== canonical(value)) fail('OVERSEAS_COVERAGE_TASK_INVALID'); return d;
}
const setDigest = rows => sha(canonical(rows.map(r => r.task_identity_sha256).sort()));
const completionDigest = rows => sha(canonical(rows.map(r => ({ taskIdentity: r.task_identity_sha256, checkpointId: r.checkpoint_id,
  checkpointSha256: r.completed_checkpoint_sha256, completedEpoch: r.completed_epoch == null ? null : Number(r.completed_epoch) })).sort((a, b) => a.taskIdentity.localeCompare(b.taskIdentity))));
function checkpointSnapshot(cp, d) {
  if (!cp || cp.account_id !== d.accountId || cp.site_id !== d.siteId || cp.task_kind !== d.taskKind || cp.task_key !== d.taskKey
    || cp.sync_scope !== d.syncScope || String(cp.root_platform_content_id || '') !== d.rootPlatformContentId
    || iso(cp.window_start) !== d.windowStart || iso(cp.window_end) !== d.windowEnd
    || !Number.isSafeInteger(Number(cp.items_fetched)) || Number(cp.items_fetched) < 0
    || (cp.cursor !== null && typeof cp.cursor !== 'string')) fail('OVERSEAS_COVERAGE_CHECKPOINT_CONFLICT');
  return { id: cp.id, accountId: cp.account_id, siteId: cp.site_id, taskKind: cp.task_kind, taskKey: cp.task_key,
    syncScope: cp.sync_scope, rootPlatformContentId: String(cp.root_platform_content_id || ''), windowStart: iso(cp.window_start), windowEnd: iso(cp.window_end),
    status: cp.status, cursor: cp.cursor, itemsFetched: Number(cp.items_fetched), lastItemAt: cp.last_item_at == null ? null : iso(cp.last_item_at) };
}
// All mutations use the caller's already-open transaction; no implicit commit.
function createOverseasStageCoverageLedger({ journal, receipt, request } = {}) {
  if (!isTrustedRunContractJournal(journal) || !isTrustedManualReceipt(receipt) || !request) fail('OVERSEAS_COVERAGE_BRAND_REQUIRED');
  return createCoverageLedgerCore({journal,receipt,request,scheduled:null});
}
function createOverseasScheduledStageCoverageLedger({repo,journal,proof}={}){
  if(!isTrustedRunContractJournal(journal))fail('OVERSEAS_COVERAGE_BRAND_REQUIRED');
  const context=require('./overseasScheduledAdmissionStore').scheduledFirstClaimContext(proof,repo);
  return createCoverageLedgerCore({journal,scheduled:Object.freeze({repo,journal,proof,context})});
}
function createCoverageLedgerCore({journal,receipt,request,scheduled}){
  const frozenRequest = scheduled?null:JSON.parse(canonical(request));
  const receiptId=scheduled?scheduled.context.request.batchSha256:frozenRequest.requestId;
  async function evidence(value) {
    const c = contractOf(value);
    if(scheduled){require('./overseasScheduledAdmissionStore').scheduledFirstClaimContext(scheduled.proof,scheduled.repo);
      if(canonical(c)!==canonical(scheduled.proof.contract))fail('OVERSEAS_COVERAGE_RECEIPT_MISMATCH');await journal.read(c);return c;}
    await receipt.read(frozenRequest); await journal.read(c);
    const matches = frozenRequest.bindings.filter(b => b.runId === c.runId);
    if (matches.length !== 1 || canonical(matches[0]) !== canonical(scopeOf(c))) fail('OVERSEAS_COVERAGE_RECEIPT_MISMATCH'); return c;
  }
  async function fence(conn, value) {
    const c = await evidence(value);if(scheduled)return scheduled.context.fence(conn,c,{lock:true});
    const [[tx]] = await conn.query('SELECT @@in_transaction AS active');
    if (Number(tx?.active) !== 1) fail('OVERSEAS_COVERAGE_TRANSACTION_REQUIRED');
    const [rows] = await conn.query('SELECT *,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_sync_runs WHERE id=? FOR UPDATE', [c.runId]);
    const r = rows[0];
    if (rows.length !== 1 || r.status !== 'running' || r.lease_owner !== c.leaseOwner || Number(r.lease_epoch) !== c.leaseEpoch || Number(r.live) !== 1
      || r.source_id !== c.sourceId || r.account_id !== c.accountId || r.site_id !== c.siteId || iso(r.window_start) !== c.windowStart || iso(r.window_end) !== c.windowEnd
      || r.parent_run_id !== null || r.trigger_type !== 'manual') fail('OVERSEAS_COVERAGE_LEASE_LOST');
    await verifyPersistedOverseasContract({ query: async (sql, params) => (await conn.query(sql + ' FOR UPDATE', params))[0] }, c); return c;
  }
  async function manifest(conn, c, lock = true) {
    const [rows] = await conn.query('SELECT * FROM po_overseas_stage_manifests WHERE run_id=?' + (lock ? ' FOR UPDATE' : ''), [c.runId]), m = rows[0];
    if (rows.length !== 1 || m.receipt_id !== receiptId || m.scope_sha256 !== sha(canonical(scopeOf(c))) || m.manifest_sha256 !== c.manifestSha256
      || sha(m.schema_snapshot) !== m.schema_sha256 || !Number.isSafeInteger(Number(m.created_epoch)) || Number(m.created_epoch) < 1
      || Number(m.created_epoch) > c.leaseEpoch || !Number.isSafeInteger(Number(m.updated_epoch)) || Number(m.updated_epoch) < Number(m.created_epoch) || Number(m.updated_epoch) > c.leaseEpoch
      || !['open', 'sealed', 'partial'].includes(m.coverage_status) || ![0, 1].includes(Number(m.history_sealed)) || ![0, 1].includes(Number(m.expansion_sealed))) fail('OVERSEAS_COVERAGE_MANIFEST_CONFLICT');
    parsed(m.schema_snapshot); return m;
  }
  async function tasks(conn, c, lock = true) {
    const [rows] = await conn.query('SELECT * FROM po_overseas_expected_tasks WHERE run_id=? ORDER BY task_identity_sha256' + (lock ? ' FOR UPDATE' : ''), [c.runId]);
    for (const r of rows) {
      const d = descriptorOf(c, parsed(r.descriptor));
      if (r.descriptor_sha256 !== sha(r.descriptor) || r.task_identity_sha256 !== identity.taskIdentity(d)
        || !['expected', 'completed', 'failed', 'unsupported'].includes(r.state) || !['schema', 'history', 'page', 'reply'].includes(r.origin)
        || !Number.isSafeInteger(Number(r.created_epoch)) || Number(r.created_epoch) < 1 || Number(r.created_epoch) > c.leaseEpoch) fail('OVERSEAS_COVERAGE_TASK_CONFLICT');
      parsed(r.origin_evidence);
    } return rows;
  }
  async function checkedSet(conn, c, m, lock = true) {
    const rows = await tasks(conn, c, lock);
    if (Number(m.expected_count) !== rows.length || m.expected_set_sha256 !== setDigest(rows)) fail('OVERSEAS_COVERAGE_TASK_SET_CONFLICT');
    const keys = new Set(rows.map(r => r.task_identity_sha256));
    for (const d of parsed(m.schema_snapshot)) if (!keys.has(identity.taskIdentity(descriptorOf(c, d)))) fail('OVERSEAS_COVERAGE_SCHEMA_TASK_MISSING'); return rows;
  }
  async function insert(conn, c, d, origin, originEvidence) {
    const raw = canonical(descriptorOf(c, d)), key = identity.taskIdentity(d);
    const [found] = await conn.query('SELECT * FROM po_overseas_expected_tasks WHERE run_id=? AND task_identity_sha256=? FOR UPDATE', [c.runId, key]);
    if (found.length) {
      if (found.length !== 1 || found[0].descriptor !== raw || found[0].descriptor_sha256 !== sha(raw)) fail('OVERSEAS_COVERAGE_DESCRIPTOR_DRIFT'); return;
    }
    if (!['schema', 'history', 'page', 'reply'].includes(origin)) fail('OVERSEAS_COVERAGE_ORIGIN_INVALID');
    await conn.query('INSERT INTO po_overseas_expected_tasks (run_id,task_identity_sha256,descriptor,descriptor_sha256,origin,origin_evidence,created_epoch) VALUES (?,?,?,?,?,?,?)',
      [c.runId, key, raw, sha(raw), origin, canonical(originEvidence), c.leaseEpoch]);
  }
  async function refresh(conn, c) {
    const rows = await tasks(conn, c);
    await conn.query('UPDATE po_overseas_stage_manifests SET expected_count=?,expected_set_sha256=?,updated_epoch=?,updated_at=UTC_TIMESTAMP(3) WHERE run_id=?', [rows.length, setDigest(rows), c.leaseEpoch, c.runId]);
  }
  async function prepareSchema(conn, value, { schemaDescriptors } = {}) {
    const c = await fence(conn, value);
    if (!Array.isArray(schemaDescriptors) || !schemaDescriptors.length || schemaDescriptors.length > 1000) fail('OVERSEAS_COVERAGE_SCHEMA_INVALID');
    const ds = schemaDescriptors.map(d => descriptorOf(c, d)).sort((a, b) => identity.taskIdentity(a).localeCompare(identity.taskIdentity(b)));
    if (ds.some(d => d.taskKind !== 'q1_feed') || new Set(ds.map(identity.taskIdentity)).size !== ds.length) fail('OVERSEAS_COVERAGE_SCHEMA_INVALID');
    const raw = canonical(ds), [existing] = await conn.query('SELECT run_id FROM po_overseas_stage_manifests WHERE run_id=? FOR UPDATE', [c.runId]);
    if (existing.length) {
      const m = await manifest(conn, c),existingTasks=await checkedSet(conn, c, m);
      if(scheduled&&m.coverage_status==='open'&&Number(m.created_epoch)===1&&Number(m.updated_epoch)===1&&m.schema_snapshot==='[]'&&existingTasks.length===0
        &&Number(m.history_sealed)===0&&Number(m.expansion_sealed)===0&&m.history_snapshot_at===null&&m.coverage_reason===null){
        const [changed]=await conn.query("UPDATE po_overseas_stage_manifests SET schema_snapshot=?,schema_sha256=?,updated_at=UTC_TIMESTAMP(3) WHERE run_id=? AND coverage_status='open' AND created_epoch=1 AND updated_epoch=1 AND schema_snapshot='[]' AND schema_sha256=? AND expected_count=0 AND expected_set_sha256=? AND history_sealed=0 AND expansion_sealed=0 AND history_snapshot_at IS NULL AND coverage_reason IS NULL",[raw,sha(raw),c.runId,sha('[]'),sha('[]')]);
        if(Number(changed.affectedRows)!==1)fail('OVERSEAS_COVERAGE_MANIFEST_CONFLICT');
        for(const d of ds)await insert(conn,c,d,'schema',{schemaSha256:sha(raw)});await refresh(conn,c);return {status:'open',reason:null};}
      if (m.schema_snapshot !== raw) { await markPartial(conn, c, 'schema_drift'); return { status: 'partial', reason: 'schema_drift' }; }
      return { status: m.coverage_status, reason: m.coverage_reason };
    }
    await conn.query('INSERT INTO po_overseas_stage_manifests (run_id,receipt_id,scope_sha256,manifest_sha256,schema_snapshot,schema_sha256,expected_set_sha256,created_epoch,updated_epoch) VALUES (?,?,?,?,?,?,?,?,?)',
      [c.runId, receiptId, sha(canonical(scopeOf(c))), c.manifestSha256, raw, sha(raw), sha('[]'), c.leaseEpoch, c.leaseEpoch]);
    for (const d of ds) await insert(conn, c, d, 'schema', { schemaSha256: sha(raw) }); await refresh(conn, c); return { status: 'open', reason: null };
  }
  async function registerTasks(conn, value, values, { origin, evidence: originEvidence } = {}) {
    const c = await fence(conn, value), m = await manifest(conn, c); await checkedSet(conn, c, m);
    if (m.coverage_status !== 'open' || Number(m.expansion_sealed) !== 0) fail('OVERSEAS_COVERAGE_SEALED');
    if (!Array.isArray(values) || values.length > 500) fail('OVERSEAS_COVERAGE_TASK_INVALID');
    for (const d of values) await insert(conn, c, d, origin, originEvidence); await refresh(conn, c);
  }
  async function commitPage(conn, value, { taskDescriptor: descriptor, checkpointId, derivedTasks = [], complete = false, origin = 'page' } = {}) {
    if (typeof complete !== 'boolean' || !['page', 'reply'].includes(origin)) fail('OVERSEAS_COVERAGE_PAGE_TASK_CONFLICT');
    const c = await fence(conn, value), m = await manifest(conn, c), rows = await checkedSet(conn, c, m);
    const d = descriptorOf(c, descriptor), key = identity.taskIdentity(d), t = rows.find(r => r.task_identity_sha256 === key);
    if (!t || t.state !== 'expected' || m.coverage_status !== 'open' || Number(m.expansion_sealed) !== 0 || typeof checkpointId !== 'string') fail('OVERSEAS_COVERAGE_PAGE_TASK_CONFLICT');
    if (t.checkpoint_id !== null && t.checkpoint_id !== checkpointId) fail('OVERSEAS_COVERAGE_CHECKPOINT_CONFLICT');
    const [cps] = await conn.query('SELECT *,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_sync_checkpoints WHERE id=? FOR UPDATE', [checkpointId]);
    if (cps.length !== 1) fail('OVERSEAS_COVERAGE_CHECKPOINT_CONFLICT'); const cp = cps[0], snapshot = checkpointSnapshot(cp, d);
    if (complete ? (cp.status !== 'completed' || cp.lease_owner !== null || cp.lease_until !== null || cp.cursor !== null || cp.error_code !== null || cp.error_message !== null)
      : (cp.status !== 'running' || cp.lease_owner !== c.leaseOwner || Number(cp.live) !== 1)) fail('OVERSEAS_COVERAGE_CHECKPOINT_CONFLICT');
    if (!Array.isArray(derivedTasks) || derivedTasks.length > 500) fail('OVERSEAS_COVERAGE_TASK_INVALID');
    for (const target of derivedTasks) await insert(conn, c, target, origin, { parentTaskIdentity: key, checkpointId, cursorSha256: sha(canonical(cp.cursor)), leaseEpoch: c.leaseEpoch });
    const raw = complete ? canonical(snapshot) : null;
    const [updated] = await conn.query("UPDATE po_overseas_expected_tasks SET checkpoint_id=?,state=?,completed_checkpoint_snapshot=?,completed_checkpoint_sha256=?,completed_epoch=?,updated_at=UTC_TIMESTAMP(3) WHERE run_id=? AND task_identity_sha256=? AND state='expected'",
      [checkpointId, complete ? 'completed' : 'expected', raw, raw === null ? null : sha(raw), complete ? c.leaseEpoch : null, c.runId, key]);
    if (updated.affectedRows !== 1) fail('OVERSEAS_COVERAGE_PAGE_TASK_CONFLICT'); await refresh(conn, c);
  }
  async function sealHistory(conn, value) {
    const c = await fence(conn, value), m = await manifest(conn, c); await checkedSet(conn, c, m);
    if (m.coverage_status !== 'open' || Number(m.expansion_sealed) !== 0) fail('OVERSEAS_COVERAGE_SEALED');
    await conn.query('UPDATE po_overseas_stage_manifests SET history_sealed=1,history_snapshot_at=COALESCE(history_snapshot_at,UTC_TIMESTAMP(3)),updated_epoch=?,updated_at=UTC_TIMESTAMP(3) WHERE run_id=?', [c.leaseEpoch, c.runId]);
  }
  async function markPartial(conn, value, reason) {
    const c = await fence(conn, value); await manifest(conn, c);
    if (typeof reason !== 'string' || !/^[a-z0-9_]{1,80}$/.test(reason)) fail('OVERSEAS_COVERAGE_REASON_INVALID');
    await conn.query("UPDATE po_overseas_stage_manifests SET coverage_status='partial',coverage_reason=COALESCE(coverage_reason,?),updated_epoch=?,updated_at=UTC_TIMESTAMP(3) WHERE run_id=?", [reason, c.leaseEpoch, c.runId]);
  }
  async function prepareHistorySnapshot(conn, value) {
    const { Repository } = require('./repository'), { performance } = require('node:perf_hooks');
    const begin = performance.now();
    const {limits,assertHistoryUsage,assertHistoryNextPage}=require('./overseasHistoryBudget');
    const budget=()=>assertHistoryUsage({elapsedMs:performance.now()-begin,...process.memoryUsage()});
    budget();
    const c = await fence(conn, value), m = await manifest(conn, c); await checkedSet(conn, c, m);
    if (Number(m.history_sealed) === 1) return { status: 'sealed', alreadyPresent: true };
    budget();
    if (m.coverage_status !== 'open' || Number(m.expansion_sealed) !== 0) fail('OVERSEAS_COVERAGE_SEALED');
    const [[isolation]] = await conn.query('SELECT @@tx_isolation AS isolation');
    if (String(isolation?.isolation).replace(/_/g, '-').toUpperCase() !== 'REPEATABLE-READ') fail('OVERSEAS_COVERAGE_SNAPSHOT_REQUIRED');
    const seen = new Set(); let count = 0, afterId = '';
    const scope = { sourceId: c.sourceId, accountId: c.accountId, gameId: c.gameId, communityId: c.communityId, siteId: c.siteId, boardId: c.boardId };
    const facade = { query: async (sql, params) => (await conn.query(sql, params))[0] };
    for (;;) {
      budget();assertHistoryNextPage(count);
      const limit = Math.min(200, limits.maxRoots - count);
      const page = await Repository.prototype.listOverseasBigPlayerCommentParents.call(facade, { ...scope, afterId, limit });
      budget();
      if (!Array.isArray(page?.rows) || !Number.isInteger(page.scannedCount) || page.scannedCount < page.rows.length || page.scannedCount > limit
        || typeof page.hasMore !== 'boolean' || !Number.isInteger(page.coverageGaps) || page.coverageGaps < 0) fail('OVERSEAS_COVERAGE_HISTORY_INVALID');
      count += page.scannedCount; if (page.coverageGaps) fail('OVERSEAS_COVERAGE_HISTORY_GAP');
      for (const row of page.rows) {
        const root = String(row.external_id);
        if (row.source_id !== c.sourceId || row.account_id !== c.accountId || row.game_id !== c.gameId || row.community_id !== c.communityId
          || row.site_id !== c.siteId || String(row.board_id) !== c.boardId || Number(row.content_depth) !== 0 || Number(row.is_deleted) !== 0
          || !/^[1-9]\d*$/.test(root)) fail('OVERSEAS_COVERAGE_HISTORY_INVALID');
        const [fullRows] = await conn.query('SELECT * FROM po_contents WHERE id=? FOR UPDATE', [row.id]);
        if (fullRows.length !== 1 || fullRows[0].external_id !== root || Number(fullRows[0].content_depth) !== 0 || Number(fullRows[0].is_deleted)) fail('OVERSEAS_COVERAGE_HISTORY_INVALID');
        await require('../../../worker/src/overseasBigPlayerPageStore').assertRow(fullRows[0], c, async () => true);
        await insert(conn, c, identity.taskDescriptor(c, { taskKind: 'comments', taskKey: `board:${c.boardId}:${root}`, syncScope: 'comments', rootPlatformContentId: root }), 'history', { contentId: row.id, scopeSha256: m.scope_sha256 });
        budget();
      }
      if (!page.hasMore) {
        await refresh(conn, c); budget(); await sealHistory(conn, c);
        budget();
        return { status: 'sealed', scannedCount: count, elapsedMs: performance.now() - begin, maxRoots: 10000, maxMs: 10000 };
      }
      if (!page.nextCursor || page.nextCursor === afterId || seen.has(page.nextCursor)) fail('OVERSEAS_COVERAGE_HISTORY_CURSOR_STALLED');
      afterId = page.nextCursor; seen.add(afterId);
    }
  }
  async function validateCompleted(conn, c, rows, lock = true) {
    for (const t of rows) {
      if (t.state !== 'completed') return { status: 'partial', reason: 'expected_task_unfinished' };
      if (!t.checkpoint_id || !t.completed_checkpoint_snapshot || sha(t.completed_checkpoint_snapshot) !== t.completed_checkpoint_sha256
        || !Number.isSafeInteger(Number(t.completed_epoch)) || Number(t.completed_epoch) < Number(t.created_epoch) || Number(t.completed_epoch) > c.leaseEpoch) fail('OVERSEAS_COVERAGE_COMPLETION_INVALID');
      parsed(t.completed_checkpoint_snapshot);
      const [cps] = await conn.query('SELECT * FROM po_sync_checkpoints WHERE id=?' + (lock ? ' FOR UPDATE' : ''), [t.checkpoint_id]);
      if (cps.length !== 1 || cps[0].status !== 'completed' || cps[0].lease_owner !== null || cps[0].lease_until !== null || cps[0].cursor !== null
        || cps[0].error_code !== null || cps[0].error_message !== null || canonical(checkpointSnapshot(cps[0], parsed(t.descriptor))) !== t.completed_checkpoint_snapshot) fail('OVERSEAS_COVERAGE_CHECKPOINT_CONFLICT');
    } return { status: 'completed_authorized_scope', reason: null };
  }
  async function sealExpansion(conn, value) {
    const c = await fence(conn, value), m = await manifest(conn, c), rows = await checkedSet(conn, c, m);
    if (m.coverage_status === 'sealed') {
      if (Number(m.history_sealed) !== 1 || Number(m.expansion_sealed) !== 1) fail('OVERSEAS_COVERAGE_MANIFEST_CONFLICT');
      return validateCompleted(conn, c, rows);
    }
    if (m.coverage_status !== 'open' || Number(m.history_sealed) !== 1) return { status: 'partial', reason: m.coverage_reason || 'history_unsealed' };
    const verdict = await validateCompleted(conn, c, rows); if (verdict.status === 'partial') return verdict;
    await conn.query("UPDATE po_overseas_stage_manifests SET expansion_sealed=1,coverage_status='sealed',updated_epoch=?,updated_at=UTC_TIMESTAMP(3) WHERE run_id=?", [c.leaseEpoch, c.runId]); return verdict;
  }
  async function assessTerminal(conn, value) {
    const c = await fence(conn, value), m = await manifest(conn, c), rows = await checkedSet(conn, c, m);
    if (m.coverage_status !== 'sealed' || Number(m.history_sealed) !== 1 || Number(m.expansion_sealed) !== 1) return { status: 'partial', reason: m.coverage_reason || 'coverage_unsealed' };
    return { ...await validateCompleted(conn, c, rows), taskSetSha256: m.expected_set_sha256, completionSetSha256: completionDigest(rows), taskCount: rows.length, schemaSha256: m.schema_sha256 };
  }
  async function readProgress(conn, value, {terminal=false}={}) {
    const c = await evidence(value);if(scheduled){if(terminal)await scheduled.context.terminalFence(conn,c);else await scheduled.context.fence(conn,c,{lock:false});}
    const m = await manifest(conn, c, false), rows = await checkedSet(conn, c, m, false);
    const [runs] = await conn.query('SELECT source_id,account_id,site_id,window_start,window_end,lease_epoch FROM po_sync_runs WHERE id=?', [c.runId]);
    if (runs.length !== 1 || runs[0].source_id !== c.sourceId || runs[0].account_id !== c.accountId || runs[0].site_id !== c.siteId || iso(runs[0].window_start) !== c.windowStart
      || iso(runs[0].window_end) !== c.windowEnd || Number(runs[0].lease_epoch) !== c.leaseEpoch) fail('OVERSEAS_COVERAGE_RUN_CONFLICT');
    const completed = rows.filter(r => r.state === 'completed'); await validateCompleted(conn, c, completed, false);
    return { coverageStatus: m.coverage_status, reason: m.coverage_reason, total: rows.length, completed: completed.length, taskIdentities: rows.map(r => r.task_identity_sha256),
      pending: rows.filter(r => r.state !== 'completed').map(r => parsed(r.descriptor)), historySealed: Number(m.history_sealed) === 1,
      expansionSealed: Number(m.expansion_sealed) === 1, taskSetSha256: m.expected_set_sha256, completionSetSha256: completionDigest(rows), schemaSha256: m.schema_sha256, automaticWriteAllowed: false };
  }
  async function verifyLinkedTasks(conn, value, links, { lock = true, completed = false, terminal=false } = {}) {
    const c = await evidence(value);if(scheduled){if(terminal){if(lock)fail('OVERSEAS_COVERAGE_TERMINAL_READONLY');await scheduled.context.terminalFence(conn,c);}else await scheduled.context.fence(conn,c,{lock});}
    const m = await manifest(conn, c, lock), rows = await checkedSet(conn, c, m, lock);
    const descriptors = rows.map(row => ({ row, d: parsed(row.descriptor) }));
    const suffix = lock ? ' FOR UPDATE' : '';
    const belongs = predicate => {
      if (!descriptors.some(({ row, d }) => predicate(d) && (completed ? row.state === 'completed' : ['expected','completed'].includes(row.state))))
        fail('OVERSEAS_COVERAGE_LINK_TASK_MISSING');
    };
    for (const link of links) {
      if (link.sync_scope === 'posts') {
        const [memberships] = await conn.query('SELECT * FROM po_content_feed_memberships WHERE account_id=? AND content_id=?' + suffix, [c.accountId, link.content_id]);
        if (!memberships.length) fail('OVERSEAS_COVERAGE_LINK_TASK_MISSING');
        for (const member of memberships) {
          let feed; try { feed = typeof member.feed_metadata === 'string' ? JSON.parse(member.feed_metadata) : member.feed_metadata; }
          catch { fail('OVERSEAS_COVERAGE_LINK_TASK_CONFLICT'); }
          if (feed?.feedKey !== member.feed_key || String(feed?.boardId) !== c.boardId) fail('OVERSEAS_COVERAGE_LINK_TASK_CONFLICT');
          belongs(d => d.taskKind === 'q1_feed' && d.feed?.feedKey === member.feed_key && canonical(d.feed) === canonical(feed));
        }
      } else if (link.sync_scope === 'comments') {
        const [parents] = await conn.query('SELECT id,external_id FROM po_contents WHERE id IN (?,?)' + suffix, [link.root_content_id, link.parent_content_id]);
        const root = parents.find(row => row.id === link.root_content_id), parent = parents.find(row => row.id === link.parent_content_id);
        if (!root || !parent) fail('OVERSEAS_COVERAGE_LINK_TASK_CONFLICT');
        // Comment pagination itself may yield inline replies. Links do not
        // carry a unique producer task; prove legal ownership, not provenance.
        belongs(d => d.rootPlatformContentId === String(root.external_id)
          && (d.taskKind === 'comments' || (Number(link.content_depth) > 1 && d.taskKind === 'q1_reply' && d.commentId === String(parent.external_id))));
      } else fail('OVERSEAS_COVERAGE_LINK_TASK_CONFLICT');
    }
  }
  function assertContext(context) {
    if(scheduled){if(context?.repo!==scheduled.repo||context?.journal!==journal||context?.scheduledProof!==scheduled.proof)fail('OVERSEAS_COVERAGE_CONTEXT_CONFLICT');return;}
    if (context?.journal !== journal || context?.receipt !== receipt) fail('OVERSEAS_COVERAGE_CONTEXT_CONFLICT');
  }
  // Caller commits only after this final fresh fence; a long history/page
  // transaction must not publish after the parent/source lease expires.
  const guardedMutation = operation => scheduled ? async (conn, value, ...args) => {
    const result = await operation(conn, value, ...args);
    await fence(conn, value);
    return result;
  } : operation;
  const ledger = Object.freeze({ prepareSchema: guardedMutation(prepareSchema), registerTasks: guardedMutation(registerTasks),
    commitPage: guardedMutation(commitPage), prepareHistorySnapshot: guardedMutation(prepareHistorySnapshot),
    markPartial: guardedMutation(markPartial), sealExpansion: guardedMutation(sealExpansion),
    assessTerminal, readProgress, verifyLinkedTasks, assertContext, productionActivationAllowed: false });
  if(scheduled)scheduledLedgers.set(ledger,scheduled);
  ledgers.add(ledger); return ledger;
}
function assertCoverageSafetyContext(ledger,{repo,journal,scheduledProof}={}){
  const context=scheduledLedgers.get(ledger);
  if(context){if(context.repo!==repo||context.proof!==scheduledProof||(journal!==undefined&&context.journal!==journal))fail('OVERSEAS_COVERAGE_CONTEXT_CONFLICT');
    require('./overseasScheduledAdmissionStore').scheduledFirstClaimContext(scheduledProof,repo);}
  else if(scheduledProof)fail('OVERSEAS_COVERAGE_CONTEXT_CONFLICT');
  return Boolean(context);
}
module.exports = { createOverseasStageCoverageLedger, createOverseasScheduledStageCoverageLedger, assertCoverageSafetyContext, isOverseasStageCoverageLedger: value => ledgers.has(value), checkpointSnapshot };
