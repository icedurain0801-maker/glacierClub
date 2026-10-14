'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspectWriteSchema}=require('../src/lastNightWriteSchema');
test('known missing production run columns fail closed with concrete names, no writes',async()=>{
  const sql=[];const repo={query:async value=>{sql.push(value);return[{column_name:'id'},{column_name:'source_id'}];}};
  const result=await inspectWriteSchema(repo,'daily');assert.equal(result.status,'LAST_NIGHT_WRITE_SCHEMA_NOT_READY');
  assert.ok(result.missing.includes('po_sync_runs.community_id'));assert.ok(result.missing.includes('po_sync_runs.site_url_snapshot'));assert.ok(sql.every(value=>value.startsWith('SELECT')));
});
test('known legacy content schema accepted, partial board schema rejected',async()=>{
  const columns=['id','source_id','game_id','community_id','account_id','external_id','fingerprint','raw_payload','last_seen_at','content_id','feed_key','page_kind','section_id','feed_metadata','analysis_profile','analysis_version','content_fingerprint','status','lease_owner','analysis_level','analyzed_at'];
  for(const partial of [false,true]) {
    const result=await inspectWriteSchema({query:async(_sql,[table])=>[...columns,...(partial&&table==='po_contents'?['board_id']:[])].map(column_name=>({column_name}))},'store');
    assert.equal(result.status,partial?'LAST_NIGHT_WRITE_SCHEMA_NOT_READY':'LAST_NIGHT_WRITE_SCHEMA_READY');
    if(!partial)assert.equal(result.contentMode,'legacy_source_external');
  }
});
