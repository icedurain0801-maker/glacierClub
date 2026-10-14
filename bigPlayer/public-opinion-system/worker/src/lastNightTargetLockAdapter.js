'use strict';
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('./lastNightScope');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const RUN_OR="SELECT id FROM po_sync_runs WHERE (source_id=? OR account_id=?) AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE";
const statuses="status IN ('queued','running','pausing','paused','cancelling')";
// Optional independent adapter for the next candidate, NOT installed into the
// frozen forward CLI. Required real indexes must first be inspected by PM.
function targetLockQuery(query,accountId){
 const raw=query;
 const run=async(sql,params)=>{try{return await raw(sql,params);}catch(error){
  const stages=[['po_source_schedule_state','source_state'],['po_sources','source'],['po_accounts','account'],['po_source_sites','registry'],['po_sync_checkpoints','checkpoint'],['po_sync_runs','run'],['po_contents','content'],['po_games','game_read'],['po_communities','community_read']];
  error.lockStage=stages.find(([table])=>sql.includes(table))?.[1]||'transaction';throw error;
 }};
 query=run;
 return async(sql,params=[])=>{
  if(sql==='START TRANSACTION'){await query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');return query(sql,params);}
  if(sql.startsWith('SELECT s.*,g.region_code,c.status AS community_status FROM po_sources s JOIN po_games')&&sql.endsWith('FOR UPDATE')){
   if(params.length!==1||params[0]!==SOURCE_ID)fail('LAST_NIGHT_TARGET_LOCK_SCOPE_INVALID');
   const [sources]=await query('SELECT * FROM po_sources FORCE INDEX (PRIMARY) WHERE id=? FOR UPDATE',[SOURCE_ID]);
   if(sources.length!==1)return[sources];const source=sources[0];
   if(source.game_id!==GAME_ID||source.community_id!==COMMUNITY_ID)fail('LAST_NIGHT_TARGET_LOCK_SCOPE_INVALID');
   const [[game]]=await query('SELECT region_code FROM po_games WHERE id=?',[GAME_ID]);
   const [[community]]=await query('SELECT status FROM po_communities WHERE id=?',[COMMUNITY_ID]);
   return[[{...source,region_code:game?.region_code,community_status:community?.status}]];
  }
  if(sql===RUN_OR){
   if(params[0]!==SOURCE_ID||params[1]!==accountId)fail('LAST_NIGHT_TARGET_LOCK_SCOPE_INVALID');
   const [sourceRuns]=await query(`SELECT id FROM po_sync_runs FORCE INDEX (po_sync_runs_source_status_lease_idx) WHERE source_id=? AND ${statuses} LIMIT 1 FOR UPDATE`,[SOURCE_ID]);
   const [accountRuns]=await query(`SELECT id FROM po_sync_runs FORCE INDEX (po_sync_runs_account_status_created_idx) WHERE account_id=? AND ${statuses} LIMIT 1 FOR UPDATE`,[accountId]);
   return[[...sourceRuns,...accountRuns]];
  }
  if(sql==="SELECT id FROM po_sync_checkpoints WHERE account_id=? AND status='running' LIMIT 1 FOR UPDATE"){
   if(params[0]!==accountId)fail('LAST_NIGHT_TARGET_LOCK_SCOPE_INVALID');const rows=[];
   for(const site of ['legacy-8483a64ab230417e63c5e30d77b0a6f0','site-f069f4495d534693dd87b2485053e7cd','site-3bb48be7f9a82185d6a045e9a5cbd3d7']){
    const [found]=await query("SELECT id FROM po_sync_checkpoints FORCE INDEX (po_sync_checkpoints_site_idx) WHERE site_id=? AND account_id=? AND status='running' LIMIT 1 FOR UPDATE",[site,accountId]);rows.push(...found);
   }return[rows];
  }
  return query(sql,params);
 };
}
module.exports={targetLockQuery};
