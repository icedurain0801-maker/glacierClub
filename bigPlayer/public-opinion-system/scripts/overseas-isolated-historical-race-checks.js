'use strict';
const crypto=require('node:crypto');
const {canonical}=require('../worker/src/overseasBigPlayerRunContractJournal');
const assert=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function checkHistoricalRace({repo,control,target,parent,claims,historical}){
 const childIds=claims.map(x=>x.contract.runId).sort(),ancestors=[...historical.values()].flatMap(h=>[h.rootId,h.commentId]);
 await target.verifyConnection(control);
 const links=await repo.query(`SELECT run_id,content_id FROM po_sync_run_contents WHERE run_id IN (${childIds.map(()=>'?').join(',')}) ORDER BY content_id`,childIds);
 assert(links.length===2&&links.every(x=>!ancestors.includes(x.content_id)),'HISTORICAL_RACE_CURRENT_LINKS_INVALID');
 const closure=[...new Set([...ancestors,...links.map(x=>x.content_id)])].sort(),ancestorId=[...historical.values()][0].commentId;
 assert(closure.length===6,'HISTORICAL_RACE_CLOSURE_INVALID');
 const tables=['po_sync_runs','po_source_schedule_state','po_sources','po_fixture_success_cursors','po_audit_events'];
 const snapshot=async()=>{await target.verifyConnection(control);const rows=[];for(const t of tables)rows.push((await control.query(`SELECT * FROM ${t} ORDER BY 1`))[0]);return canonical(rows);};
 const deleted=async conn=>{await target.verifyConnection(conn);const [[r]]=await conn.query('SELECT is_deleted FROM po_contents WHERE id=?',[ancestorId]);assert(r&&r.is_deleted!==null,'HISTORICAL_RACE_ANCESTOR_MISSING');return Number(r.is_deleted);};
 const restore=async()=>{await target.verifyConnection(control);await control.query('UPDATE po_contents SET is_deleted=0 WHERE id=?',[ancestorId]);assert(await deleted(control)===0,'HISTORICAL_RACE_RESTORE_FAILED');};
 const baseline=await snapshot(),evidence=[],get=repo.pool.getConnection.bind(repo.pool),writer=await get();
 let writerTransaction=false,destroyed=false;
 try{
  await target.verifyConnection(writer);await writer.query('SET SESSION innodb_lock_wait_timeout=1');
  const [[writerConnection]]=await writer.query('SELECT CONNECTION_ID() AS id');
  assert(await deleted(writer)===0,'HISTORICAL_RACE_INITIAL_DELETED');
  const commitDeletion=async()=>{await target.verifyConnection(writer);await writer.beginTransaction();writerTransaction=true;const [r]=await writer.query('UPDATE po_contents SET is_deleted=1 WHERE id=?',[ancestorId]);assert(r.affectedRows===1,'HISTORICAL_RACE_UPDATE_FAILED');await writer.commit();writerTransaction=false;assert(await deleted(control)===1,'HISTORICAL_RACE_COMMIT_NOT_DURABLE');};
  // Proxies observe actual SQL and coordinate a distinct real writer only.
  for(const phase of ['before_sorted_locks','all_sorted_locks']){
   const discovered=[],locked=[];let hit=false;
   repo.pool.getConnection=async()=>{const c=await get();try{await target.verifyConnection(c);}catch(e){c.destroy();throw e;}return new Proxy(c,{get(t,k){
    if(k==='query')return async(sql,p)=>{
     const barrier=phase==='before_sorted_locks'?sql==='SELECT * FROM po_contents WHERE id=? FOR UPDATE':sql==='SELECT id FROM po_content_feed_memberships WHERE account_id=? AND content_id=? ORDER BY id FOR UPDATE';
     if(barrier&&!hit){
      hit=true;assert(canonical([...discovered].sort())===canonical(closure),'HISTORICAL_RACE_DISCOVERY_INCOMPLETE');
      if(phase==='all_sorted_locks')assert(canonical(locked)===canonical(closure),'HISTORICAL_RACE_SORTED_LOCKS_INCOMPLETE');
      const [[id]]=await t.query('SELECT CONNECTION_ID() AS id');assert(id.id!==writerConnection.id,'HISTORICAL_RACE_WRITER_NOT_DISTINCT');
      const record={barrier:`actual_parent_finalize_${phase}`,parentConnectionId:id.id,writerConnectionId:writerConnection.id,ancestorId,discoveryIds:[...discovered].sort(),lockedIds:[...locked],parentBeforeSha256:hash(baseline)};
      if(phase==='before_sorted_locks'){
       await commitDeletion();Object.assign(record,{writerCommitAcknowledged:true,durableIsDeleted:1,businessError:'OVERSEAS_ANCESTOR_EVIDENCE_CONFLICT'});evidence.push(record);
      }else{
       await target.verifyConnection(writer);await writer.beginTransaction();writerTransaction=true;
       try{await writer.query('UPDATE po_contents SET is_deleted=1 WHERE id=?',[ancestorId]);assert(false,'HISTORICAL_RACE_LOCKED_UPDATE_SUCCEEDED');}catch(e){assert(e.code==='ER_LOCK_WAIT_TIMEOUT','HISTORICAL_RACE_LOCKED_WRONG_ERROR');record.writerError=e.code;}
       record.writerIsDeletedAfterTimeout=await deleted(writer);assert(record.writerIsDeletedAfterTimeout===0,'HISTORICAL_RACE_TIMEOUT_RESIDUE');
       await writer.rollback();writerTransaction=false;record.controlIsDeletedAfterRollback=await deleted(control);assert(record.controlIsDeletedAfterRollback===0,'HISTORICAL_RACE_TIMEOUT_DURABLE_RESIDUE');
       record.parentRollbackCause='fixture_sentinel';evidence.push(record);
       throw Object.assign(Error('HISTORICAL_ANCESTOR_BARRIER_RELEASE'),{code:'HISTORICAL_ANCESTOR_BARRIER_RELEASE'});
      }
     }
     const result=await t.query(sql,p);
     if(sql==='SELECT * FROM po_contents WHERE id=?')discovered.push(p[0]);
     if(sql==='SELECT * FROM po_contents WHERE id=? FOR UPDATE')locked.push(p[0]);
     return result;
    };const v=t[k];return typeof v==='function'?v.bind(t):v;
   }});};
   try{try{await parent.finalize();assert(false,'HISTORICAL_RACE_FINALIZE_ACCEPTED');}catch(e){assert(e.code===(phase==='before_sorted_locks'?'OVERSEAS_ANCESTOR_EVIDENCE_CONFLICT':'HISTORICAL_ANCESTOR_BARRIER_RELEASE'),'HISTORICAL_RACE_WRONG_REJECTION');}}finally{repo.pool.getConnection=get;}
   const after=await snapshot();assert(hit&&after===baseline,'HISTORICAL_RACE_PARENT_WRITES');evidence[evidence.length-1].parentAfterSha256=hash(after);
   await restore();assert(await snapshot()===baseline,'HISTORICAL_RACE_BASELINE_NOT_RESTORED');
  }
  await commitDeletion();const released=await snapshot();
  try{await parent.finalize();assert(false,'HISTORICAL_RACE_RELEASED_DRIFT_ACCEPTED');}catch(e){assert(e.code==='OVERSEAS_ANCESTOR_EVIDENCE_CONFLICT','HISTORICAL_RACE_RELEASED_WRONG_ERROR');}
  const after=await snapshot();assert(after===released,'HISTORICAL_RACE_RELEASED_PARENT_WRITES');
  evidence.push({barrier:'after_actual_parent_rollback_release',writerConnectionId:writerConnection.id,ancestorId,writerCommitAcknowledged:true,durableIsDeleted:await deleted(control),businessError:'OVERSEAS_ANCESTOR_EVIDENCE_CONFLICT',parentBeforeSha256:hash(released),parentAfterSha256:hash(after)});
  await restore();assert(await snapshot()===baseline,'HISTORICAL_RACE_FINAL_RESTORE_FAILED');
  return{status:'PASS_ISOLATED_HISTORICAL_PARENT_ANCESTOR_RACE',evidence,writerBeforeSortedLocksBusinessRejectionVerified:true,historicalAncestorUpdateBlockedDuringParentFinalize:true,writerAfterParentRollbackUpdateSucceeded:true,lockedBarrierParentRollbackCause:'fixture_sentinel',releasedWriterDriftBusinessRejectionVerified:true,historicalAncestorRaceScope:'actual_parent_finalize_depth1_historical_ancestor_update',normalParentFinalizeVerified:false,realHttpExecuted:false,aiExecuted:false,recoveryExecuted:false,productionActivationAllowed:false};
 }finally{repo.pool.getConnection=get;if(writerTransaction)try{await writer.rollback();}catch{destroyed=true;writer.destroy();}if(!destroyed)writer.release();}
}
module.exports={checkHistoricalRace};
