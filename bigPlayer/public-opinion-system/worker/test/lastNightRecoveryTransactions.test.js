'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {queueExactChanges,restoreExistingContentCAS}=require('../src/lastNightProtectedStore');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID,BOARD_ID}=require('../src/lastNightScope');
const account={id:'fixture',source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID};
const row={id:'fixture-content',external_id:'fixture-post',source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID,account_id:account.id,fingerprint:'new',raw_payload:JSON.stringify({_lastNightScope:{boardId:BOARD_ID}}),body:'new'};
function fixture({running=false,stale=false,unknown=false,hang=false,conflict=false}={}) {
  const sql=[];let destroyed=false,force;
  const previous={id:'fixture-job',status:running?'running':'completed',lease_owner:running?'other':null,content_fingerprint:stale?'old':'new'};
  const conn={query:async options=>{
    sql.push(options.sql);if(hang)return new Promise(()=>{});
    if(options.sql==='COMMIT'&&unknown)throw new Error('fixture lost ACK');
    if(options.sql.includes('GET_LOCK'))return[[{acquired:1}]];
    if(options.sql.includes('FROM po_sync_runs'))return[[]];
    if(options.sql.includes('FROM po_contents'))return[[conflict?{...row,body:'foreign-change'}:row]];
    if(options.sql.includes('FROM po_analysis_jobs'))return[options.sql.startsWith('SELECT *')?[previous]:[]];
    return[{affectedRows:1}];
  },destroy(){destroyed=true;}};
  const repo={pool:{getConnection:async()=>conn},enqueueAnalysisJob:async function(_id,input){force=input.force;await this.query('FIXTURE_ENQUEUE');return{...previous,status:'pending',content_fingerprint:'new'};}};
  return{repo,sql,getForce:()=>force,destroyed:()=>destroyed};
}
test('exact stale completed resets only leased-free job; running blocks without enqueue',async()=>{
  for(const running of [false,true]) {
    const f=fixture({stale:true,running});const result=await queueExactChanges({...f,account,contents:[{content:row,change:'changed'}],version:'fixture-v1',contentMode:'legacy_source_external'});
    assert.equal(result.status,running?'STORE_COMMITTED_QUEUE_INCOMPLETE':'EXACT_AI_QUEUED');
    assert.equal(f.getForce(),running?undefined:true);assert.equal(result.remaining.length,running?1:0);assert.ok(f.destroyed());
  }
});
test('queue commit unknown retains exact ID, total deadline returns without new work',async()=>{
  for(const options of [{unknown:true},{hang:true}]) {
    const f=fixture(options);const result=await queueExactChanges({...f,account,contents:[{content:row,change:'inserted'}],version:'fixture-v1',contentMode:'legacy_source_external',timeoutMs:20});
    assert.equal(result.status,'STORE_COMMITTED_QUEUE_INCOMPLETE');assert.equal(result.remaining[0].id,row.id);
    assert.equal(result.errorCode,options.unknown?'LAST_NIGHT_QUEUE_COMMIT_UNKNOWN':'LAST_NIGHT_QUEUE_TIMEOUT');assert.ok(f.destroyed());
  }
});
test('legacy restore CAS conflict, timeout and COMMIT unknown are never success',async()=>{
  const evidence={phase:'committed',sourceId:SOURCE_ID,accountId:account.id,boardId:BOARD_ID,contentMode:'legacy_source_external',before:[{externalId:row.external_id,content:{...row,body:'old'}}],after:[{externalId:row.external_id,content:row,change:'changed'}]};
  for(const options of [{unknown:true},{hang:true},{conflict:true},{}]) {
    const f=fixture(options);const promise=restoreExistingContentCAS({...f,evidence,timeoutMs:20});
    if(Object.keys(options).length)await assert.rejects(promise,error=>error.code===(options.unknown?'LAST_NIGHT_COMPENSATION_COMMIT_UNKNOWN':options.hang?'LAST_NIGHT_COMPENSATION_TIMEOUT':'LAST_NIGHT_COMPENSATION_CAS_CONFLICT'));
    else assert.equal((await promise).status,'EXISTING_CONTENT_RESTORED_NEW_HISTORY_RETAINED');
    assert.ok(f.destroyed());if(options.unknown)assert.ok(!f.sql.includes('ROLLBACK'));
  }
});
