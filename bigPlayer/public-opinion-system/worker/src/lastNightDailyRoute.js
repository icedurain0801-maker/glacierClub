'use strict';
const crypto=require('node:crypto');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('./lastNightScope');
const {withDeadlineConnection}=require('./lastNightDeadlineConnection');
const fail=code=>{throw Object.assign(new Error(code),{code});};
// Existing scheduler treats equal start/end as an empty (never due) window.
// This is an EXPLICIT target-source route transfer, not a fake config owner.
const SHARED_CLOSED_WINDOW=JSON.stringify({start:'00:00',end:'00:00'});
function routePlan(source,state) {
 if(source?.id!==SOURCE_ID || source.game_id!==GAME_ID || source.community_id!==COMMUNITY_ID || source.platform!=='bigplayer_h5'
   || Number(source.enabled)!==1 || source.region_code!=='overseas' || source.community_status!=='enabled'
   || !state || state.source_id!==SOURCE_ID || Number(source.schedule_version)!==Number(state.schedule_version))fail('LAST_NIGHT_ROUTE_SCOPE_MISMATCH');
 const before={activeWindow:source.active_window,frequencySeconds:source.frequency_seconds,version:source.schedule_version,
   effectiveAt:source.schedule_effective_at,config:source.config,stateVersion:state.schedule_version,stateEffectiveAt:state.effective_at,
   last:state.last_scheduled_at,next:state.next_scheduled_at,runId:state.lease_run_id,owner:state.lease_owner,epoch:state.lease_epoch,until:state.lease_until};
 const after={activeWindow:SHARED_CLOSED_WINDOW,frequencySeconds:86400,version:Number(source.schedule_version)+1};
 if(!Number.isSafeInteger(after.version))fail('LAST_NIGHT_ROUTE_VERSION_INVALID');
 return{before,after,hash:crypto.createHash('sha256').update(JSON.stringify({before,after})).digest('hex')};
}
async function transferDailyRoute({pool,accountId,expectedIdentity,approvedHash,inspectOnly=false,persistEvidence}) {
 if(!accountId || !expectedIdentity || (!inspectOnly && (!/^[a-f0-9]{64}$/.test(approvedHash||'') || typeof persistEvidence!=='function')))fail('LAST_NIGHT_ROUTE_APPROVAL_REQUIRED');
 let committing=false,committed=false;
 return withDeadlineConnection(pool,async({query:q,bounded})=>{
  try {
   const [[identity]]=await q('SELECT CURRENT_USER() AS identity,DATABASE() AS db,@@port AS port');
   if(identity?.identity!==expectedIdentity || identity.db!=='public_opinion' || Number(identity.port)!==3306)fail('LAST_NIGHT_RUNTIME_IDENTITY_MISMATCH');
   const [[lock]]=await q('SELECT GET_LOCK(?,0) AS acquired',[`public-opinion-sync-account-${accountId}`]);
   if(Number(lock?.acquired)!==1)fail('LAST_NIGHT_DUPLICATE_EXECUTION');
   await q('SET SESSION innodb_lock_wait_timeout=3');await q('START TRANSACTION');
   const [[state]]=await q('SELECT *, (lease_until IS NOT NULL AND lease_until>UTC_TIMESTAMP(3)) AS active_lease FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[SOURCE_ID]);
   const [[source]]=await q('SELECT s.*,g.region_code,c.status AS community_status FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.id=? FOR UPDATE',[SOURCE_ID]);
   const [accounts]=await q('SELECT id FROM po_accounts WHERE id=? AND source_id=? AND game_id=? AND community_id=? AND enabled=1 FOR UPDATE',[accountId,SOURCE_ID,GAME_ID,COMMUNITY_ID]);
   if(accounts.length!==1)fail('LAST_NIGHT_ROUTE_SCOPE_MISMATCH');
   const plan=routePlan(source,state);
   const [active]=await q("SELECT id FROM po_sync_runs WHERE (source_id=? OR account_id=?) AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE",[SOURCE_ID,accountId]);
   const [activeCp]=await q("SELECT id FROM po_sync_checkpoints WHERE account_id=? AND status='running' AND (lease_until IS NULL OR lease_until>UTC_TIMESTAMP(3)) LIMIT 1 FOR UPDATE",[accountId]);
   if(active.length || activeCp.length || Number(state.active_lease))fail('LAST_NIGHT_ROUTE_ACTIVE_OWNER');
   if(inspectOnly){await q('ROLLBACK');return{status:'LAST_NIGHT_ROUTE_PLAN_READY',hash:plan.hash,sharedClosedWindow:SHARED_CLOSED_WINDOW,frequencySeconds:86400,
     impact:'target-source-periodic-scheduling-only; existing history untouched; independent consumer must be installed before apply'};}
   if(plan.hash!==approvedHash)fail('LAST_NIGHT_ROUTE_PLAN_CHANGED');
   const journal={phase:'daily_route_prepared',sourceId:SOURCE_ID,accountId,...plan};await bounded(persistEvidence(journal));
   const [changed]=await q('UPDATE po_sources SET active_window=?,frequency_seconds=86400,schedule_version=schedule_version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND schedule_version=? AND active_window<=>? AND frequency_seconds=? AND config=?',
     [SHARED_CLOSED_WINDOW,SOURCE_ID,source.schedule_version,source.active_window,source.frequency_seconds,source.config]);
   if(changed.affectedRows!==1)fail('LAST_NIGHT_ROUTE_CAS_FAILED');
   const [stateChange]=await q('UPDATE po_source_schedule_state SET schedule_version=?,lease_epoch=lease_epoch+1 WHERE source_id=? AND schedule_version=? AND lease_epoch=? AND lease_owner<=>? AND (lease_until IS NULL OR lease_until<=UTC_TIMESTAMP(3))',
     [plan.after.version,SOURCE_ID,state.schedule_version,state.lease_epoch,state.lease_owner]);
   if(stateChange.affectedRows!==1)fail('LAST_NIGHT_ROUTE_CAS_FAILED');
   const [[afterSource]]=await q('SELECT active_window,frequency_seconds,schedule_version,config FROM po_sources WHERE id=? FOR UPDATE',[SOURCE_ID]);
   const [[afterState]]=await q('SELECT schedule_version,lease_epoch,last_scheduled_at,next_scheduled_at FROM po_source_schedule_state WHERE source_id=? FOR UPDATE',[SOURCE_ID]);
   if(afterSource?.active_window!==SHARED_CLOSED_WINDOW || Number(afterSource.frequency_seconds)!==86400 || Number(afterSource.schedule_version)!==plan.after.version
     || afterSource.config!==source.config || Number(afterState?.schedule_version)!==plan.after.version || Number(afterState.lease_epoch)!==Number(state.lease_epoch)+1
     || afterState.last_scheduled_at!==state.last_scheduled_at || afterState.next_scheduled_at!==state.next_scheduled_at)fail('LAST_NIGHT_ROUTE_VERIFY_FAILED');
   await bounded(persistEvidence({...journal,phase:'daily_route_commit_prepared',afterSource,afterState}));
   committing=true;await q('COMMIT');committed=true;
   await bounded(persistEvidence({...journal,phase:'daily_route_committed',afterSource,afterState}));
   return{status:'LAST_NIGHT_DAILY_ROUTE_TRANSFERRED',sourceId:SOURCE_ID,version:plan.after.version,sharedScheduling:'closed-by-existing-active-window',independentRuntimeInstalled:false};
  }catch(error){if(!committing){try{await q('ROLLBACK');}catch{}}else error.code=committed?'LAST_NIGHT_ROUTE_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_ROUTE_COMMIT_UNKNOWN';throw error;}
 },{timeoutMs:15000,code:'LAST_NIGHT_ROUTE_TIMEOUT'}).catch(error=>{if(committing)error.code=committed?'LAST_NIGHT_ROUTE_COMMITTED_JOURNAL_FAILED':'LAST_NIGHT_ROUTE_COMMIT_UNKNOWN';throw error;});
}
module.exports={SHARED_CLOSED_WINDOW,routePlan,transferDailyRoute};
