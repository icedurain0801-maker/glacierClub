'use strict';
// Same-process, original firstClaim epoch1 only. No recovery capability.
const crypto = require('node:crypto');
const { canonical } = require('../../../worker/src/overseasBigPlayerRunContractJournal');
const { iso } = require('../../../worker/src/overseasBigPlayerNetworkContractVerifier');
const { requestOf, scheduledFirstClaimContext } = require('./overseasScheduledAdmissionStore');
const { createOverseasScheduledStageCoverageLedger } = require('./overseasStageCoverage');
const { createOverseasBoundAudit } = require('./overseasBoundAudit');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const uuid = value => { const h = hash(value); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`; };
const fail = code => { throw Object.assign(Error(code), { code }); };
const db = value => value.replace('T', ' ').replace('Z', '');
const statements = [
  'CREATE TABLE po_fixture_success_cursors (scope_sha CHAR(64) PRIMARY KEY, cursor_at DATETIME(3) NOT NULL, parent_run_id CHAR(36) NOT NULL, batch_sha CHAR(64) NOT NULL, child_run_id CHAR(36) NOT NULL, evidence_sha CHAR(64) NOT NULL) ENGINE=InnoDB COLLATE=utf8mb4_bin'
];
const certifiedReaders=new WeakMap();
const scopeFields=['sourceId','accountId','gameId','communityId','siteId','boardId','siteUrl','siteUrlSha256'];
const fullScope=value=>Object.fromEntries(scopeFields.map(k=>[k,value[k]]));
const scopeKey=value=>hash(canonical(Object.fromEntries(scopeFields.slice(0,6).map(k=>[k,value[k]]))));
const queryRows=async(c,s,p=[]) => (await c.query(s,p))[0];
function assertCertifiedFixtureCursorReader(value,repo,isolation){const ctx=certifiedReaders.get(value);if(!ctx||ctx.repo!==repo||ctx.isolation!==isolation)fail('OVERSEAS_CERTIFIED_CURSOR_UNTRUSTED');return value;}
function checkedScope(value){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!==[...scopeFields].sort().join(',')||scopeFields.some(k=>{const d=Object.getOwnPropertyDescriptor(value,k);return !d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!d.value;}))fail('OVERSEAS_CERTIFIED_CURSOR_SCOPE_INVALID');
  if(!/^[1-9]\d*$/.test(value.boardId)||value.siteUrlSha256!==hash(value.siteUrl))fail('OVERSEAS_CERTIFIED_CURSOR_SCOPE_INVALID');return Object.freeze({...value});
}
function createCertifiedFixtureCursorReader({repo,isolation}={}){
  if(typeof repo?.pool?.getConnection!=='function')fail('OVERSEAS_CERTIFIED_CURSOR_UNTRUSTED');require('./overseasScheduledIsolatedTarget').assertScheduledIsolatedTarget(isolation,repo);
  const ctx={repo,isolation,parents:new Map()};
  const reader=Object.freeze({async readInTransaction(conn,value,{lock=false}={}){
    if(this!==reader)fail('OVERSEAS_CERTIFIED_CURSOR_UNTRUSTED');
    if(typeof lock!=='boolean')fail('OVERSEAS_CERTIFIED_CURSOR_TRANSACTION_REQUIRED');const scope=checkedScope(value);await isolation.verifyConnection(conn);
    const [tx]=await queryRows(conn,'SELECT @@in_transaction AS active,@@tx_isolation AS isolation');
    if(Number(tx?.active)!==1||String(tx.isolation).replace(/_/g,'-').toUpperCase()!==(lock?'READ-COMMITTED':'REPEATABLE-READ'))fail('OVERSEAS_CERTIFIED_CURSOR_TRANSACTION_REQUIRED');
    const identity=await queryRows(conn,"SELECT s.config FROM po_sources s JOIN po_accounts a ON a.source_id=s.id JOIN po_games g ON g.id=s.game_id JOIN po_communities cm ON cm.id=s.community_id JOIN po_source_sites st ON st.source_id=s.id WHERE s.id=? AND a.id=? AND s.game_id=? AND s.community_id=? AND a.game_id=s.game_id AND a.community_id=s.community_id AND cm.game_id=s.game_id AND g.region_code='overseas' AND s.platform='bigplayer_h5' AND s.default_account_id=a.id AND s.enabled=1 AND a.enabled=1 AND g.enabled=1 AND cm.status='enabled' AND st.site_id=? AND st.url=? AND st.url_hash=? AND st.enabled=1",[scope.sourceId,scope.accountId,scope.gameId,scope.communityId,scope.siteId,scope.siteUrl,scope.siteUrlSha256]);
    if(identity.length!==1)fail('OVERSEAS_CERTIFIED_CURSOR_SCOPE_MISMATCH');
    let config;try{config=typeof identity[0].config==='string'?JSON.parse(identity[0].config):identity[0].config;}catch{fail('OVERSEAS_CERTIFIED_CURSOR_SCOPE_MISMATCH');}
    if(String(config?.boardId)!==scope.boardId||require('../services/bigplayerSiteConfig').normalizeSiteUrls(config).siteUrls.filter(s=>s.enabled&&s.siteId===scope.siteId&&s.url===scope.siteUrl).length!==1)fail('OVERSEAS_CERTIFIED_CURSOR_SCOPE_MISMATCH');
    const records=await queryRows(conn,'SELECT * FROM po_fixture_success_cursors WHERE scope_sha=?',[scopeKey(scope)]);if(!records.length)return null;
    const record=records[0],registered=ctx.parents.get(record.parent_run_id);if(!registered)fail('OVERSEAS_CERTIFIED_CURSOR_UNREGISTERED');return registered.verify(conn,{scope,record,lock});
  },productionActivationAllowed:false});certifiedReaders.set(reader,ctx);return reader;
}
function createScheduledParentStore({ repo, request, journal, proofs,cursorReader } = {}) {
  if (typeof repo?.pool?.getConnection !== 'function' || !Array.isArray(proofs)) fail('OVERSEAS_PARENT_INPUT_INVALID');
  const r = requestOf(request), a = r.batch.admissions[0];
  if (proofs.length !== r.batch.admissions.length || new Set(proofs.map(p => p?.contract?.runId)).size !== proofs.length) fail('OVERSEAS_PARENT_PROOF_SET_INVALID');
  const children = r.batch.admissions.map(admission => {
    const proof = proofs.find(p => p.contract.runId === admission.runId), ctx = scheduledFirstClaimContext(proof, repo);
    if (canonical(ctx.request) !== canonical(r) || canonical(ctx.admission) !== canonical(admission) || proof.contract.leaseEpoch !== 1) fail('OVERSEAS_PARENT_PROOF_SET_INVALID');
    const ledger = createOverseasScheduledStageCoverageLedger({ repo, journal, proof });
    return { admission, proof, ctx, ledger, audit: createOverseasBoundAudit({ repo, journal, ledger, scheduledProof: proof }) };
  }).sort((x,y) => x.admission.runId.localeCompare(y.admission.runId));
  const readerContext=cursorReader===undefined?null:(assertCertifiedFixtureCursorReader(cursorReader,repo,children[0].ctx.isolation),certifiedReaders.get(cursorReader));
  const rows = async (c,s,p=[]) => (await c.query(s,p))[0];
  const childIds=children.map(x=>x.admission.runId),childMarks=childIds.map(()=>'?').join(',');
  const cursorEntries=children.map(child=>({child,key:scopeKey(child.admission)})).sort((x,y)=>x.key.localeCompare(y.key));
  async function lockChildEvidence(c){
    const tasks=await rows(c,`SELECT * FROM po_overseas_expected_tasks WHERE run_id IN (${childMarks}) ORDER BY run_id,task_identity_sha256 FOR UPDATE`,childIds),cpIds=[...new Set(tasks.map(t=>t.checkpoint_id).filter(Boolean))].sort();
    if(cpIds.length)await rows(c,`SELECT id FROM po_sync_checkpoints WHERE id IN (${cpIds.map(()=>'?').join(',')}) ORDER BY id FOR UPDATE`,cpIds);
    await rows(c,`SELECT sequence_no FROM po_sync_run_contents WHERE run_id IN (${childMarks}) ORDER BY run_id,content_id FOR UPDATE`,childIds);
    const links=await rows(c,`SELECT DISTINCT content_id FROM po_sync_run_contents WHERE run_id IN (${childMarks}) ORDER BY content_id`,childIds),scoped=await rows(c,`SELECT run_id,content_id FROM po_sync_run_contents WHERE run_id IN (${childMarks}) ORDER BY content_id`,childIds);
    await require('./overseasAncestorEvidenceLocks').lockAncestorEvidence(c,scoped.map(link=>({contentId:link.content_id,contract:children.find(x=>x.admission.runId===link.run_id).proof.contract})));
    for(const link of links)await rows(c,'SELECT id FROM po_content_feed_memberships WHERE account_id=? AND content_id=? ORDER BY id FOR UPDATE',[a.accountId,link.content_id]);
    await rows(c,'SELECT id FROM po_collection_runs WHERE source_id=? ORDER BY id FOR UPDATE',[a.sourceId]);await rows(c,'SELECT id FROM po_audit_events WHERE source_id=? ORDER BY id FOR UPDATE',[a.sourceId]);
  }
  async function collectChildEvidence(c,found){
    const evidence=[];let success=true,discovered=0,stored=0;
    for(const child of children){const run=found.children.find(x=>x.id===child.admission.runId);if(!run||!['completed_full','completed_authorized_scope','partial','failed','awaiting_manual_verification'].includes(run.status))fail('OVERSEAS_PARENT_CHILD_NOT_TERMINAL');
      if((await child.audit.reconcileInTransaction(c,{contract:child.proof.contract,status:run.status})).status!=='accepted')fail('OVERSEAS_PARENT_CHILD_UNPROVEN');
      const progress=await child.ledger.readProgress(c,child.proof.contract,{terminal:true}),completed=run.status.startsWith('completed');success=success&&completed;
      if(completed&&(!progress.historySealed||!progress.expansionSealed||progress.coverageStatus!=='sealed'||progress.pending.length))fail('OVERSEAS_PARENT_CHILD_UNPROVEN');
      discovered+=Number(run.discovered_count);stored+=Number(run.stored_count);evidence.push({runId:run.id,siteId:child.admission.siteId,status:run.status,leaseEpoch:1,contractSha:hash(canonical(child.proof.contract)),taskSetSha:progress.taskSetSha256,completionSetSha:progress.completionSetSha256,schemaSha:progress.schemaSha256});}
    if(!Number.isSafeInteger(discovered)||discovered<0||!Number.isSafeInteger(stored)||stored<0)fail('OVERSEAS_PARENT_COUNTER_INVALID');return {evidence,success,discovered,stored,evidenceSha:hash(canonical(evidence))};
  }
  async function verifyCertifiedBatch(c,{scope,record,lock,acknowledged,ackFingerprint}){
    const matching=children.filter(x=>canonical(fullScope(x.admission))===canonical(scope));if(matching.length!==1)fail('OVERSEAS_CERTIFIED_CURSOR_SCOPE_MISMATCH');const wanted=matching[0],suffix=lock?' FOR UPDATE':'',ids=[a.parentRunId,...childIds].sort();
    const runs=await rows(c,`SELECT * FROM po_sync_runs WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id${suffix}`,ids),siblings=await rows(c,'SELECT id FROM po_sync_runs WHERE parent_run_id=? ORDER BY id LIMIT 101'+suffix,[a.parentRunId]),slot=await rows(c,'SELECT id FROM po_sync_runs WHERE source_id=? AND scheduled_at=? LIMIT 2'+suffix,[a.sourceId,db(a.scheduledAt)]);
    if(runs.length!==ids.length||siblings.length!==childIds.length||siblings.some(x=>!childIds.includes(x.id))||slot.length!==1||slot[0].id!==a.parentRunId)fail('OVERSEAS_CERTIFIED_CURSOR_PARENT_SET_CHANGED');
    const parent=runs.find(x=>x.id===a.parentRunId);
    if(!parent||parent.status!=='completed_authorized_scope'||parent.lease_epoch==null||Number(parent.lease_epoch)!==1||parent.attempts==null||Number(parent.attempts)!==1||parent.started_at===null||parent.finished_at===null||parent.lease_owner!==null||parent.lease_until!==null||parent.next_retry_at!==null||parent.error_code!==null||parent.error_message!==null||iso(parent.window_start)!==r.batch.parentWindowStart||iso(parent.window_end)!==r.batch.parentWindowEnd)fail('OVERSEAS_CERTIFIED_CURSOR_PARENT_UNPROVEN');
    for(const child of children)await child.ctx.terminalFence(c,child.proof.contract);
    if(lock){await rows(c,`SELECT * FROM po_overseas_stage_manifests WHERE run_id IN (${childMarks}) ORDER BY run_id FOR UPDATE`,childIds);await lockChildEvidence(c);}
    const scoped=await rows(c,`SELECT run_id,content_id FROM po_sync_run_contents WHERE run_id IN (${childMarks}) ORDER BY content_id`,childIds),ancestor=await require('./overseasAncestorEvidenceLocks').readAncestorEvidence(c,scoped.map(link=>({contentId:link.content_id,contract:children.find(x=>x.admission.runId===link.run_id).proof.contract})));
    const {evidence,success,discovered,stored,evidenceSha}=await collectChildEvidence(c,{children:runs.filter(x=>childIds.includes(x.id))});
    if(!success||Number(parent.discovered_count)!==discovered||Number(parent.stored_count)!==stored)fail('OVERSEAS_CERTIFIED_CURSOR_PARENT_UNPROVEN');
    const detail={format:'overseas-isolated-parent-terminal-v1',parentRunId:a.parentRunId,batchSha256:r.batchSha256,leaseEpoch:1,status:'completed_authorized_scope',evidenceSha,children:evidence,discovered,stored,successfulCursorPublished:true};
    if(canonical(detail)!==acknowledged)fail('OVERSEAS_CERTIFIED_CURSOR_ACK_EVIDENCE_CHANGED');
    const events=await rows(c,'SELECT * FROM po_audit_events WHERE id=?'+suffix,[uuid(`parent:${a.parentRunId}:1`)]),event=events[0];let saved;try{saved=typeof event?.detail==='string'?JSON.parse(event.detail):event?.detail;}catch{fail('OVERSEAS_CERTIFIED_CURSOR_EVENT_UNPROVEN');}
    if(events.length!==1||event.game_id!==a.gameId||event.source_id!==a.sourceId||event.account_id!==a.accountId||event.actor_type!=='system'||event.event_type!=='overseas_isolated_parent_terminal'||event.outcome!=='success'||canonical(saved)!==canonical(detail))fail('OVERSEAS_CERTIFIED_CURSOR_EVENT_UNPROVEN');
    const durable=[];
    for(const table of ['po_overseas_stage_manifests','po_overseas_expected_tasks','po_sync_run_contents'])durable.push(await rows(c,`SELECT * FROM ${table} WHERE run_id IN (${childMarks}) ORDER BY 1,2`,childIds));
    const tasks=durable[1],cpIds=[...new Set(tasks.map(t=>t.checkpoint_id).filter(Boolean))].sort();if(cpIds.length)durable.push(await rows(c,`SELECT * FROM po_sync_checkpoints WHERE id IN (${cpIds.map(()=>'?').join(',')}) ORDER BY id`,cpIds));
    const contentIds=[...new Set(scoped.map(x=>x.content_id))].sort();if(contentIds.length)durable.push(await rows(c,`SELECT * FROM po_content_feed_memberships WHERE account_id=? AND content_id IN (${contentIds.map(()=>'?').join(',')}) ORDER BY id`,[a.accountId,...contentIds]));
    const auditIds=children.map(child=>uuid(canonical({format:'overseas-bound-audit-v1',runId:child.admission.runId,leaseEpoch:1}))).sort(),auditEventIds=auditIds.flatMap(id=>[uuid(`binding:${id}`),uuid(`terminal:${id}`)]).sort();
    durable.push(await rows(c,`SELECT * FROM po_collection_runs WHERE id IN (${auditIds.map(()=>'?').join(',')}) ORDER BY id`,auditIds),await rows(c,`SELECT * FROM po_audit_events WHERE id IN (${auditEventIds.map(()=>'?').join(',')}) ORDER BY id`,auditEventIds));
    const fingerprint=hash(canonical({runs,durable,ancestor:ancestor.rowsSha256,event}));if(ackFingerprint&&fingerprint!==ackFingerprint)fail('OVERSEAS_CERTIFIED_CURSOR_ACK_EVIDENCE_CHANGED');
    let selected;for(const {child,key} of cursorEntries){const records=await rows(c,'SELECT * FROM po_fixture_success_cursors WHERE scope_sha=?'+suffix,[key]),row=records[0];
      if(records.length!==1||row.scope_sha!==key||row.parent_run_id!==a.parentRunId||row.batch_sha!==r.batchSha256||row.child_run_id!==child.admission.runId||row.evidence_sha!==evidenceSha||iso(row.cursor_at)!==child.admission.windowEnd)fail('OVERSEAS_CERTIFIED_CURSOR_UNPROVEN');if(child===wanted)selected=row;}
    if(!selected||canonical(selected)!==canonical(record))fail('OVERSEAS_CERTIFIED_CURSOR_CHANGED');
    return Object.freeze({cursorAt:iso(selected.cursor_at),parentRunId:selected.parent_run_id,childRunId:selected.child_run_id,batchSha256:selected.batch_sha,evidenceSha256:selected.evidence_sha,verificationSha256:fingerprint});
  }
  async function finalize() {
    const c = await repo.pool.getConnection(); let started=false,committing=false,destroyed=false;
    try {
      await children[0].ctx.isolation.verifyConnection(c);
      // Locked current evidence plus READ COMMITTED avoids a stale RR snapshot
      // hiding a writer committed between discovery and sorted lock acquisition.
      await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await c.query('SET SESSION innodb_lock_wait_timeout=3');await c.query('SET SESSION max_statement_time=10');
      await c.beginTransaction();started=true;
      const found = await children[0].ctx.parentAggregateFence(c);
      await lockChildEvidence(c);
      const {evidence,success,discovered,stored,evidenceSha}=await collectChildEvidence(c,found),status=success?'completed_authorized_scope':'partial';
      if(success){
        for(const {child,key} of cursorEntries){
          const [prior]=await rows(c,'SELECT * FROM po_fixture_success_cursors WHERE scope_sha=? FOR UPDATE',[key]);
          if(prior&&iso(prior.cursor_at)>=child.admission.windowEnd)fail('OVERSEAS_PARENT_CURSOR_NOT_ADVANCING');
          await c.query('INSERT INTO po_fixture_success_cursors VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE cursor_at=VALUES(cursor_at),parent_run_id=VALUES(parent_run_id),batch_sha=VALUES(batch_sha),child_run_id=VALUES(child_run_id),evidence_sha=VALUES(evidence_sha)',[key,db(child.admission.windowEnd),a.parentRunId,r.batchSha256,child.admission.runId,evidenceSha]);
        }
      }
      // Recheck fresh parent/state/source tuple after all awaited evidence reads.
      await children[0].ctx.parentAggregateFence(c);
      const [parent]=await c.query("UPDATE po_sync_runs SET status=?,finished_at=UTC_TIMESTAMP(3),discovered_count=?,stored_count=?,lease_owner=NULL,lease_until=NULL,next_retry_at=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running' AND lease_epoch=1 AND lease_owner=? AND lease_until>UTC_TIMESTAMP(3)",[status,discovered,stored,a.parentRunId,r.ownerId]);
      if(parent.affectedRows!==1)fail('OVERSEAS_PARENT_FENCE_LOST');
      const [state]=await c.query("UPDATE po_source_schedule_state SET lease_run_id=NULL,lease_owner=NULL,lease_until=NULL,last_status=?,last_reason_code=? WHERE source_id=? AND lease_run_id=? AND lease_owner=? AND lease_epoch=? AND lease_until>UTC_TIMESTAMP(3)",[status,success?null:'child_not_successful',a.sourceId,a.parentRunId,r.ownerId,r.expectedState.leaseEpoch+1]);
      if(state.affectedRows!==1)fail('OVERSEAS_PARENT_FENCE_LOST');
      await c.query(success?'UPDATE po_sources SET last_success_at=UTC_TIMESTAMP(3),last_error=NULL WHERE id=?':"UPDATE po_sources SET last_error='isolated_parent_partial' WHERE id=?",[a.sourceId]);
      const detail={format:'overseas-isolated-parent-terminal-v1',parentRunId:a.parentRunId,batchSha256:r.batchSha256,leaseEpoch:1,status,evidenceSha,children:evidence,discovered,stored,successfulCursorPublished:success};
      await c.query('INSERT INTO po_audit_events(id,game_id,source_id,account_id,actor_type,event_type,outcome,detail) VALUES (?,?,?,?,?,?,?,?)',[uuid(`parent:${a.parentRunId}:1`),a.gameId,a.sourceId,a.accountId,'system','overseas_isolated_parent_terminal','success',canonical(detail)]);
      const acknowledged=canonical(detail);let ackFingerprint;
      if(success&&readerContext){const entry=cursorEntries[0],record=(await rows(c,'SELECT * FROM po_fixture_success_cursors WHERE scope_sha=?',[entry.key]))[0];ackFingerprint=(await verifyCertifiedBatch(c,{scope:fullScope(entry.child.admission),record,lock:true,acknowledged})).verificationSha256;}
      committing=true;await c.commit();committing=false;started=false;
      if(success&&readerContext)readerContext.parents.set(a.parentRunId,Object.freeze({verify:(conn,input)=>verifyCertifiedBatch(conn,{...input,acknowledged,ackFingerprint})}));
      return detail;
    }catch(error){if(committing){destroyed=true;c.destroy();fail('OVERSEAS_PARENT_COMMIT_UNKNOWN');}if(started)try{await c.rollback();}catch{destroyed=true;c.destroy();}throw error;}
    finally{if(!destroyed)c.release();}
  }
  return Object.freeze({finalize,productionActivationAllowed:false});
}
module.exports={statements,createScheduledParentStore,createCertifiedFixtureCursorReader,assertCertifiedFixtureCursorReader};
