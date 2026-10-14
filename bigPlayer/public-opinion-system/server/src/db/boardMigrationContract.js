'use strict';
const versions=['023_unified_source_scheduling.sql','025_worker_scan_leases.sql','026_scheduler_runtime_schema_reconciliation.sql','027_bigplayer_multisite.sql','028_bigplayer_scheduled_site_runs.sql'];
const contracts={
  '029_bigplayer_site_run_evidence.sql':{
    columns:[['po_sync_runs','site_url_snapshot','text','YES'],['po_sync_runs','last_request_at','datetime(3)','YES']],
    indexes:[['po_sync_runs','po_sync_runs_site_request_idx',1,'site_id,last_request_at']]
  },
  '030_bigplayer_board_scope.sql':{
    columns:[['po_sync_runs','community_id','char(36)','YES'],['po_sync_runs','board_id','varchar(32)','YES'],['po_sync_runs','board_name','varchar(255)','YES'],['po_sync_runs','run_scope','varchar(32)','YES'],['po_sync_runs','board_run_identity','char(64)','YES'],['po_contents','board_id','varchar(32)','YES'],['po_contents','board_name','varchar(255)','YES'],['po_contents','board_key','varchar(32)',null]],
    indexes:[['po_sync_runs','po_sync_runs_board_identity_uk',0,'board_run_identity'],['po_contents','po_contents_source_board_external_uk',0,'source_id,board_key,external_id']]
  }
};
function fail(message){const error=new Error(message);error.code='BOARD_MIGRATION_CONTRACT_NOT_READY';throw error;}
async function validateBoardMigration(connection,file,{complete=false}={}){
  const contract=contracts[file];if(!contract)return;
  const [ledger]=await connection.query('SELECT version FROM po_schema_migrations');
  const applied=new Set(ledger.map(row=>row.version));
  const required=file.startsWith('030')?[...versions,'029_bigplayer_site_run_evidence.sql']:versions;
  const missing=required.filter(version=>!applied.has(version));if(missing.length)fail('missing prerequisites: '+missing.join(','));
  if(file.startsWith('030'))await validateBoardMigration(connection,'029_bigplayer_site_run_evidence.sql',{complete:true});
  const [columns]=await connection.query("SELECT table_name,column_name,column_type,is_nullable,column_default,extra,generation_expression FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN ('po_sync_runs','po_contents')");
  const [indexes]=await connection.query("SELECT table_name,index_name,non_unique,GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_list,SUM(sub_part IS NOT NULL) AS prefix_columns FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN ('po_sync_runs','po_contents') GROUP BY table_name,index_name,non_unique");
  if(!columns.some(row=>row.table_name==='po_sync_runs'&&row.column_name==='site_id'&&row.column_type==='varchar(120)'))fail('site_id prerequisite missing or wrong type');
  for(const [table,name,type,nullable]of contract.columns){
    const row=columns.find(row=>row.table_name===table&&row.column_name===name);
    if(!row){if(complete)fail('missing column: '+table+'.'+name);continue;}
    if(row.column_type.toLowerCase()!==type||(nullable&&row.is_nullable!==nullable))fail('column definition drift: '+table+'.'+name);
    if(name!=='board_key'&&(/GENERATED/i.test(row.extra)||!(row.column_default===null||row.column_default==='NULL')))fail('column generation/default drift: '+table+'.'+name);
    if(name==='board_key'&&(!/STORED GENERATED/i.test(row.extra)||String(row.generation_expression).replace(/[`\s]/g,'').toLowerCase()!=="coalesce(board_id,'legacy')"))fail('board_key generation drift');
  }
  for(const [table,name,nonUnique,fields]of contract.indexes){
    const row=indexes.find(row=>row.table_name===table&&row.index_name===name);
    if(!row){if(complete)fail('missing index: '+table+'.'+name);continue;}
    if(Number(row.non_unique)!==nonUnique||row.columns_list!==fields||Number(row.prefix_columns)!==0)fail('index definition drift: '+table+'.'+name);
  }
  if(complete&&file.startsWith('030')&&indexes.some(row=>row.table_name==='po_contents'&&['po_contents_source_external_uk','po_contents_source_fingerprint_uk'].includes(row.index_name)))fail('legacy content unique indexes remain');
}
module.exports={validateBoardMigration};
