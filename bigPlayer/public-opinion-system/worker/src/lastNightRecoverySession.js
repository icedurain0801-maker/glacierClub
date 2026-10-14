'use strict';
const { withDeadlineConnection } = require('./lastNightDeadlineConnection');
const { SOURCE_ID } = require('./lastNightScope');
const { assertRecoveryToken } = require('./lastNightBoundedRecoveryPage');
const fail = code => { throw Object.assign(new Error(code), { code }); };
async function resumeRecoverySession({pool,expectedIdentity,evidence,ownerId,persistEvidence,work}) {
  if(evidence?.phase !== 'recovery_page_committed' || evidence.sourceId !== SOURCE_ID || !evidence.token
    || !evidence.afterCheckpoint || !evidence.sourceConfig || typeof work !== 'function' || typeof persistEvidence !== 'function'
    || !/^lastnight-independent:[a-f0-9-]{36}$/.test(ownerId||''))fail('LAST_NIGHT_RESUME_EVIDENCE_INVALID');
  const cp=evidence.afterCheckpoint;
  if(cp.status==='idle') {
    let cursor;try{cursor=JSON.parse(cp.cursor);}catch{fail('LAST_NIGHT_RECOVERY_CURSOR_UNSAFE');}
    if(cursor.version!==2 || cursor.feedKey!==cp.task_key || !Number.isSafeInteger(cursor.offsetId) || cursor.offsetId<1 || cursor.offsetId>=10000
      || !Number.isSafeInteger(cursor.pageIndex) || cursor.pageIndex<1)fail('LAST_NIGHT_RECOVERY_CURSOR_UNSAFE');
  }
  let committing=false,committed=false;const recoveryCommitState={pending:false,acknowledged:false};
  return withDeadlineConnection(pool,async({query:q,bounded})=>{
    try {
      const [[identity]]=await q('SELECT CURRENT_USER() AS identity,DATABASE() AS db,@@port AS port');
      if(identity?.identity !== expectedIdentity || identity.db !== 'public_opinion' || Number(identity.port)!==3306)fail('LAST_NIGHT_RUNTIME_IDENTITY_MISMATCH');
      const [[lock]]=await q('SELECT GET_LOCK(?,0) AS acquired',[`public-opinion-sync-account-${evidence.accountId}`]);
      if(Number(lock?.acquired)!==1)fail('LAST_NIGHT_DUPLICATE_EXECUTION');
      await q('SET SESSION innodb_lock_wait_timeout=3');await q('START TRANSACTION');
      const [[state]]=await q('SELECT * FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[SOURCE_ID]);
      const [[source]]=await q('SELECT config,schedule_version FROM po_sources WHERE id=? FOR UPDATE',[SOURCE_ID]);
      const [active]=await q("SELECT id FROM po_sync_runs WHERE (source_id=? OR account_id=?) AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE",[SOURCE_ID,evidence.accountId]);
      if(active.length)fail('LAST_NIGHT_ACTIVE_RUN');
      if(!state || state.lease_run_id!==evidence.token.parentId || state.lease_owner!==evidence.token.ownerId || Number(state.lease_epoch)!==Number(evidence.token.epoch)
        || source?.config!==evidence.sourceConfig || Number(source.schedule_version)!==Number(evidence.scheduleVersion))fail('LAST_NIGHT_RESUME_OWNER_CHANGED');
      // Explicit, authenticated, account-locked reacquisition. Never renew an
      // expired token in-place: fence all previous attempts with a NEW epoch.
      await bounded(persistEvidence({phase:'resume_prepared',sourceId:SOURCE_ID,accountId:evidence.accountId,beforeToken:evidence.token,ownerId}));
      const [changed]=await q('UPDATE po_source_schedule_state SET lease_owner=?,lease_epoch=lease_epoch+1,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 300 SECOND) WHERE source_id=? AND lease_run_id=? AND lease_owner=? AND lease_epoch=? AND schedule_version=?',[ownerId,SOURCE_ID,state.lease_run_id,state.lease_owner,state.lease_epoch,evidence.scheduleVersion]);
      if(changed.affectedRows!==1)fail('LAST_NIGHT_RESUME_OWNER_CHANGED');
      const token={...evidence.token,ownerId,epoch:Number(state.lease_epoch)+1};
      await assertRecoveryToken(q,token);
      await bounded(persistEvidence({phase:'resume_commit_prepared',sourceId:SOURCE_ID,accountId:evidence.accountId,token}));
      committing=true;await q('COMMIT');committed=true;
      await bounded(persistEvidence({phase:'resume_committed',sourceId:SOURCE_ID,accountId:evidence.accountId,token}));
      committing=false;
      return await bounded(work({query:q,bounded,token,recoveryCommitState}));
    }catch(error){
      if(recoveryCommitState.pending){error.code=recoveryCommitState.acknowledged?'LAST_NIGHT_RECOVERY_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_RECOVERY_COMMIT_UNKNOWN';throw error;}
      if(/^LAST_NIGHT_RECOVERY_(COMMIT_UNKNOWN|COMMITTED_JOURNAL_FAILED)$/.test(error.code||''))throw error;
      if(!committing){try{await q('ROLLBACK');}catch{}}else error.code=committed?'LAST_NIGHT_RESUME_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_RESUME_COMMIT_UNKNOWN';throw error;
    }
  },{timeoutMs:120000,code:'LAST_NIGHT_RESUME_TIMEOUT'}).catch(error=>{
    if(recoveryCommitState.pending)error.code=recoveryCommitState.acknowledged?'LAST_NIGHT_RECOVERY_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_RECOVERY_COMMIT_UNKNOWN';
    else if(committing)error.code=committed?'LAST_NIGHT_RESUME_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_RESUME_COMMIT_UNKNOWN';throw error;
  });
}
module.exports={resumeRecoverySession};
