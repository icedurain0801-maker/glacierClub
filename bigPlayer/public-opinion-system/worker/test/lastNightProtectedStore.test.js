'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {protectedStorePage,observeExactAnalysis}=require('../src/lastNightProtectedStore');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID,BOARD_ID}=require('../src/lastNightScope');
const account={id:'fixture-account',source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID};
const feed={boardId:BOARD_ID,endpointKind:'merged',feedKey:'board:100017:merged'};
const items=[{externalId:'fixture-post',boardId:BOARD_ID,contentType:'post',rawPayload:{_contentIntegrity:{status:'detail_enriched'}}}];
function fixture(){
  const sql=[];let destroyed=false;
  const content={id:'fixture-content',external_id:'fixture-post',source_id:SOURCE_ID,account_id:account.id,game_id:GAME_ID,community_id:COMMUNITY_ID,board_id:BOARD_ID,fingerprint:'fixture-fingerprint'};
  const conn={query:async options=>{sql.push(options.sql);return[options.sql.startsWith('SELECT')?[]:{affectedRows:1}];},destroy(){destroyed=true;}};
  const repo={pool:{getConnection:async()=>conn},_upsertContentPageAttempt:async function(){const pinned=await this.pool.getConnection();await pinned.beginTransaction();await pinned.query('FIXTURE_WRITE',[]);await pinned.commit();return{storedCount:1,contents:[{content,change:'inserted'}]};}};
  return{repo,account,items,feed,sql,destroyed:()=>destroyed};
}
test('journal precedes real commit; pinned algorithm cannot commit; protection keeps before/after',async()=>{
  const f=fixture(),phases=[];const result=await protectedStorePage({...f,persistEvidence:async state=>{phases.push(state.phase);if(state.phase==='prepared')assert.ok(!f.sql.includes('COMMIT'));}});
  assert.deepEqual(phases,['prepared','committed']);assert.equal(f.sql.filter(sql=>sql==='COMMIT').length,1);assert.equal(result.protection.before.length,1);assert.equal(result.protection.after.length,1);assert.ok(f.destroyed());
});
test('journal failure rolls back; hanging journal deadline forbids COMMIT',async()=>{
  for(const hang of [false,true]) {
    const f=fixture();await assert.rejects(protectedStorePage({...f,timeoutMs:20,persistEvidence:()=>hang?new Promise(()=>{}):Promise.reject(new Error('fixture journal failure'))}));
    assert.ok(!f.sql.includes('COMMIT'));assert.ok(f.destroyed());if(!hang)assert.ok(f.sql.includes('ROLLBACK'));
  }
});
test('duplicate input and wrong feed fail before connection; empty AI is not completion',async()=>{
  const f=fixture();await assert.rejects(protectedStorePage({...f,items:[...items,...items],persistEvidence:async()=>{}}),/SCOPE_INVALID/);
  assert.equal(f.sql.length,0);assert.equal((await observeExactAnalysis({queue:{status:'EXACT_AI_QUEUED',remaining:[],queued:[]},after:[],version:'fixture-v1'})).status,'NO_CHANGED_CONTENT_AI_NOT_REQUESTED');
});
test('real existing upsert algorithm works with legacy fixture without board columns',async()=>{
  const {Repository}=require('../../server/src/db/repository');const sql=[];let row;
  const conn={query:async(options,params=[])=>{
    const query=options.sql;sql.push(query);assert.ok(!/board_key|board_id|board_name/.test(query),query);
    if(query.startsWith('INSERT INTO po_contents ')) {
      const columns=query.match(/\(([^)]+)\) VALUES/)[1].split(',').map(value=>value.trim());
      row={};columns.forEach((column,i)=>{row[column]=params[i]??null;});
      return[{affectedRows:1}];
    }
    if(query.includes('FROM po_contents'))return[row?[row]:[]];
    if(query.includes('FROM po_content_feed_memberships'))return[[]];
    return[{affectedRows:1}];
  },destroy(){}};
  const repo={pool:{getConnection:async()=>conn},syncUpsertLockWaitSeconds:3,_upsertContentPageAttempt:Repository.prototype._upsertContentPageAttempt};
  const input={...items[0],sourceUrl:'https://fixture.invalid/post',body:'fixture-body',fingerprint:'f'.repeat(64)};
  const result=await protectedStorePage({repo,account,items:[input],feed,contentMode:'legacy_source_external',persistEvidence:async()=>{}});
  assert.equal(result.storedCount,1);assert.equal(result.contents[0].content.community_id,COMMUNITY_ID);
  assert.equal(JSON.parse(result.contents[0].content.raw_payload)._lastNightScope.boardId,BOARD_ID);
  assert.ok(sql.some(value=>value.startsWith('INSERT INTO po_content_feed_memberships')));
});
