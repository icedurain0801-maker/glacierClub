'use strict';
const crypto=require('node:crypto');
const {createSchedulerRepositoryAdapter,toMariaDbDateTime}=require('./schedulerRepositoryAdapter');
const {SOURCE_ID,COMMUNITY_ID,BOARD_ID}=require('./lastNightScope');
const {inspectWriteSchema}=require('./lastNightWriteSchema');
const fail=code=>{throw Object.assign(new Error(code),{code});};
// No worker, scheduler loop or heartbeat is imported. Own only the approved slot.
async function acquireIndependentDailySlot({connection,accountId,sites,scheduledAt,windowStart,windowEnd,scheduleVersion,ownerId}={}) {
  if(!connection||!accountId||!ownerId||sites?.length!==3||new Set(sites.map(site=>site.siteId)).size!==3
    ||!Number.isInteger(scheduleVersion)||Date.parse(windowEnd)-Date.parse(windowStart)!==86400000) fail('LAST_NIGHT_SLOT_PLAN_INVALID');
  const slot=toMariaDbDateTime(scheduledAt);const start=toMariaDbDateTime(windowStart);const end=toMariaDbDateTime(windowEnd);
  // Explicit business slot: 02:00 Asia/Shanghai, never derive from drifting now.
  if(!slot.endsWith('18:00:00.000')) fail('LAST_NIGHT_SLOT_PLAN_INVALID');
  const runId=crypto.randomUUID(),leaseUntil=new Date(Date.now()+300000);let runs=[];
  const q=(sql,params=[])=>connection.query({sql,timeout:8000},params);
  const schema=await inspectWriteSchema({query:async(sql,params)=>(await q(sql,params))[0]},'daily');
  if(schema.status!=='LAST_NIGHT_WRITE_SCHEMA_READY')return{acquired:false,created:false,schema,runs:[]};
  const facade={query:q,beginTransaction:()=>q('START TRANSACTION'),rollback:()=>q('ROLLBACK'),commit:async()=>{
    const [rows]=await q('SELECT id,parent_run_id,site_id,site_url_snapshot,source_id,account_id,community_id,board_id,status,window_start,window_end FROM po_sync_runs WHERE id=? OR parent_run_id=? FOR UPDATE',[runId,runId]);
    if(rows.length!==4||rows.some(row=>row.source_id!==SOURCE_ID||row.account_id!==accountId||row.community_id!==COMMUNITY_ID||String(row.board_id)!==BOARD_ID||row.status!=='queued')) fail('LAST_NIGHT_SLOT_SCOPE_MISMATCH');
    const children=rows.filter(row=>row.parent_run_id===runId);
    if(children.length!==3||children.some(row=>!sites.some(site=>site.siteId===row.site_id&&site.url===row.site_url_snapshot))) fail('LAST_NIGHT_SLOT_SITE_MISMATCH');
    // Existing scheduling narrows windows by prior cursor: never call this a full day if narrowed.
    if(rows.some(row=>row.window_start!==start||row.window_end!==end)) fail('LAST_NIGHT_SLOT_WINDOW_NARROWED');
    const [changed]=await q("UPDATE po_sync_runs SET status='running',lease_owner=?,lease_epoch=lease_epoch+1,lease_until=?,started_at=UTC_TIMESTAMP(3) WHERE (id=? OR parent_run_id=?) AND source_id=? AND account_id=? AND status='queued'",[ownerId,toMariaDbDateTime(leaseUntil),runId,runId,SOURCE_ID,accountId]);
    if(changed.affectedRows!==4) fail('LAST_NIGHT_SLOT_CLAIM_FAILED');
    [runs]=await q('SELECT id,parent_run_id,site_id,lease_epoch FROM po_sync_runs WHERE id=? OR parent_run_id=?',[runId,runId]);
    await q('COMMIT');
  }};
  const adapter=createSchedulerRepositoryAdapter(facade);
  const result=await adapter.scheduleSlotAtomic({runId,sourceId:SOURCE_ID,accountId,ownerId,scheduledAt,
    windowStartAt:windowStart,windowEndAt:windowEnd,nextSlotAt:new Date(Date.parse(scheduledAt)+86400000),scheduleVersion,
    leaseUntil,triggerType:'scheduled',multiSite:true,communityId:COMMUNITY_ID,boardId:BOARD_ID});
  return {...result,runs,upstreamContract:'three_registry_identities_same_direct_http_contract',contentUniqueness:'source_board_external_id'};
}
module.exports={acquireIndependentDailySlot};
