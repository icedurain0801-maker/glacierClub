'use strict';
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'../../..');
const source='081a16d2-5545-4afd-9c65-e04777e4540b';
const state=JSON.parse(fs.readFileSync('C:/ProgramData/PublicOpinion/overseas-daily/state/slot-1791568800000.json'));
require(path.join(project,'server/src/runtimeEnv')).loadRuntimeEnv();
const {Repository}=require(path.join(project,'server/src/db/repository'));
(async()=>{
 const repo=new Repository({...process.env,DB_POOL_SIZE:'1'});let c;
 try{
  c=await repo.pool.getConnection();await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const q=async(sql,params=[])=>(await c.query({sql,timeout:15000},params))[0];
  const runs=await q('SELECT id,source_id,account_id,site_id,parent_run_id,status,trigger_type,scheduled_at,window_start,window_end,lease_owner,lease_epoch,lease_until,created_at,updated_at,started_at,finished_at,fetched_count,stored_count,error_code,error_message FROM po_sync_runs WHERE source_id=? AND (id=? OR parent_run_id=?) ORDER BY created_at,id',[source,state.parentId,state.parentId]);
  const ids=runs.map(r=>r.id),marks=ids.map(()=>'?').join(',');
  const associations=ids.length?await q(`SELECT rc.run_id,rc.content_id,rc.sync_scope,c.source_id,c.community_id,c.external_id FROM po_sync_run_contents rc JOIN po_contents c ON c.id=rc.content_id WHERE rc.run_id IN (${marks})`,ids):[];
  const schedule=await q('SELECT source_id,lease_owner,lease_until,lease_run_id,lease_epoch,last_status,last_reason_code,last_scan_at,last_scheduled_at,next_scheduled_at FROM po_source_schedule_state WHERE source_id=?',[source]);
  const domestic=await q("SELECT r.id,r.status,r.error_code,r.created_at,r.updated_at,r.finished_at,r.fetched_count,r.stored_count FROM po_sync_runs r JOIN po_sources s ON s.id=r.source_id JOIN po_games g ON g.id=s.game_id WHERE g.region_code='domestic' ORDER BY r.created_at DESC LIMIT 5");
  await c.rollback();
  const output={capturedAt:new Date().toISOString(),state,runs,associations,schedule,domesticRecentRuns:domestic,readOnly:true};
  const target=path.resolve(project,'../../.temp',`qa-v048-daily-readonly-${Date.now()}.json`);
  fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...output,evidencePath:target},null,2));
 }finally{if(c)c.release();await repo.pool.end();}
})().catch(e=>{console.error(JSON.stringify({status:'QA_READ_FAILED',code:e.code}));process.exitCode=1;});
