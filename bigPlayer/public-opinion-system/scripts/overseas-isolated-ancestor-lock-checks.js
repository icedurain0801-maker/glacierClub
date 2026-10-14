'use strict';
const crypto=require('node:crypto');
const {lockAncestorEvidence}=require('../server/src/db/overseasAncestorEvidenceLocks');
const {createScheduledIsolatedTarget}=require('../server/src/db/overseasScheduledIsolatedTarget');
const assert=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
async function checkAncestorLocks({repo,control,root,directory,serverPid,sourceId,accountId,gameId,communityId}){
  const target=createScheduledIsolatedTarget({repo,repositoryRoot:root,directory,serverPid});
  const ids=Array.from({length:3},()=>crypto.randomUUID()),contract={sourceId,accountId,gameId,communityId,boardId:'100017',siteId:'fixture-lock',siteUrl:'https://club-en.q1.com/',siteUrlSha256:'a'.repeat(64)};
  for(const [depth,id] of ids.entries())await control.query('INSERT INTO po_contents(id,source_id,account_id,game_id,community_id,external_id,content_type,content_depth,root_content_id,parent_content_id,fingerprint,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[id,sourceId,accountId,gameId,communityId,`lock-${depth}`,depth?'comment':'post',depth,depth?ids[0]:null,depth?ids[depth-1]:null,crypto.createHash('sha256').update(id).digest('hex'),JSON.stringify({_overseasScope:contract})]);
  const entries=[{contentId:ids[2],contract}],conn=await repo.pool.getConnection();
  const evidence={ancestorIds:ids,checks:[],writerResults:[]};
  try{
    await target.verifyConnection(conn);await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await conn.beginTransaction();
    // Establish a stale snapshot before a distinct writer commits deletion.
    await conn.query('SELECT id,is_deleted FROM po_contents WHERE id=?',[ids[0]]);
    await control.query('UPDATE po_contents SET is_deleted=1 WHERE id=?',[ids[0]]);
    try{await lockAncestorEvidence(conn,entries);assert(false,'ANCESTOR_STALE_SNAPSHOT_ACCEPTED');}catch(e){assert(e.code==='OVERSEAS_ANCESTOR_EVIDENCE_CONFLICT','ANCESTOR_CURRENT_WRONG_ERROR');}
    await conn.rollback();await control.query('UPDATE po_contents SET is_deleted=0 WHERE id=?',[ids[0]]);evidence.checks.push('stale_rr_snapshot_current_lock_rejects_committed_deleted_root');
    await conn.beginTransaction();const locked=await lockAncestorEvidence(conn,entries);
    assert(locked.lockedIds.length===3&&JSON.stringify(locked.lockedIds)===JSON.stringify([...ids].sort()),'ANCESTOR_SORTED_CLOSURE');
    const writer=await repo.pool.getConnection();
    try{
      await target.verifyConnection(writer);await writer.query('SET SESSION innodb_lock_wait_timeout=1');
      const [[readerId]]=await conn.query('SELECT CONNECTION_ID() AS id');const [[writerId]]=await writer.query('SELECT CONNECTION_ID() AS id');
      assert(readerId.id!==writerId.id,'ANCESTOR_WRITER_NOT_DISTINCT');
      try{await writer.query('UPDATE po_contents SET is_deleted=1 WHERE id=?',[ids[1]]);assert(false,'ANCESTOR_LOCK_WRITER_SUCCEEDED');}catch(e){assert(e.code==='ER_LOCK_WAIT_TIMEOUT','ANCESTOR_LOCK_WRITER_WRONG_ERROR');evidence.writerResults.push({readerId:readerId.id,writerId:writerId.id,ancestorId:ids[1],barrier:'all_sorted_current_locks_held',errorCode:e.code});}
      await conn.rollback();
      const [changed]=await writer.query('UPDATE po_contents SET is_deleted=1 WHERE id=?',[ids[1]]);assert(changed.affectedRows===1,'ANCESTOR_RELEASED_WRITER_FAILED');
      await writer.query('UPDATE po_contents SET is_deleted=0 WHERE id=?',[ids[1]]);
    }finally{writer.release();}
    evidence.checks.push('historical_intermediate_lock_blocks_distinct_writer_then_release_allows');
    // READ COMMITTED does not gap-lock a missing membership. Its content FK
    // must wait on the held content X lock; verify actual insertion separately.
    await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await conn.beginTransaction();
    await lockAncestorEvidence(conn,entries);
    const memberWriter=await repo.pool.getConnection(),memberId=crypto.randomUUID();
    try{
      await target.verifyConnection(memberWriter);await memberWriter.query('SET SESSION innodb_lock_wait_timeout=1');
      const sql='INSERT INTO po_content_feed_memberships(id,account_id,content_id,feed_key) VALUES (?,?,?,?)',params=[memberId,accountId,ids[0],'fixture-dynamic'];
      try{await memberWriter.query(sql,params);assert(false,'MEMBERSHIP_INSERT_BYPASSED_LOCK');}catch(e){assert(e.code==='ER_LOCK_WAIT_TIMEOUT','MEMBERSHIP_INSERT_WRONG_ERROR');evidence.writerResults.push({barrier:'content_fk_parent_x_lock_held',contentId:ids[0],errorCode:e.code});}
      const [[before]]=await control.query('SELECT COUNT(*) AS n FROM po_content_feed_memberships WHERE id=?',[memberId]);assert(Number(before.n)===0,'MEMBERSHIP_TIMEOUT_PARTIAL_INSERT');
      await conn.rollback();await memberWriter.query(sql,params);
      const [[after]]=await control.query('SELECT COUNT(*) AS n FROM po_content_feed_memberships WHERE id=?',[memberId]);assert(Number(after.n)===1,'MEMBERSHIP_RELEASED_INSERT_FAILED');
    }finally{memberWriter.release();}
    evidence.checks.push('membership_distinct_insert_fk_lock_timeout_zero_insert_then_release_success');
    // Discovery/current references changed between phases must not acquire a
    // new unsorted closure. The proxy is an observation barrier, not fake SQL.
    await conn.beginTransaction();let count=0,changed=false;
    const observed=new Proxy(conn,{get(t,k){if(k==='query')return async(sql,p)=>{if(sql==='SELECT * FROM po_contents WHERE id=? FOR UPDATE'&&!changed){changed=true;await control.query('UPDATE po_contents SET parent_content_id=? WHERE id=?',[ids[0],ids[2]]);}const result=await t.query(sql,p);if(sql==='SELECT * FROM po_contents WHERE id=?')count++;return result;};const v=t[k];return typeof v==='function'?v.bind(t):v;}});
    try{await lockAncestorEvidence(observed,entries);assert(false,'ANCESTOR_REFERENCE_DRIFT_ALLOWED');}catch(e){assert(e.code==='OVERSEAS_ANCESTOR_EVIDENCE_CONFLICT','ANCESTOR_REFERENCE_WRONG_ERROR');}
    await conn.rollback();await control.query('UPDATE po_contents SET parent_content_id=? WHERE id=?',[ids[1],ids[2]]);
    assert(count===3&&changed,'ANCESTOR_DISCOVERY_BARRIER_NOT_HIT');evidence.checks.push('discovery_to_current_reference_drift_rejected_without_adaptive_locks');
    for(const column of ['content_depth','is_deleted']){
      await control.query(`UPDATE po_contents SET ${column}=NULL WHERE id=?`,[ids[0]]);
      await conn.beginTransaction();
      try{await lockAncestorEvidence(conn,entries);assert(false,'ANCESTOR_NULL_ACCEPTED');}catch(e){assert(e.code==='OVERSEAS_ANCESTOR_EVIDENCE_CONFLICT','ANCESTOR_NULL_WRONG_ERROR');}
      await conn.rollback();await control.query(`UPDATE po_contents SET ${column}=0 WHERE id=?`,[ids[0]]);
      evidence.checks.push(`null_${column}_rejected`);
    }
    const [[links]]=await control.query('SELECT COUNT(*) AS n FROM po_sync_run_contents');assert(Number(links.n)===0,'ANCESTOR_FIXTURE_NOT_HISTORICAL_UNLINKED');
    return {status:'PASS_ISOLATED_ANCESTOR_LOCK_PRIMITIVE',...evidence,ancestryDepth:2,historicalAncestorsNotRunLinked:true,actualSqlLocks:true,parentFinalizeChainExecuted:false,membershipConcurrencyVerified:true,membershipConcurrencyScope:'primitive_fk_insert_not_parent_finalize_barrier',realHttpExecuted:false,aiExecuted:false,recoveryExecuted:false,productionActivationAllowed:false};
  }finally{await conn.rollback().catch(()=>{});conn.release();}
}
module.exports={checkAncestorLocks};
