'use strict';
const fs=require('node:fs'),path=require('node:path');
const project=path.resolve(__dirname,'../../..');
const directory='C:/ProgramData/PublicOpinion/overseas-daily/state';
const intent=JSON.parse(fs.readFileSync(path.join(directory,'slot-1791568800000.json')));
const snapshotName=fs.readdirSync(directory).find(n=>n.startsWith('legacy-handoff-1791605644811-'));
if(!snapshotName)throw new Error('HANDOFF_SNAPSHOT_MISSING');
const legacy=JSON.parse(fs.readFileSync(path.join(directory,snapshotName)));
require(path.join(project,'server/src/runtimeEnv')).loadRuntimeEnv();
const {Repository}=require(path.join(project,'server/src/db/repository'));
const canonical=value=>JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))));
(async()=>{
 const repo=new Repository({...process.env,DB_POOL_SIZE:'1'});let c;
 try{
  c=await repo.pool.getConnection();await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const q=async(sql,params=[])=>(await c.query({sql,timeout:15000},params))[0];
  const runs=await q('SELECT * FROM po_sync_runs WHERE id=? OR parent_run_id=?',[intent.parentId,intent.parentId]);
  const ids=legacy.children.map(r=>r.id),marks=ids.map(()=>'?').join(',');
  const associations=await q(`SELECT * FROM po_sync_run_contents WHERE run_id IN (${marks})`,ids);
  const checkpoints=await q('SELECT * FROM po_sync_checkpoints WHERE account_id=? AND window_start IN (?,?) AND window_end IN (?,?)',[intent.accountId,intent.windowStart,intent.windowStart.replace('T',' ').replace('.000Z',''),intent.windowEnd,intent.windowEnd.replace('T',' ').replace('.000Z','')]);
  const priorAssoc=new Map(associations.map(r=>[canonical(r),r]));
  const priorCp=new Map(checkpoints.map(r=>[canonical(r),r]));
  const contentIds=[...new Set(associations.map(r=>r.content_id))],cm=contentIds.map(()=>'?').join(',');
  const contents=contentIds.length?await q(`SELECT id,source_id,account_id,game_id,community_id,external_id,content_type,title,body,published_at,raw_payload FROM po_contents WHERE id IN (${cm})`,contentIds):[];
  const memberships=contentIds.length?await q(`SELECT account_id,content_id,feed_key,feed_metadata FROM po_content_feed_memberships WHERE content_id IN (${cm}) AND feed_key LIKE 'overseas:%'`,contentIds):[];
  const analysis=contentIds.length?await q(`SELECT content_id,analysis_profile,status,error_code,next_retry_at FROM po_analysis_jobs WHERE content_id IN (${cm})`,contentIds):[];
  const translations=contentIds.length?await q(`SELECT content_id,target_language,status,error_code,next_retry_at FROM po_translation_jobs WHERE content_id IN (${cm})`,contentIds):[];
  await c.rollback();
  const preservation={legacyChildren:legacy.children.length,currentChildren:runs.filter(r=>r.parent_run_id===intent.parentId).length,oldAssociations:legacy.associations.length,oldAssociationsUnchanged:legacy.associations.filter(r=>priorAssoc.has(canonical(r))).length,oldCheckpoints:legacy.checkpoints.length,oldCheckpointsUnchanged:legacy.checkpoints.filter(r=>priorCp.has(canonical(r))).length};
  const output={capturedAt:new Date().toISOString(),intent,snapshotName,preservation,runs,associations,checkpoints,contents,memberships,analysis,translations,readOnly:true};
  const target=path.resolve(project,'../../.temp',`qa-v049-daily-handoff-${Date.now()}.json`);fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({evidencePath:target,intent,preservation,runs:runs.map(r=>({id:r.id,site_id:r.site_id,status:r.status,error_code:r.error_code,fetched_count:r.fetched_count,stored_count:r.stored_count,receipt:r.error_message})),contentCount:contents.length,membershipCount:memberships.length,analysisStates:analysis.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{}),translationStates:translations.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{})},null,2));
 }finally{if(c)c.release();await repo.pool.end();}
})().catch(e=>{console.error(JSON.stringify({status:'QA_READ_FAILED',code:e.code,message:e.message}));process.exitCode=1;});
