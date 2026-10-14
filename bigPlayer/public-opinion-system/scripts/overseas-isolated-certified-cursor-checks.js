'use strict';
const {canonical}=require('../worker/src/overseasBigPlayerRunContractJournal');
const {createCertifiedFixtureCursorReader,assertCertifiedFixtureCursorReader}=require('../server/src/db/overseasScheduledParentStore');
const assert=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
async function checkCertifiedCursor({repo,control,target,cursorReader,request,result}){
  const checks=[],ad=request.batch.admissions[0],fields=['sourceId','accountId','gameId','communityId','siteId','boardId','siteUrl','siteUrlSha256'],scope=Object.fromEntries(fields.map(k=>[k,ad[k]]));
  const tables=['po_sync_runs','po_source_schedule_state','po_sources','po_fixture_success_cursors','po_overseas_stage_manifests','po_overseas_expected_tasks','po_sync_checkpoints','po_sync_run_contents','po_contents','po_content_feed_memberships','po_collection_runs','po_audit_events'];
  const snapshot=async()=>canonical(await Promise.all(tables.map(t=>repo.query(`SELECT * FROM ${t} ORDER BY 1,2`))));
  const read=async(value=scope,reader=cursorReader,lock=false)=>{const c=await repo.pool.getConnection();try{await target.verifyConnection(c);await c.query(lock?'SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED':'SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');await c.query(lock?'START TRANSACTION':'START TRANSACTION READ ONLY');return await reader.readInTransaction(c,value,{lock});}finally{await c.rollback();await c.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');c.release();}};
  const expected=await read();assert(expected.cursorAt===ad.windowEnd&&expected.parentRunId===ad.parentRunId,'CERTIFIED_CURSOR_VALUE');assert(canonical(await read(scope,cursorReader,true))===canonical(expected),'CERTIFIED_CURRENT_DIFFERS');
  checks.push('successful_ack_registered_original_parent_rr_and_rc_complete_evidence');
  for(const other of [{...cursorReader},null]){try{assertCertifiedFixtureCursorReader(other,repo,target);assert(false,'CERTIFIED_COPY_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_CERTIFIED_CURSOR_UNTRUSTED','CERTIFIED_COPY_ERROR');}}
  try{await read(scope,{...cursorReader});assert(false,'CERTIFIED_COPIED_METHOD_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_CERTIFIED_CURSOR_UNTRUSTED','CERTIFIED_COPIED_METHOD_ERROR');}
  for(const [r,t] of [[{},target],[repo,{}]]){try{assertCertifiedFixtureCursorReader(cursorReader,r,t);assert(false,'CERTIFIED_CROSS_BRAND_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_CERTIFIED_CURSOR_UNTRUSTED','CERTIFIED_CROSS_BRAND_ERROR');}}
  const restarted=createCertifiedFixtureCursorReader({repo,isolation:target});
  try{await read(scope,restarted);assert(false,'CERTIFIED_RESTART_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_CERTIFIED_CURSOR_UNREGISTERED','CERTIFIED_RESTART_ERROR');}checks.push('copied_cross_repo_cross_target_and_empty_registry_existing_cursor_rejected');
  for(const field of fields){const changed={...scope,[field]:field==='boardId'?'999':field==='siteUrl'?'https://invalid.example/':field==='siteUrlSha256'?'f'.repeat(64):`drift-${scope[field]}`};
    const baseline=await snapshot();try{await read(changed);assert(false,'CERTIFIED_SCOPE_DRIFT_ALLOWED');}catch(e){assert(['OVERSEAS_CERTIFIED_CURSOR_SCOPE_INVALID','OVERSEAS_CERTIFIED_CURSOR_SCOPE_MISMATCH'].includes(e.code),'CERTIFIED_SCOPE_DRIFT_ERROR');}assert(await snapshot()===baseline,'CERTIFIED_SCOPE_DRIFT_WROTE');checks.push(`scope_${field}_drift_zero_write`);
  }
  async function negative(sql,params,restore,restoreParams,label){await control.query(sql,params);const baseline=await snapshot();
    for(const lock of [false,true]){try{await read(scope,cursorReader,lock);assert(false,'CERTIFIED_EVIDENCE_DRIFT_ALLOWED');}catch(e){assert(e.code&&e.code!=='CERTIFIED_EVIDENCE_DRIFT_ALLOWED','CERTIFIED_EVIDENCE_DRIFT_ERROR');}assert(await snapshot()===baseline,'CERTIFIED_EVIDENCE_DRIFT_WROTE');}
    await control.query(restore,restoreParams);assert(canonical(await read())===canonical(expected),'CERTIFIED_RESTORED_EVIDENCE_CHANGED');checks.push(label);
  }
  const [cursor]=await repo.query('SELECT * FROM po_fixture_success_cursors WHERE child_run_id=?',[ad.runId]);
  for(const column of ['parent_run_id','child_run_id','batch_sha','evidence_sha','cursor_at']){
    const changed=column.endsWith('_sha')?'f'.repeat(64):column==='cursor_at'?'2026-01-01 00:00:00.000':'00000000-0000-0000-0000-000000009999';
    await negative(`UPDATE po_fixture_success_cursors SET ${column}=? WHERE scope_sha=?`,[changed,cursor.scope_sha],`UPDATE po_fixture_success_cursors SET ${column}=? WHERE scope_sha=?`,[cursor[column],cursor.scope_sha],`cursor_${column}_drift_rr_rc_zero_write`);
  }
  const [parent]=await repo.query('SELECT * FROM po_sync_runs WHERE id=?',[ad.parentRunId]);
  for(const [column,value] of [['status','partial'],['lease_epoch',2],['discovered_count',7],['finished_at','2026-01-01 00:00:00.000']])await negative(`UPDATE po_sync_runs SET ${column}=? WHERE id=?`,[value,parent.id],`UPDATE po_sync_runs SET ${column}=? WHERE id=?`,[parent[column],parent.id],`parent_${column}_drift_rr_rc_zero_write`);
  const [child]=await repo.query('SELECT * FROM po_sync_runs WHERE id=?',[ad.runId]);
  await negative('UPDATE po_sync_runs SET parent_run_id=NULL WHERE id=?',[child.id],'UPDATE po_sync_runs SET parent_run_id=? WHERE id=?',[ad.parentRunId,child.id],'missing_child_membership_rr_rc_zero_write');
  await negative('UPDATE po_sync_runs SET stored_count=stored_count+1 WHERE id=?',[child.id],'UPDATE po_sync_runs SET stored_count=? WHERE id=?',[child.stored_count,child.id],'child_counter_drift_rr_rc_zero_write');
  const [event]=await repo.query("SELECT * FROM po_audit_events WHERE event_type='overseas_isolated_parent_terminal'");
  const saved=JSON.parse(event.detail);await negative('UPDATE po_audit_events SET detail=? WHERE id=?',[canonical({...saved,evidenceSha:'f'.repeat(64)}),event.id],'UPDATE po_audit_events SET detail=? WHERE id=?',[event.detail,event.id],'parent_event_evidence_drift_rr_rc_zero_write');
  const [terminal]=await repo.query("SELECT * FROM po_audit_events WHERE event_type='overseas_bound_terminal' ORDER BY id LIMIT 1");
  const detail=JSON.parse(terminal.detail);for(const field of ['linksSha256','taskSetSha256','completionSetSha256','schemaSha256','contractSha256'])await negative('UPDATE po_audit_events SET detail=? WHERE id=?',[canonical({...detail,[field]:'f'.repeat(64)}),terminal.id],'UPDATE po_audit_events SET detail=? WHERE id=?',[terminal.detail,terminal.id],`child_terminal_${field}_drift_rr_rc_zero_write`);
  const [cp]=await repo.query('SELECT * FROM po_sync_checkpoints ORDER BY id LIMIT 1');await negative('UPDATE po_sync_checkpoints SET items_fetched=items_fetched+1 WHERE id=?',[cp.id],'UPDATE po_sync_checkpoints SET items_fetched=? WHERE id=?',[cp.items_fetched,cp.id],'checkpoint_counter_drift_rr_rc_zero_write');
  const [manifest]=await repo.query('SELECT * FROM po_overseas_stage_manifests WHERE run_id=?',[ad.runId]);await negative('UPDATE po_overseas_stage_manifests SET updated_epoch=2 WHERE run_id=?',[ad.runId],'UPDATE po_overseas_stage_manifests SET updated_epoch=? WHERE run_id=?',[manifest.updated_epoch,ad.runId],'manifest_epoch_drift_rr_rc_zero_write');
  const [task]=await repo.query('SELECT * FROM po_overseas_expected_tasks WHERE run_id=? ORDER BY task_identity_sha256 LIMIT 1',[ad.runId]);await negative('UPDATE po_overseas_expected_tasks SET descriptor_sha256=? WHERE run_id=? AND task_identity_sha256=?',['f'.repeat(64),ad.runId,task.task_identity_sha256],'UPDATE po_overseas_expected_tasks SET descriptor_sha256=? WHERE run_id=? AND task_identity_sha256=?',[task.descriptor_sha256,ad.runId,task.task_identity_sha256],'task_descriptor_hash_drift_rr_rc_zero_write');
  // Separate synthetic audit data for the same source must not enter this seal.
  const unrelatedId=require('node:crypto').randomUUID();await control.query("INSERT INTO po_collection_runs(id,source_id,status) VALUES (?,?,'running')",[unrelatedId,ad.sourceId]);
  assert(canonical(await read())===canonical(expected),'CERTIFIED_UNRELATED_AUDIT_POISONED');await control.query('DELETE FROM po_collection_runs WHERE id=?',[unrelatedId]);checks.push('unrelated_same_source_synthetic_audit_not_ack_evidence_not_next_batch_proof');
  // An unrelated synthetic completed checkpoint must not become a cursor.
  const cpId=require('node:crypto').randomUUID();await control.query("INSERT INTO po_sync_checkpoints(id,account_id,site_id,task_kind,task_key,sync_scope,root_platform_content_id,status,last_item_at) VALUES (?,?,?,'posts',?,'posts','','completed','2099-01-01 00:00:00.000')",[cpId,ad.accountId,ad.siteId,`board:${ad.boardId}:fixture-fake`]);
  assert(canonical(await read())===canonical(expected),'CERTIFIED_FAKE_CP_USED');await control.query('DELETE FROM po_sync_checkpoints WHERE id=?',[cpId]);checks.push('unrelated_future_completed_checkpoint_not_cursor');
  return {status:'PASS_ISOLATED_CERTIFIED_CURSOR_READ_BINDING',checks,result,certifiedEvidence:expected,initialCertifiedAnchorAdmissionVerified:true,successAckRegistrationVerified:true,completeEvidenceReadVerified:true,anchorUnknownCursorDriftZeroWriteVerified:true,realNextSlotExecuted:false,ackUnknownRegistrationVerified:false,partialRegistrationVerified:false,realHttpExecuted:false,aiExecuted:false,recoveryExecuted:false,productionActivationAllowed:false};
}
module.exports={checkCertifiedCursor};
