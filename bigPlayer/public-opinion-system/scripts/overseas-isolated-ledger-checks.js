'use strict';
// Artificial checkpoint fixtures, real SQL transactions. Not provider completion.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { canonical, createOverseasRunContractJournal } = require('../worker/src/overseasBigPlayerRunContractJournal');
const { createOverseasClaimedContracts } = require('../worker/src/overseasBigPlayerClaimedContracts');
const { createOverseasStageCoverageLedger } = require('../server/src/db/overseasStageCoverage');
const { createOverseasStageCoverage } = require('../worker/src/overseasStageCoverage');
const { createOverseasBoundAudit } = require('../server/src/db/overseasBoundAudit');
const { schemaDescriptors,taskDescriptor } = require('../worker/src/overseasStageTaskIdentity');
const assert = (yes, code) => { if (!yes) throw Object.assign(new Error(code), { code }); };
async function checkLedgerMatrix({ repo, receipt, root, directory, sourceId }) {
  const [[db]] = await repo.pool.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,DATABASE() AS db');
  assert(Number(db.port) === 13316 && Number(db.serverId) === 20261036 && db.db === 'po_overseas_fixture'
    && path.resolve(db.datadir).toLowerCase() === path.join(directory, 'data').toLowerCase(), 'LEDGER_MATRIX_ISOLATION');
  assert(path.dirname(directory) === path.join(root, '.temp'), 'LEDGER_MATRIX_PATH');
  for (const p of [root, path.join(root, '.temp'), directory]) { const stat = fs.lstatSync(p); assert(stat.isDirectory() && !stat.isSymbolicLink() && fs.realpathSync(p) === p, 'LEDGER_MATRIX_PATH'); }
  const checks = [], fixtures = []; let writes = 0, destroys = 0, previousBindings = [];
  function observed(fault = {}) {
    const result = Object.create(repo);
    result.pool = { getConnection: async () => {
      const conn = await repo.pool.getConnection(); let terminal = false;
      return new Proxy(conn, { get(target, key) {
        if (key === 'query') return async (sql, params) => {
          if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(sql)) writes++;
          if (sql.startsWith('UPDATE po_sync_runs SET status=?,finished_at=')) terminal = true;
          if (fault.auditUpdate && sql.startsWith('UPDATE po_collection_runs SET status=')) { fault.auditUpdate = false; throw Object.assign(new Error('synthetic audit failure'), { code: 'INJECTED_AUDIT_UPDATE' }); }
          if (fault.sourceUpdate && sql.startsWith('UPDATE po_sources s JOIN')) { fault.sourceUpdate = false; throw Object.assign(new Error('synthetic source failure'), { code: 'INJECTED_SOURCE_UPDATE' }); }
          if(fault.auditCreateEvent&&sql.startsWith('INSERT INTO po_audit_events')&&params[5]==='overseas_bound_audit'){fault.auditCreateEvent=false;throw Object.assign(Error('synthetic binding event failure'),{code:'INJECTED_AUDIT_CREATE_EVENT'});}
          return target.query(sql, params);
        };
        if (key === 'commit') return async () => { await target.commit(); if (terminal && fault.ackLoss) { fault.ackLoss = false; throw new Error('synthetic ACK loss'); } };
        if (key === 'destroy') return () => { destroys++; target.destroy(); };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
      } });
    } }; return result;
  }
  async function snapshot(c) {
    const out = {};
    for (const [name, sql, params] of [
      ['run', 'SELECT * FROM po_sync_runs WHERE id=?', [c.runId]],
      ['source', 'SELECT last_success_at,last_error FROM po_sources WHERE id=?', [c.sourceId]],
      ['manifest', 'SELECT * FROM po_overseas_stage_manifests WHERE run_id=?', [c.runId]],
      ['tasks', 'SELECT * FROM po_overseas_expected_tasks WHERE run_id=? ORDER BY task_identity_sha256', [c.runId]],
      ['audit', "SELECT * FROM po_collection_runs WHERE id IN (SELECT JSON_UNQUOTE(JSON_EXTRACT(detail,'$.auditId')) FROM po_audit_events WHERE JSON_UNQUOTE(JSON_EXTRACT(detail,'$.syncRunId'))=?) ORDER BY id", [c.runId]],
      ['events', "SELECT * FROM po_audit_events WHERE JSON_UNQUOTE(JSON_EXTRACT(detail,'$.syncRunId'))=? ORDER BY id", [c.runId]]
    ]) out[name] = (await repo.pool.query(sql, params))[0]; return canonical(out);
  }
  async function fresh(label,{prepareHistory=true}={}) {
    for (const b of previousBindings) await repo.query("UPDATE po_sync_runs SET status='failed',lease_owner=NULL,lease_until=NULL,finished_at=UTC_TIMESTAMP(3),error_code='ARTIFICIAL_MATRIX_SETUP' WHERE id=? AND status IN ('queued','running')", [b.runId]);
    await repo.query('UPDATE po_sources SET collect_requested_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? SECOND) WHERE id=?', [20 + fixtures.length, sourceId]);
    const [[marker]] = await repo.pool.query("SELECT DATE_FORMAT(collect_requested_at,'%Y-%m-%dT%H:%i:%s.000Z') AS value FROM po_sources WHERE id=?", [sourceId]);
    const request = await receipt.prepare({ repo, sourceId, expectedMarker: marker.value, manifestSha256: 'a'.repeat(64) });
    previousBindings = request.bindings;
    await repo.handoffOverseasManualMarker({ request, receipt }); const b = request.bindings.find(x => x.siteId === 'site-fr');
    const won = await repo.claimSyncRun({ runId: b.runId, leaseOwner: `ledger-${label}`, leaseSeconds: 300 }); assert(won && Number(won.lease_epoch) === 1, 'LEDGER_FIXTURE_CLAIM');
    const journalDir = path.join(directory, `ledger-matrix-${label}-${crypto.randomUUID()}`); fs.mkdirSync(journalDir);
    const journal = await createOverseasRunContractJournal({ repositoryRoot: root, directory: journalDir });
    const source = { id: b.sourceId, game_id: b.gameId, community_id: b.communityId, platform: 'bigplayer_h5', region_code: 'overseas', siteId: b.siteId, siteUrl: b.siteUrl,
      config: { boardId: b.boardId, baseUrl: b.siteUrl, siteUrls: request.bindings.map(x => ({ siteId: x.siteId, url: x.siteUrl, enabled: true })) } };
    const account = { id: b.accountId, source_id: b.sourceId, game_id: b.gameId, community_id: b.communityId, platform: 'bigplayer_h5' };
    const c = await createOverseasClaimedContracts({ repo, journal, manifestSha256: b.manifestSha256, initialRunBindings: [b] }).prepare({ source, account, syncRunId: b.runId, leaseOwner: won.lease_owner, leaseEpoch: 1, windowStart: b.windowStart, windowEnd: b.windowEnd });
    const ledger = createOverseasStageCoverageLedger({ journal, receipt, request }), coverage = createOverseasStageCoverage({ repo, ledger });
    const feed = { boardId: c.boardId, feedKey: 'synthetic-ledger-feed', pageKind: 'home' };
    if(prepareHistory)await coverage.prepare(c,[feed]);else await coverage.transaction(cn=>ledger.prepareSchema(cn,c,{schemaDescriptors:schemaDescriptors(c,[feed])}));
    const f = { c, ledger, coverage, journal, feed, checkpointIds: [] };
    fixtures.push({ label, requestId: request.requestId, runId: c.runId, checkpointIds: f.checkpointIds, fixtureKind: 'artificial_checkpoint_completion_no_acquisition' }); return f;
  }
  const progress = f => f.coverage.transaction(conn => f.ledger.readProgress(conn, f.c), true);
  async function complete(f,{seal=true}={}) {
    for (const d of (await progress(f)).pending) {
      const cp = await repo.claimSyncCheckpoint({ accountId: d.accountId, siteId: d.siteId, taskKind: d.taskKind, taskKey: d.taskKey, syncScope: d.syncScope, rootPlatformContentId: d.rootPlatformContentId,
        windowStart: d.windowStart, windowEnd: d.windowEnd, syncMode: 'incremental', leaseOwner: f.c.leaseOwner, leaseSeconds: 300 }); assert(cp, 'LEDGER_FIXTURE_CP'); f.checkpointIds.push(cp.id);
      await f.coverage.transaction(async conn => {
        await conn.query("UPDATE po_sync_checkpoints SET status='completed',`cursor`=NULL,items_fetched=0,last_item_at=NULL,lease_owner=NULL,lease_until=NULL,error_code=NULL,error_message=NULL WHERE id=? AND lease_owner=?", [cp.id, f.c.leaseOwner]);
        await f.ledger.commitPage(conn, f.c, { taskDescriptor: d, checkpointId: cp.id, complete: true });
      });
    } if(seal)assert((await f.coverage.seal(f.c)).status === 'completed_authorized_scope', 'LEDGER_FIXTURE_SEAL');
  }
  async function rejection(work, code) { let caught; try { await work(); } catch (error) { caught = error; } assert(caught?.code === code, 'LEDGER_EXPECTED_ERROR_' + code); }
  async function racePair(first,second,after){
    const a=await repo.pool.getConnection();let b,aActive=false,bActive=false,aDead=false,bDead=false;
    const begin=async cn=>{await cn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await cn.query('SET SESSION innodb_lock_wait_timeout=1');await cn.query('SET SESSION max_statement_time=10');await cn.beginTransaction();};
    try{
      b=await repo.pool.getConnection();const [[ai]]=await a.query('SELECT CONNECTION_ID() AS id'),[[bi]]=await b.query('SELECT CONNECTION_ID() AS id');assert(ai.id!==bi.id,'LEDGER_RACE_SAME_CONNECTION');
      await begin(a);aActive=true;const value=await first(a);await begin(b);bActive=true;
      await rejection(()=>second(b),'ER_LOCK_WAIT_TIMEOUT');await b.rollback();bActive=false;
      try{await a.commit();aActive=false;}catch(e){aDead=true;aActive=false;a.destroy();throw e;}
      await begin(b);bActive=true;await after(b,value);
      try{await b.commit();bActive=false;}catch(e){bDead=true;bActive=false;b.destroy();throw e;}
    }finally{
      if(aActive)try{await a.rollback();}catch{aDead=true;a.destroy();}
      if(bActive)try{await b.rollback();}catch{bDead=true;b.destroy();}
      if(!aDead)a.release();if(b&&!bDead)b.release();
    }
  }
  {
    const f=await fresh('register-first');await complete(f,{seal:false});const baseline=await progress(f);
    const d=taskDescriptor(f.c,{taskKind:'comments',taskKey:`board:${f.c.boardId}:990001`,syncScope:'comments',rootPlatformContentId:'990001'});
    const register=cn=>f.ledger.registerTasks(cn,f.c,[d],{origin:'page',evidence:{fixture:'two_connection_register_first'}});
    await racePair(register,cn=>f.ledger.sealExpansion(cn,f.c),async cn=>{assert((await f.ledger.sealExpansion(cn,f.c)).status==='partial','LEDGER_RACE_NEW_TASK_LOST');});
    const p=await progress(f);assert(p.total===baseline.total+1&&p.completed===baseline.completed&&!p.expansionSealed&&p.pending.length===1,'LEDGER_RACE_REGISTER_COUNTS');
    checks.push('two_connection_register_blocks_seal_then_partial');
  }
  {
    const f=await fresh('seal-first');await complete(f,{seal:false});const baseline=await progress(f);
    const d=taskDescriptor(f.c,{taskKind:'comments',taskKey:`board:${f.c.boardId}:990002`,syncScope:'comments',rootPlatformContentId:'990002'});
    const register=cn=>f.ledger.registerTasks(cn,f.c,[d],{origin:'page',evidence:{fixture:'two_connection_seal_first'}});
    await racePair(cn=>f.ledger.sealExpansion(cn,f.c),register,async(cn,v)=>{assert(v.status==='completed_authorized_scope','LEDGER_RACE_SEAL_FIRST');await rejection(()=>register(cn),'OVERSEAS_COVERAGE_SEALED');});
    const p=await progress(f);assert(p.total===baseline.total&&p.completed===baseline.completed&&p.expansionSealed&&p.coverageStatus==='sealed','LEDGER_RACE_SEALED_REGISTER_MUTATED');
    checks.push('two_connection_seal_blocks_register_then_rejects');
  }
  {
    const f=await fresh('page-first'),baseline=await progress(f),feed=baseline.pending.find(d=>d.taskKind==='q1_feed');assert(feed,'LEDGER_RACE_FEED_MISSING');
    const cp=await repo.claimSyncCheckpoint({accountId:feed.accountId,siteId:feed.siteId,taskKind:feed.taskKind,taskKey:feed.taskKey,syncScope:feed.syncScope,rootPlatformContentId:feed.rootPlatformContentId,windowStart:feed.windowStart,windowEnd:feed.windowEnd,syncMode:'incremental',leaseOwner:f.c.leaseOwner,leaseSeconds:300});assert(cp,'LEDGER_RACE_CP');f.checkpointIds.push(cp.id);
    const derived=taskDescriptor(f.c,{taskKind:'comments',taskKey:`board:${f.c.boardId}:990003`,syncScope:'comments',rootPlatformContentId:'990003'});
    await racePair(async cn=>{
      await cn.query("UPDATE po_sync_checkpoints SET status='completed',`cursor`=NULL,items_fetched=0,last_item_at=NULL,lease_owner=NULL,lease_until=NULL,error_code=NULL,error_message=NULL WHERE id=? AND lease_owner=?",[cp.id,f.c.leaseOwner]);
      await f.ledger.commitPage(cn,f.c,{taskDescriptor:feed,checkpointId:cp.id,complete:true,derivedTasks:[derived],origin:'page'});
    },cn=>f.ledger.sealExpansion(cn,f.c),async cn=>{assert((await f.ledger.sealExpansion(cn,f.c)).status==='partial','LEDGER_RACE_PAGE_LOST');});
    const p=await progress(f);assert(p.total===baseline.total+1&&p.completed===baseline.completed+1&&!p.expansionSealed,'LEDGER_RACE_PAGE_COUNTS');
    checks.push('two_connection_commit_page_blocks_seal_preserves_derived_task');
  }
  {
    const f = await fresh('missing'), audit = createOverseasBoundAudit({ repo: observed(), journal: f.journal, ledger: f.ledger }), bound = await audit.create(f.c);
    assert((await f.coverage.seal(f.c)).status === 'partial', 'LEDGER_MISSING_SEALED');
    const terminal = await audit.finish({ proof: bound.auditProof, status: 'completed_authorized_scope' });
    assert(terminal.status === 'partial' && terminal.errorCode === 'OVERSEAS_COVERAGE_PARTIAL', 'LEDGER_MISSING_SUCCESS'); checks.push('missing_expected_task_forces_partial');
  }
  {
    const f=await fresh('create-rollback'),audit=createOverseasBoundAudit({repo:observed({auditCreateEvent:true}),journal:f.journal,ledger:f.ledger});
    const before=await snapshot(f.c),[[countBefore]]=await repo.pool.query('SELECT COUNT(*) AS n FROM po_collection_runs WHERE source_id=?',[f.c.sourceId]);
    await rejection(()=>audit.create(f.c),'INJECTED_AUDIT_CREATE_EVENT');
    const [[countAfter]]=await repo.pool.query('SELECT COUNT(*) AS n FROM po_collection_runs WHERE source_id=?',[f.c.sourceId]);
    assert(before===await snapshot(f.c)&&Number(countBefore.n)===Number(countAfter.n),'LEDGER_CREATE_ROLLBACK');
    const bound=await audit.create(f.c),[[saved]]=await repo.pool.query('SELECT status FROM po_collection_runs WHERE id=?',[bound.id]);assert(saved.status==='running','LEDGER_CREATE_RETRY');
    checks.push('audit_create_binding_event_fault_rolls_back_orphan_audit_exact_retry');
  }
  {
    const f=await fresh('descriptor-conflict'),d=(await progress(f)).pending.find(x=>x.taskKind==='q1_feed'),before=await snapshot(f.c);
    for(const patch of [{runId:crypto.randomUUID()},{unexpected:'synthetic'}]){
      await rejection(()=>f.coverage.transaction(cn=>f.ledger.registerTasks(cn,f.c,[{...d,...patch}],{origin:'page',evidence:{fixture:'noncanonical_descriptor'}})),'OVERSEAS_COVERAGE_TASK_INVALID');
      assert(before===await snapshot(f.c),'LEDGER_FOREIGN_DESCRIPTOR_MUTATED');
    }
    checks.push('foreign_run_and_noncanonical_descriptor_rejected_without_mutation');
  }
  {
    const f=await fresh('wrong-window-cp'),d=(await progress(f)).pending.find(x=>x.taskKind==='q1_feed');
    const cp=await repo.claimSyncCheckpoint({accountId:d.accountId,siteId:d.siteId,taskKind:d.taskKind,taskKey:d.taskKey,syncScope:d.syncScope,rootPlatformContentId:d.rootPlatformContentId,windowStart:new Date(Date.parse(d.windowStart)-86400000).toISOString(),windowEnd:new Date(Date.parse(d.windowEnd)-86400000).toISOString(),syncMode:'incremental',leaseOwner:f.c.leaseOwner,leaseSeconds:300});assert(cp,'LEDGER_WRONG_WINDOW_CP');f.checkpointIds.push(cp.id);
    await repo.query("UPDATE po_sync_checkpoints SET status='completed',`cursor`=NULL,items_fetched=0,last_item_at=NULL,lease_owner=NULL,lease_until=NULL,error_code=NULL,error_message=NULL WHERE id=? AND lease_owner=?",[cp.id,f.c.leaseOwner]);
    const before=await snapshot(f.c),old=canonical((await repo.pool.query('SELECT * FROM po_sync_checkpoints WHERE id=?',[cp.id]))[0]);
    await rejection(()=>f.coverage.transaction(cn=>f.ledger.commitPage(cn,f.c,{taskDescriptor:d,checkpointId:cp.id,complete:true})),'OVERSEAS_COVERAGE_CHECKPOINT_CONFLICT');
    assert(before===await snapshot(f.c)&&old===canonical((await repo.pool.query('SELECT * FROM po_sync_checkpoints WHERE id=?',[cp.id]))[0]),'LEDGER_WRONG_WINDOW_CP_MUTATED');checks.push('wrong_window_checkpoint_rejected_without_mutation');
  }
  {
    const f = await fresh('drift'), before = await progress(f);
    const [[old]] = await repo.pool.query('SELECT schema_snapshot,schema_sha256 FROM po_overseas_stage_manifests WHERE run_id=?', [f.c.runId]);
    const verdict = await f.coverage.transaction(conn => f.ledger.prepareSchema(conn, f.c, { schemaDescriptors: schemaDescriptors(f.c, [{ ...f.feed, pageKind: 'changed' }]) }));
    const [[after]] = await repo.pool.query('SELECT schema_snapshot,schema_sha256 FROM po_overseas_stage_manifests WHERE run_id=?', [f.c.runId]);
    assert(verdict.status === 'partial' && canonical(old) === canonical(after) && canonical(before.taskIdentities) === canonical((await progress(f)).taskIdentities), 'LEDGER_DRIFT_MUTATED'); checks.push('schema_drift_preserves_tasks');
  }
  {
    const f = await fresh('rollback'); await complete(f);
    const audit = createOverseasBoundAudit({ repo: observed({ auditUpdate: true }), journal: f.journal, ledger: f.ledger }), bound = await audit.create(f.c), before = await snapshot(f.c);
    await rejection(() => audit.finish({ proof: bound.auditProof, status: 'completed_authorized_scope', sourceStatus: 'success' }), 'INJECTED_AUDIT_UPDATE');
    assert(before === await snapshot(f.c), 'LEDGER_AUDIT_ROLLBACK_MISMATCH');
    assert((await audit.finish({ proof: bound.auditProof, status: 'completed_authorized_scope' })).status === 'completed_authorized_scope', 'LEDGER_AUDIT_RETRY'); checks.push('audit_failure_all_rollback_exact_retry');
  }
  {
    const f = await fresh('source-rollback'); await complete(f);
    const audit = createOverseasBoundAudit({ repo: observed({ sourceUpdate: true }), journal: f.journal, ledger: f.ledger }), bound = await audit.create(f.c), before = await snapshot(f.c);
    await rejection(() => audit.finish({ proof: bound.auditProof, status: 'failed', errorCode: 'SYNTHETIC_FAILURE', errorMessage: 'synthetic source failure', sourceStatus: 'failed' }), 'INJECTED_SOURCE_UPDATE');
    assert(before === await snapshot(f.c), 'LEDGER_SOURCE_ROLLBACK_MISMATCH');
    const terminal = await audit.finish({ proof: bound.auditProof, status: 'failed', errorCode: 'SYNTHETIC_FAILURE', errorMessage: 'synthetic source failure', sourceStatus: 'failed' });
    assert(terminal.sourceEffect?.lastError === 'synthetic source failure' && (await audit.reconcile({ contract: f.c, status: 'failed' })).status === 'accepted', 'LEDGER_SOURCE_ATOMIC_FAILED');
    checks.push('source_failure_atomic_rollback_and_failed_reconcile');
  }
  {
    const f = await fresh('ack'); await complete(f);
    const audit = createOverseasBoundAudit({ repo: observed({ ackLoss: true }), journal: f.journal, ledger: f.ledger }), bound = await audit.create(f.c), destroyBefore = destroys;
    await rejection(() => audit.finish({ proof: bound.auditProof, status: 'completed_authorized_scope', sourceStatus: 'success' }), 'OVERSEAS_AUDIT_COMMIT_UNKNOWN');
    const before = await snapshot(f.c), writeBefore = writes, verdict = await audit.reconcile({ contract: f.c, status: 'completed_authorized_scope' });
    assert(verdict.status === 'accepted' && writes === writeBefore && destroys === destroyBefore + 1 && before === await snapshot(f.c), 'LEDGER_ACK_RECONCILE'); checks.push('real_commit_ack_loss_destroy_readonly_accepted');
  }
  {
    const f = await fresh('seal-replay'); await complete(f); const before = await snapshot(f.c);
    assert((await f.coverage.seal(f.c)).status === 'completed_authorized_scope' && before === await snapshot(f.c), 'LEDGER_SEAL_REPLAY'); checks.push('seal_before_terminal_idempotent');
  }
  {
    const f = await fresh('unbound'), audit = createOverseasBoundAudit({ repo: observed(), journal: f.journal, ledger: f.ledger }), oldId = crypto.randomUUID();
    await repo.query('INSERT INTO po_collection_runs (id,source_id,status) VALUES (?,?,?)', [oldId, sourceId, 'running']);
    const before = canonical((await repo.pool.query('SELECT * FROM po_collection_runs WHERE id=?', [oldId]))[0]), writeBefore = writes;
    assert((await audit.reportUnboundRunning(sourceId)).some(x => x.auditId === oldId && x.disposition === 'unbound_running_manual_review') && writes === writeBefore
      && before === canonical((await repo.pool.query('SELECT * FROM po_collection_runs WHERE id=?', [oldId]))[0]), 'LEDGER_OLD_AUDIT_MUTATED'); checks.push('old_unbound_readonly_manual_review');
  }
  {
    const f=await fresh('memory-budget',{prepareHistory:false}),before=await progress(f),originalMemoryUsage=process.memoryUsage;let samples=0;
    // Only this isolated test process substitutes observed usage; fixed limits
    // and the production API have no override. Restore before further work.
    process.memoryUsage=()=>{const m=originalMemoryUsage();return ++samples>=5?{...m,rss:require('../server/src/db/overseasHistoryBudget').limits.maxRssBytes}:m;};
    try{await rejection(()=>f.coverage.prepare(f.c,[f.feed]),'OVERSEAS_COVERAGE_HISTORY_MEMORY_BUDGET');}finally{process.memoryUsage=originalMemoryUsage;}
    const after=await progress(f),[[saved]]=await repo.pool.query("SELECT COUNT(*) AS n FROM po_overseas_expected_tasks WHERE run_id=? AND origin='history'",[f.c.runId]);
    assert(samples>=5&&after.coverageStatus==='partial'&&!after.historySealed&&after.total===before.total&&Number(saved.n)===0,'LEDGER_MEMORY_BUDGET_ROLLBACK');
    checks.push('isolated_usage_injection_real_sql_memory_budget_rollback_partial');
  }
  {
    const f=await fresh('history-gap',{prepareHistory:false}),rootId=crypto.randomUUID(),externalId=String(Date.now())+String(crypto.randomInt(100000,999999));
    const scope=Object.fromEntries(['sourceId','accountId','gameId','communityId','boardId','siteId','siteUrl','siteUrlSha256'].map(k=>[k,f.c[k]]));
    await repo.query('INSERT INTO po_contents (id,game_id,community_id,source_id,account_id,external_id,content_type,content_depth,is_deleted,body,fingerprint,raw_payload) VALUES (?,?,?,?,?,?,?,0,0,?,?,?)',[rootId,f.c.gameId,f.c.communityId,f.c.sourceId,f.c.accountId,externalId,'post','synthetic unassociated history',crypto.createHash('sha256').update(rootId).digest('hex'),JSON.stringify({boardId:f.c.boardId,_overseasScope:scope})]);
    const before=await progress(f);await rejection(()=>f.coverage.prepare(f.c,[f.feed]),'OVERSEAS_COVERAGE_HISTORY_GAP');
    const after=await progress(f);assert(after.coverageStatus==='partial'&&!after.historySealed&&!after.expansionSealed&&after.total===before.total&&canonical(after.taskIdentities)===canonical(before.taskIdentities),'LEDGER_HISTORY_GAP_ROLLBACK_PARTIAL');
    const [[linked]]=await repo.pool.query('SELECT COUNT(*) AS n FROM po_sync_run_contents WHERE content_id=?',[rootId]);assert(Number(linked.n)===0,'LEDGER_HISTORY_GAP_FABRICATED_PROVENANCE');checks.push('unassociated_history_gap_rolls_back_and_marks_partial');
  }
  return { status: 'PASS_ISOLATED_LEDGER_TRANSACTION_MATRIX', checks, fixtures, actualRunSourceExecuted: false, realHttpExecuted: false, aiExecuted: false, translationExecuted: false, productionActivationAllowed: false };
}
module.exports = { checkLedgerMatrix };
