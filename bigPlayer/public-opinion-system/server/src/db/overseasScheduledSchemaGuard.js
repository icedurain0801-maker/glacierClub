'use strict';
const {REQUIRED_SCHEDULED_COLUMNS}=require('../../../worker/src/overseasScheduledReadiness');
const required={...REQUIRED_SCHEDULED_COLUMNS,
  po_sources:[...REQUIRED_SCHEDULED_COLUMNS.po_sources,'enabled','frequency_seconds','auth_status','auth_expire_at'],
  po_accounts:[...REQUIRED_SCHEDULED_COLUMNS.po_accounts,'auth_expire_at'],
  po_communities:['id','game_id','status'],po_credentials:['id','source_id','account_id','credential_type','status','expire_at','secret_cipher','updated_at'],
  po_sync_runs:[...REQUIRED_SCHEDULED_COLUMNS.po_sync_runs,'started_at','finished_at','next_retry_at'],
  po_overseas_stage_manifests:['run_id','receipt_id','scope_sha256','manifest_sha256','schema_snapshot','schema_sha256','history_snapshot_at','history_sealed','expansion_sealed','expected_count','expected_set_sha256','coverage_status','coverage_reason','admission_json','admission_sha256','created_epoch','updated_epoch'],
  po_overseas_expected_tasks:['run_id','task_identity_sha256']};
const fail=reason=>{throw Object.assign(new Error('Scheduled schema not ready'),{code:'OVERSEAS_SCHEDULED_SCHEMA_NOT_READY',schemaReason:reason});};
// Explicit isolation schema only. This is not the production readiness gate.
async function verifyScheduledIsolationSchema(conn){
  const [columns]=await conn.query('SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
  const [tables]=await conn.query('SELECT TABLE_NAME AS table_name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()');
  const [indexes]=await conn.query('SELECT TABLE_NAME AS table_name,INDEX_NAME AS index_name,NON_UNIQUE AS non_unique,SEQ_IN_INDEX AS seq,COLUMN_NAME AS column_name,SUB_PART AS sub_part FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX');
  const [checks]=await conn.query('SELECT TABLE_NAME AS table_name,CONSTRAINT_NAME AS constraint_name,CHECK_CLAUSE AS clause FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()');
  for(const [table,names] of Object.entries(required)){
    if(tables.filter(r=>r.table_name===table&&r.engine==='InnoDB').length!==1)fail(`engine:${table}`);
    for(const name of names)if(!columns.some(r=>r.table_name===table&&r.column_name===name))fail(`column:${table}.${name}`);}
  const hasIndex=(table,keys,unique)=>{const groups=new Map();for(const r of indexes.filter(r=>r.table_name===table)){const k=r.index_name;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
    return [...groups.values()].some(rs=>rs.every(r=>r.sub_part===null)&&(!unique||rs.every(r=>Number(r.non_unique)===0))&&keys.every((key,i)=>rs[i]?.column_name===key)&&(!unique||rs.length===keys.length));};
  for(const [table,keys,unique] of [['po_sync_runs',['source_id','scheduled_at'],true],['po_sync_runs',['source_id','status'],false],['po_sync_runs',['parent_run_id','site_id'],true],['po_source_schedule_state',['source_id'],true],['po_overseas_stage_manifests',['run_id'],true],['po_overseas_expected_tasks',['run_id','task_identity_sha256'],true]])if(!hasIndex(table,keys,unique))fail(`index:${table}:${keys.join(',')}`);
  // Reject unknown run checks instead of assuming that scheduled_site is legal.
  const runChecks=checks.filter(r=>r.table_name==='po_sync_runs');
  if(runChecks.length!==1||runChecks[0].constraint_name!=='po_os_sched_trigger')fail('check:po_sync_runs');
  // MariaDB 10.4 CHECK_CONSTRAINTS.CHECK_CLAUSE can truncate at 64 bytes.
  // Verify the complete expression from server DDL, not a substring whitelist.
  const [ddlRows]=await conn.query('SHOW CREATE TABLE po_sync_runs');
  if(ddlRows.length!==1)fail('check:po_sync_runs:ddl');
  const ddl=ddlRows[0]['Create Table'];
  const match=typeof ddl==='string'?ddl.match(/CONSTRAINT `po_os_sched_trigger` CHECK \(([^\r\n]+)\)/):null;
  const normalized=match?.[1].replace(/[`\s]/g,'');
  const allowed=["(trigger_typein('manual','scheduled_site')andscheduled_atisnull)or(trigger_typein('scheduled','scheduled_catchup')andscheduled_atisnotnull)","trigger_typein('manual','scheduled_site')andscheduled_atisnullortrigger_typein('scheduled','scheduled_catchup')andscheduled_atisnotnull"];
  if(!allowed.includes(normalized)){
    try{fail('check:po_sync_runs:expression');}catch(e){e.schemaChecks=[{expression:match?.[1]||null}];throw e;}}
  const [types]=await conn.query('SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name,DATA_TYPE AS data_type,DATETIME_PRECISION AS precision_value,IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
  for(const [table,names] of [['po_sync_runs',['scheduled_at','window_start','window_end','started_at','finished_at','lease_until','next_retry_at']],['po_source_schedule_state',['effective_at','last_scheduled_at','next_scheduled_at','last_scan_at','lease_until']],['po_sources',['schedule_effective_at']]])for(const name of names){const rows=types.filter(r=>r.table_name===table&&r.column_name===name);if(rows.length!==1||rows[0].data_type!=='datetime'||Number(rows[0].precision_value)!==3)fail(`type:${table}.${name}`);}
  if(!types.some(r=>r.table_name==='po_sync_runs'&&r.column_name==='trigger_type'&&r.nullable==='NO'))fail('null:po_sync_runs.trigger_type');
  return true;
}
module.exports={verifyScheduledIsolationSchema};
