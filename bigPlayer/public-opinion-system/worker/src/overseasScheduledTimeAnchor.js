'use strict';
const {iso}=require('./overseasBigPlayerNetworkContractVerifier');
const {computeSchedule,ALLOWED_FREQUENCIES}=require('./scheduleSlots');
const {normalizeSiteUrls}=require('../../server/src/services/bigplayerSiteConfig');
const anchors=new WeakMap();
const {canonical}=require('./overseasBigPlayerRunContractJournal');
const certifiedAnchors=new WeakMap();
const fail=code=>{throw Object.assign(new Error(code),{code});};
// Fixed DB clock from one read-only transaction, not Date.now or caller input.
// In-memory capability only; restart needs separately persisted admission proof.
function createTimeAnchorReader({repo,isolation,cursorReader,certified=false}={}){
  if(typeof repo?.pool?.getConnection!=='function')fail('OVERSEAS_SCHEDULED_ANCHOR_REQUIRED');
  if(certified){require('../../server/src/db/overseasScheduledIsolatedTarget').assertScheduledIsolatedTarget(isolation,repo);require('../../server/src/db/overseasScheduledParentStore').assertCertifiedFixtureCursorReader(cursorReader,repo,isolation);}
  return async({sourceId}={})=>{
    if(typeof sourceId!=='string'||!sourceId)fail('OVERSEAS_SCHEDULED_ANCHOR_INVALID');
    const c=await repo.pool.getConnection();let begun=false,destroyed=false;
    try{if(certified)await isolation.verifyConnection(c);await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await c.query('START TRANSACTION READ ONLY');begun=true;
      const [rows]=await c.query("SELECT s.id,s.game_id,s.community_id,s.config,s.default_account_id,s.frequency_seconds,s.schedule_version,s.schedule_effective_at,st.last_scan_at,st.last_scheduled_at,st.next_scheduled_at,st.effective_at,st.schedule_version AS state_version,DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%d %H:%i:%s.%f') AS db_now FROM po_sources s JOIN po_source_schedule_state st ON st.source_id=s.id WHERE s.id=? LIMIT 2",[sourceId]);
      if(rows.length!==1||rows[0].id!==sourceId)fail('OVERSEAS_SCHEDULED_ANCHOR_INVALID');const r=rows[0];
      const now=iso(String(r.db_now).replace(/(\.\d{3})000$/,'$1')),effectiveAt=iso(r.effective_at),lastScheduledAt=r.last_scheduled_at==null?null:iso(r.last_scheduled_at),nextScheduledAt=iso(r.next_scheduled_at),frequency=Number(r.frequency_seconds),version=Number(r.schedule_version);
      if(!ALLOWED_FREQUENCIES.includes(frequency)||!Number.isSafeInteger(version)||version<1||Number(r.state_version)!==version||iso(r.schedule_effective_at)!==effectiveAt)fail('OVERSEAS_SCHEDULED_ANCHOR_INVALID');
      const schedule=computeSchedule({now:new Date(now),frequencySeconds:frequency,effectiveAt,lastProcessedScheduledAt:lastScheduledAt});
      if(!schedule.dueSlotAt||schedule.dueSlotAt!==nextScheduledAt)fail('OVERSEAS_SCHEDULED_SLOT_NOT_DUE');
      const window=schedule.window?{start:schedule.window.windowStartAt,end:Date.parse(now)>Date.parse(schedule.window.windowEndAt)?now:schedule.window.windowEndAt}:{start:new Date(Date.parse(now)-7*86400000).toISOString(),end:now};
      let config;try{config=typeof r.config==='string'?JSON.parse(r.config):r.config;}catch{fail('OVERSEAS_SCHEDULED_ANCHOR_INVALID');}
      if(!config||!/^\d+$/.test(String(config.boardId))||typeof r.default_account_id!=='string')fail('OVERSEAS_SCHEDULED_ANCHOR_INVALID');
      const configured=normalizeSiteUrls(config).siteUrls.filter(s=>s.enabled).sort((a,b)=>a.siteId.localeCompare(b.siteId));
      if(configured.length<1||configured.length>100)fail('OVERSEAS_SCHEDULED_ANCHOR_INVALID');
      const siteWindows=[],certifiedSites=[];
      for(const s of configured){
        let cursor=null;
        if(certified){
          const scope=Object.freeze({sourceId,accountId:r.default_account_id,gameId:r.game_id,communityId:r.community_id,siteId:s.siteId,boardId:String(config.boardId),siteUrl:s.url,siteUrlSha256:require('node:crypto').createHash('sha256').update(s.url).digest('hex')});
          const evidence=await cursorReader.readInTransaction(c,scope,{lock:false});
          if(evidence!==null){cursor=iso(evidence.cursorAt);if(cursor!==evidence.cursorAt||cursor>=window.end)fail('OVERSEAS_SCHEDULED_CERTIFIED_CURSOR_WINDOW_INVALID');}
          certifiedSites.push(Object.freeze({siteId:s.siteId,scope,evidence:canonical(evidence)}));
        }else{
          const [cursors]=await c.query("SELECT MAX(last_item_at) AS last_successful_cursor FROM po_sync_checkpoints WHERE account_id=? AND site_id=? AND status='completed' AND last_item_at IS NOT NULL AND task_key LIKE ?",[r.default_account_id,s.siteId,`board:${config.boardId}:%`]);
          if(cursors.length!==1)fail('OVERSEAS_SCHEDULED_ANCHOR_INVALID');cursor=cursors[0].last_successful_cursor==null?null:iso(cursors[0].last_successful_cursor);
        }
        const windowStart=certified?(cursor&&cursor>window.start?cursor:window.start):(cursor&&cursor>window.start&&cursor<window.end?cursor:window.start);
        siteWindows.push(Object.freeze({siteId:s.siteId,siteUrl:s.url,cursor,windowStart,windowEnd:window.end}));
      }
      const value=Object.freeze({format:certified?'overseas-certified-fixture-time-anchor-v1':'overseas-scheduled-time-anchor-v1',sourceId,anchorAt:now,frequencySeconds:frequency,scheduleVersion:version,effectiveAt,lastScheduledAt,lastScanAt:r.last_scan_at==null?null:iso(r.last_scan_at),scheduledAt:schedule.dueSlotAt,nextSlotAt:schedule.nextSlotAt,parentTriggerType:schedule.triggerType,parentWindowStart:window.start,parentWindowEnd:window.end,siteWindows:Object.freeze(siteWindows)});
      await c.rollback();begun=false;if(certified)certifiedAnchors.set(value,Object.freeze({repo,isolation,cursorReader,sites:Object.freeze(certifiedSites)}));else anchors.set(value,repo);return value;
    }catch(e){if(begun)try{await c.rollback();}catch{destroyed=true;c.destroy();}throw e;}finally{if(!destroyed)c.release();}
  };
}
function assertScheduledTimeAnchor(value,repo){if(!anchors.has(value)||anchors.get(value)!==repo)fail('OVERSEAS_SCHEDULED_ANCHOR_UNTRUSTED');return value;}
function createScheduledTimeAnchorReader({repo}={}){return createTimeAnchorReader({repo});}
function createCertifiedFixtureTimeAnchorReader({repo,isolation,cursorReader}={}){return createTimeAnchorReader({repo,isolation,cursorReader,certified:true});}
function scheduledTimeAnchorAdmissionContext(value,repo,isolation,cursorReader){
  if(cursorReader!==undefined){const ctx=certifiedAnchors.get(value);if(!ctx||ctx.repo!==repo||ctx.isolation!==isolation||ctx.cursorReader!==cursorReader)fail('OVERSEAS_SCHEDULED_ANCHOR_UNTRUSTED');require('../../server/src/db/overseasScheduledParentStore').assertCertifiedFixtureCursorReader(cursorReader,repo,isolation);return ctx;}
  assertScheduledTimeAnchor(value,repo);return null;
}
module.exports={createScheduledTimeAnchorReader,assertScheduledTimeAnchor,createCertifiedFixtureTimeAnchorReader,scheduledTimeAnchorAdmissionContext};
