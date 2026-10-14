'use strict';
const REQUIRED={
  store:{po_contents:['id','source_id','game_id','community_id','account_id','external_id','fingerprint','raw_payload','last_seen_at'],
    po_content_feed_memberships:['id','account_id','content_id','feed_key','page_kind','section_id','feed_metadata','last_seen_at'],
    po_analysis_jobs:['id','content_id','analysis_profile','analysis_version','content_fingerprint','status','lease_owner'],
    po_analyses:['content_id','analysis_level','analysis_version','content_fingerprint','analyzed_at']},
  daily:{po_sync_runs:['source_id','account_id','community_id','board_id','site_url_snapshot','run_scope','board_run_identity','scheduled_at','site_id','parent_run_id','window_start','window_end','lease_owner','lease_until','lease_epoch']}
};
async function inspectWriteSchema(repo,stage) {
  const required=REQUIRED[stage];if(!required)throw new Error('LAST_NIGHT_SCHEMA_STAGE_INVALID');
  const missing=[],presentByTable={};
  for(const [table,columns] of Object.entries(required)) {
    const rows=await repo.query('SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
    const present=new Set(rows.map(row=>String(row.column_name).toLowerCase()));
    presentByTable[table]=[...present];
    for(const column of columns)if(!present.has(column))missing.push(`${table}.${column}`);
  }
  if(stage==='store') {
    const present=new Set(presentByTable.po_contents);
    const boardColumns=['board_key','board_id','board_name'].filter(column=>present.has(column));
    if(boardColumns.length>0&&boardColumns.length<3)missing.push('po_contents.partial_board_schema_unsupported');
  }
  return {status:missing.length?'LAST_NIGHT_WRITE_SCHEMA_NOT_READY':'LAST_NIGHT_WRITE_SCHEMA_READY',stage,missing,
    contentMode:stage==='store'&&!(presentByTable.po_contents.includes('board_key')&&presentByTable.po_contents.includes('board_id'))?'legacy_source_external':'board_columns',presentByTable};
}
module.exports={inspectWriteSchema};
