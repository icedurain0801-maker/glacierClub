'use strict';
const {DEFAULT_PLATFORMS}=require('./sharedWorkerIdentityLoader');
const brands=new WeakMap();
const fail=()=>{throw Object.assign(Error('Shared entry identity invalid'),{code:'WORKER_ENTRY_IDENTITY_INVALID'});};
const id=v=>typeof v==='string'&&v.length>0&&v===v.trim();
const supplied=(o,keys,v)=>{for(const key of keys)if(Object.hasOwn(o||{},key)&&o[key]!==v)fail();};
// Classification is read-only evidence, never permission to claim or clear marker.
function createSharedWorkerEntryClassifier({repo}={}){
 if(typeof repo?.query!=='function')throw TypeError('Repository required');
 const classify=async(source,run=null)=>{
  if(!id(source?.id)||(run&&!id(run.id)))fail();
  const rows=await repo.query(`SELECT s.id AS s_id,s.game_id AS s_game_id,s.community_id AS s_community_id,s.platform AS s_platform,
    g.id AS g_id,g.region_code AS g_region_code,s.enabled AS s_enabled,g.enabled AS g_enabled,c.id AS c_id,c.game_id AS c_game_id,c.status AS c_status,
    s.collect_requested_at AS s_requested_at,r.id AS r_id,r.source_id AS r_source_id,r.account_id AS r_account_id,r.site_id AS r_site_id,
    r.trigger_type AS r_trigger_type,r.parent_run_id AS r_parent_run_id,r.status AS r_status
    FROM po_sources s LEFT JOIN po_games g ON g.id=s.game_id LEFT JOIN po_communities c ON c.id=s.community_id LEFT JOIN po_sync_runs r ON r.id=? WHERE s.id=? LIMIT 2`,[run?.id||null,source.id]);
  if(!Array.isArray(rows)||rows.length!==1)fail();const r=rows[0];
  if(r.s_id!==source.id||!id(r.s_game_id)||r.s_game_id!==r.g_id||!DEFAULT_PLATFORMS.includes(r.s_platform)||!['domestic','overseas'].includes(r.g_region_code))fail();
  supplied(source,['sourceId','source_id'],r.s_id);
  if(r.s_community_id!=null&&(r.c_id!==r.s_community_id||r.c_game_id!==r.s_game_id))fail();
  for(const [keys,v] of [[['game_id'],r.s_game_id],[['community_id'],r.s_community_id],[['platform'],r.s_platform],[['region_code'],r.g_region_code]])supplied(source,keys,v);
  if(run){if(r.r_id!==run.id||r.r_source_id!==r.s_id)fail();
    for(const [keys,v] of [[['source_id','sourceId'],r.r_source_id],[['account_id','accountId'],r.r_account_id],[['site_id','siteId'],r.r_site_id],[['trigger_type','triggerType'],r.r_trigger_type],[['parent_run_id','parentRunId'],r.r_parent_run_id],[['status'],r.r_status]])supplied(run,keys,v);}
  return Object.freeze({candidate:r.s_platform==='bigplayer_h5'&&r.g_region_code==='overseas',source:Object.freeze({...source,id:r.s_id,game_id:r.s_game_id,community_id:r.s_community_id,platform:r.s_platform,region_code:r.g_region_code,enabled:r.s_enabled,game_enabled:r.g_enabled,community_status:r.c_status,collect_requested_at:r.s_requested_at}),
    run:run?Object.freeze({...run,id:r.r_id,source_id:r.r_source_id,account_id:r.r_account_id,site_id:r.r_site_id,trigger_type:r.r_trigger_type,parent_run_id:r.r_parent_run_id,status:r.r_status}):null});
 };brands.set(classify,repo);return classify;
}
function assertSharedWorkerEntryClassifier(classify,repo){if(brands.get(classify)!==repo)fail();return classify;}
module.exports={createSharedWorkerEntryClassifier,assertSharedWorkerEntryClassifier};
