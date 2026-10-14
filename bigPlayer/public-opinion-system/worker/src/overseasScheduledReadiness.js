'use strict';
const inspectors = new WeakMap();
const fail = () => { throw Object.assign(new Error('Scheduled readiness invalid'), { code: 'OVERSEAS_SCHEDULED_READINESS_INVALID' }); };
const REQUIRED = Object.freeze({
 po_sources: Object.freeze(['id','game_id','community_id','platform','config','default_account_id','schedule_version','schedule_effective_at']),
 po_games: Object.freeze(['id','region_code','enabled']),
 po_accounts: Object.freeze(['id','source_id','game_id','community_id','platform','enabled','auth_status']),
 po_source_sites: Object.freeze(['source_id','site_id','url','url_hash','enabled']),
 po_sync_runs: Object.freeze(['id','source_id','account_id','site_id','parent_run_id','trigger_type','status','sync_mode','scheduled_at','window_start','window_end','schedule_version','lease_owner','lease_epoch','lease_until','attempts']),
 po_source_schedule_state: Object.freeze(['source_id','schedule_version','effective_at','last_scheduled_at','next_scheduled_at','last_scan_at','lease_run_id','lease_owner','lease_epoch','lease_until','last_status','last_reason_code'])
});
const UNPROVEN=Object.freeze(['SCHEDULED_ATOMIC_ADMISSION','PARENT_CHILD_IDENTITY_FENCE','SCHEDULED_FIRST_CLAIM_AND_RECOVERY','SCHEDULED_LEDGER_AND_ATOMIC_TERMINAL','UNIQUE_AND_CHECK_CONSTRAINTS']);
// Read-only inventory, deliberately not an activation gate.
function createOverseasScheduledReadiness({repo}={}) {
 if(typeof repo?.query!=='function')fail();
 const inspect=async()=>{
  const rows=await repo.query('SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=DATABASE()');
  if(!Array.isArray(rows))fail();const available=new Map();
  for(const row of rows){if(typeof row?.table_name!=='string'||typeof row?.column_name!=='string')fail();
   if(!available.has(row.table_name))available.set(row.table_name,new Set());available.get(row.table_name).add(row.column_name);}
  const missing=Object.freeze(Object.entries(REQUIRED).flatMap(([table,columns])=>columns.filter(column=>!available.get(table)?.has(column)).map(column=>`${table}.${column}`)));
  return Object.freeze({format:'overseas-scheduled-readiness-v1',ready:false,requiredColumnsPresent:missing.length===0,missing,unproven:UNPROVEN,
   reasonCode:missing.length?'OVERSEAS_SCHEDULED_SCHEMA_INCOMPLETE':'OVERSEAS_SCHEDULED_IMPLEMENTATION_INCOMPLETE',productionActivationAllowed:false});
 };inspectors.set(inspect,repo);return inspect;
}
function assertScheduledReadinessInspector(inspect,repo){if(!inspectors.has(inspect)||inspectors.get(inspect)!==repo)fail();return inspect;}
module.exports={createOverseasScheduledReadiness,assertScheduledReadinessInspector,REQUIRED_SCHEDULED_COLUMNS:REQUIRED};
