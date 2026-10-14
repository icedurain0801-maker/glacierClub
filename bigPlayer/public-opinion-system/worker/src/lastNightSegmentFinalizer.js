'use strict';
const {SOURCE_ID}=require('./lastNightScope');
const fail=code=>{throw Object.assign(new Error(code),{code});};
async function finishSegment({query:q,bounded,token,runId,runEpoch,completed,persistEvidence,commitState}){
 if(typeof completed!=='boolean'||!commitState||commitState.pending||!runId||!Number.isSafeInteger(runEpoch))fail('LAST_NIGHT_SEGMENT_INVALID');
 let committing=false,ack=false;
 try{
  await q('START TRANSACTION');
  const [[source]]=await q('SELECT lease_run_id,lease_owner,lease_epoch,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[SOURCE_ID]);
  if(source?.lease_run_id!==token.parentId||source.lease_owner!==token.ownerId||Number(source.lease_epoch)!==token.epoch||Number(source.live)!==1)fail('LAST_NIGHT_SEGMENT_LEASE_LOST');
  const [[run]]=await q('SELECT * FROM po_sync_runs WHERE id=? FOR UPDATE',[runId]);
  if(run?.source_id!==SOURCE_ID||run.account_id!==token.accountId||run.status!=='running'||run.lease_owner!==token.ownerId||Number(run.lease_epoch)!==runEpoch)fail('LAST_NIGHT_SEGMENT_LEASE_LOST');
  const status=completed?'completed_authorized_scope':'partial';
  await bounded(persistEvidence({phase:'segment_finish_prepared',token,runId,runEpoch,status,before:run}));
  const [updated]=await q("UPDATE po_sync_runs SET status=?,finished_at=UTC_TIMESTAMP(3),lease_owner=NULL,lease_until=NULL,error_code=? WHERE id=? AND status='running' AND lease_owner=? AND lease_epoch=? AND lease_until>UTC_TIMESTAMP(3)",[status,completed?null:'LAST_NIGHT_TASK_PAGE_BUDGET',runId,token.ownerId,runEpoch]);
  if(updated.affectedRows!==1)fail('LAST_NIGHT_SEGMENT_LEASE_LOST');
  await bounded(persistEvidence({phase:'segment_finish_commit_prepared',token,runId,runEpoch,status}));
  committing=true;commitState.pending=true;commitState.acknowledged=false;await q('COMMIT');ack=true;commitState.acknowledged=true;
  await bounded(persistEvidence({phase:'segment_finish_committed',token,runId,runEpoch,status}));commitState.pending=false;
  return{status,runId,fullChainComplete:false};
 }catch(error){if(!committing){try{await q('ROLLBACK');}catch{}}else error.code=ack?'LAST_NIGHT_SEGMENT_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_SEGMENT_COMMIT_UNKNOWN';throw error;}
}
module.exports={finishSegment};
