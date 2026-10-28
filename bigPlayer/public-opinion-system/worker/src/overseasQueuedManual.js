'use strict';
const SOURCE='081a16d2-5545-4afd-9c65-e04777e4540b',ACCOUNT='75c8205f-37eb-4bdf-b6a4-f4f502e35658';
const fail=()=>{throw Object.assign(new Error('Queued manual handoff is not pristine'),{code:'OVERSEAS_MANUAL_HANDOFF_INVALID'});};
const iso=v=>{const s=String(v||'');if(!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{3})?$/.test(s))fail();return new Date(s.replace(' ','T')+'Z').toISOString();};
function assertQueuedManual(parent,children,sites){
 const pristine=r=>r.source_id===SOURCE&&r.account_id===ACCOUNT&&r.status==='queued'&&Number(r.attempts)===0&&Number(r.lease_epoch)===0&&!r.lease_owner&&!r.lease_until&&!r.started_at&&!r.finished_at&&!r.error_message&&!r.error_code&&['fetched_count','stored_count','inserted_count','changed_count','unchanged_count','comment_count'].every(k=>Number(r[k]||0)===0);
 if(!parent||!pristine(parent)||parent.parent_run_id!=null||parent.trigger_type!=='manual'||parent.scheduled_at!=null||!parent.id||children.length!==3||sites.length!==3)fail();
 const start=iso(parent.window_start),end=iso(parent.window_end);if(+new Date(start)>=+new Date(end))fail();
 if(new Set(children.map(r=>r.site_id)).size!==3||children.some(r=>!pristine(r)||r.parent_run_id!==parent.id||r.trigger_type!=='scheduled_site'||!sites.some(s=>s.site_id===r.site_id)||iso(r.window_start)!==start||iso(r.window_end)!==end))fail();
 return {kind:'today',manualQueueParent:parent.id,parentId:parent.id,scheduledAt:end,windowStart:start,windowEnd:end};
}
module.exports={assertQueuedManual};
