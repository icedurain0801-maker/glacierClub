'use strict';
const {assertRecoveryIntentProof}=require('../../../worker/src/overseasRecoveryIntent');
const {contractOf}=require('../../../worker/src/overseasBigPlayerRunContractJournal');
const {iso,verifyPersistedOverseasContract}=require('../../../worker/src/overseasBigPlayerNetworkContractVerifier');
const fail=code=>{throw Object.assign(Error(code),{code});};
function checked(proof){assertRecoveryIntentProof(proof);return {c:contractOf({...proof.scope,leaseOwner:proof.next.leaseOwner,leaseEpoch:proof.next.leaseEpoch}),old:proof.previous,next:proof.next};}
function sameScope(row,c){return row&&row.id===c.runId&&row.source_id===c.sourceId&&row.account_id===c.accountId&&row.site_id===c.siteId&&row.parent_run_id===null
 &&row.trigger_type==='manual'&&row.sync_mode==='incremental'&&row.scheduled_at===null&&iso(row.window_start)===c.windowStart&&iso(row.window_end)===c.windowEnd;}
function tuple(row,t){return row.status==='running'&&row.lease_owner===t.leaseOwner&&Number(row.lease_epoch)===t.leaseEpoch&&Number(row.attempts)===t.attempts
 &&row.finished_at===null&&row.next_retry_at===null&&row.started_at!==null;}
async function readRun(conn,id,lock=false){const [rows]=await conn.query(`SELECT *, (lease_until>UTC_TIMESTAMP(3)) AS live,(lease_until<UTC_TIMESTAMP(3)) AS expired FROM po_sync_runs WHERE id=?${lock?' FOR UPDATE':''}`,[id]);if(rows.length!==1)fail('OVERSEAS_RECOVERY_RUN_CONFLICT');return rows[0];}
async function transaction(repo,work,unknown){
 const conn=await repo.pool.getConnection();let started=false,committing=false,destroyed=false;
 try{await conn.beginTransaction();started=true;const result=await work(conn);
  if(result===null){await conn.rollback();started=false;return null;}
  committing=true;await conn.commit();committing=false;started=false;return result;
 }catch(error){if(committing){destroyed=true;conn.destroy();fail(unknown);}if(started)try{await conn.rollback();}catch{destroyed=true;conn.destroy();}throw error;
 }finally{if(!destroyed)conn.release();}
}
async function claimRecoveryRun(repo,{proof,runId,leaseSeconds=300}={}){
 const {c,old,next}=checked(proof);if(runId!==c.runId||!Number.isInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>3600)fail('OVERSEAS_RECOVERY_INPUT_INVALID');
 return transaction(repo,async conn=>{
  const before=await readRun(conn,runId,true);if(!sameScope(before,c)||!tuple(before,old)||Number(before.expired)!==1)return null;
  const [result]=await conn.query("UPDATE po_sync_runs SET lease_owner=?,lease_epoch=lease_epoch+1,attempts=attempts+1,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND),updated_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running' AND lease_owner=? AND lease_epoch=? AND attempts=? AND lease_until<UTC_TIMESTAMP(3) AND finished_at IS NULL AND next_retry_at IS NULL",
   [next.leaseOwner,leaseSeconds,runId,old.leaseOwner,old.leaseEpoch,old.attempts]);if(result.affectedRows!==1)return null;
  const row=await readRun(conn,runId,true);if(!sameScope(row,c)||!tuple(row,next)||Number(row.live)!==1)fail('OVERSEAS_RECOVERY_CLAIM_CONFLICT');
  await verifyPersistedOverseasContract({query:async(sql,params)=>(await conn.query(sql+' FOR UPDATE',params))[0]},c);return row;
 },'OVERSEAS_RECOVERY_CLAIM_COMMIT_UNKNOWN');
}
async function reconcileRecoveryClaim(repo,{proof}={}){
 const {c,old,next}=checked(proof),conn=await repo.pool.getConnection();let started=false,destroyed=false;
 try{await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await conn.query('START TRANSACTION READ ONLY');started=true;
  const row=await readRun(conn,c.runId);let status='unknown';if(sameScope(row,c)){if(tuple(row,next))status='accepted';else if(tuple(row,old))status='not_committed';}
  await conn.rollback();started=false;return {status,live:status==='accepted'&&Number(row.live)===1,expired:status==='accepted'&&Number(row.expired)===1,automaticWriteAllowed:false};
 }finally{if(started)try{await conn.rollback();}catch{destroyed=true;conn.destroy();}if(!destroyed)conn.release();}
}
async function finishRecoveryRun(repo,{proof,runId,leaseOwner,leaseEpoch,status,errorCode=null,errorMessage=null}={}){
 const {c,next}=checked(proof);if(runId!==c.runId||leaseOwner!==next.leaseOwner||leaseEpoch!==next.leaseEpoch
  ||!['completed_full','completed_authorized_scope','partial','failed'].includes(status)||(status.startsWith('completed')&&(errorCode||errorMessage)))fail('OVERSEAS_RECOVERY_TERMINAL_INVALID');
 return transaction(repo,async conn=>{
  const row=await readRun(conn,runId,true);if(!sameScope(row,c)||!tuple(row,next)||Number(row.live)!==1)return null;
  // Recovery totals derive from durable unique associations, including comments.
  // Never add a client's uncertain ACK delta or overwrite with this epoch alone.
  const [links]=await conn.query('SELECT rc.change_type,rc.sync_scope,c.id,c.source_id,c.account_id,c.game_id,c.community_id FROM po_sync_run_contents rc JOIN po_contents c ON c.id=rc.content_id WHERE rc.run_id=? FOR UPDATE',[runId]);
  if(links.some(link=>link.source_id!==c.sourceId||link.account_id!==c.accountId||link.game_id!==c.gameId||link.community_id!==c.communityId
   ||!['posts','comments'].includes(link.sync_scope)||!['inserted','changed','unchanged'].includes(link.change_type)))fail('OVERSEAS_RECOVERY_COUNTER_CONFLICT');
  const discovered=links.length,stored=links.filter(link=>link.change_type!=='unchanged').length;
  const [result]=await conn.query("UPDATE po_sync_runs SET status=?,finished_at=UTC_TIMESTAMP(3),discovered_count=?,stored_count=?,error_code=?,error_message=?,next_retry_at=NULL,lease_owner=NULL,lease_until=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running' AND lease_owner=? AND lease_epoch=? AND lease_until>UTC_TIMESTAMP(3)",[status,discovered,stored,errorCode,errorMessage,runId,leaseOwner,leaseEpoch]);
  return result.affectedRows===1?readRun(conn,runId):null;
 },'OVERSEAS_RECOVERY_TERMINAL_COMMIT_UNKNOWN');
}
async function releaseRecoveryCheckpoint(repo,{proof,checkpointId,leaseOwner,leaseEpoch,status='idle',errorCode=null,errorMessage=null}={}){
 const {c,next}=checked(proof);if(leaseOwner!==next.leaseOwner||leaseEpoch!==next.leaseEpoch
  ||!['idle','failed','unsupported','awaiting_manual_verification'].includes(status))fail('OVERSEAS_RECOVERY_CHECKPOINT_INVALID');
 return transaction(repo,async conn=>{
  const row=await readRun(conn,c.runId,true);if(!sameScope(row,c)||!tuple(row,next)||Number(row.live)!==1)return null;
  const [rows]=await conn.query('SELECT * FROM po_sync_checkpoints WHERE id=? FOR UPDATE',[checkpointId]);const cp=rows[0];
  if(rows.length!==1||cp.account_id!==c.accountId||cp.site_id!==c.siteId||iso(cp.window_start)!==c.windowStart||iso(cp.window_end)!==c.windowEnd
   ||typeof cp.task_key!=='string'||!cp.task_key.startsWith(`board:${c.boardId}:`))fail('OVERSEAS_RECOVERY_CHECKPOINT_CONFLICT');
  if(cp.status!=='running'||cp.lease_owner!==leaseOwner)return null;
  // Preserve server cursor/item counts even when the client lost commit ACK.
  const [result]=await conn.query("UPDATE po_sync_checkpoints SET status=?,error_code=?,error_message=?,lease_owner=NULL,lease_until=NULL WHERE id=? AND status='running' AND lease_owner=? AND lease_until>UTC_TIMESTAMP(3)",[status,errorCode,errorMessage,checkpointId,leaseOwner]);
  return result.affectedRows===1?(await conn.query('SELECT * FROM po_sync_checkpoints WHERE id=?',[checkpointId]))[0][0]:null;
 },'OVERSEAS_RECOVERY_CHECKPOINT_COMMIT_UNKNOWN');
}
async function reconcileRecoveryTerminal(repo,{proof,status,errorCode=null,errorMessage=null}={}){
 const {c,next}=checked(proof);if(!['completed_full','completed_authorized_scope','partial','failed'].includes(status))fail('OVERSEAS_RECOVERY_TERMINAL_INVALID');
 const conn=await repo.pool.getConnection();let started=false,destroyed=false;
 try{
  await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await conn.query('START TRANSACTION READ ONLY');started=true;
  const row=await readRun(conn,c.runId);let disposition='unknown';
  if(sameScope(row,c)&&Number(row.lease_epoch)===next.leaseEpoch&&Number(row.attempts)===next.attempts){
   if(tuple(row,next))disposition='not_committed';
   else if(row.status===status&&row.lease_owner===null&&row.lease_until===null&&row.next_retry_at===null
    &&row.finished_at!==null&&row.error_code===errorCode&&row.error_message===errorMessage){
    const [links]=await conn.query('SELECT change_type FROM po_sync_run_contents WHERE run_id=?',[c.runId]);
    if(links.every(link=>['inserted','changed','unchanged'].includes(link.change_type))&&Number(row.discovered_count)===links.length
     &&Number(row.stored_count)===links.filter(link=>link.change_type!=='unchanged').length)disposition='accepted';
   }
  }
  await conn.rollback();started=false;return {status:disposition,automaticWriteAllowed:false};
 }finally{if(started)try{await conn.rollback();}catch{destroyed=true;conn.destroy();}if(!destroyed)conn.release();}
}
module.exports={claimRecoveryRun,reconcileRecoveryClaim,finishRecoveryRun,releaseRecoveryCheckpoint,reconcileRecoveryTerminal};
