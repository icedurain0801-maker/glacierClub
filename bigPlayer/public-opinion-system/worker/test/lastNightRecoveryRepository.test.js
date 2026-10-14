'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Repository}=require('../../server/src/db/repository');
const {legacyInsert,legacyItem}=require('../src/lastNightLegacyContentContract');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('../src/lastNightScope');
test('actual Repository page SQL and actual AI enqueue use pinned legacy transaction and expected fingerprint',async()=>{
 const calls=[];let inserted;const account={id:'a',source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID};
 const item=legacyItem({externalId:'p',contentType:'post',body:'detail',fingerprint:'fp',rawPayload:{_contentIntegrity:{status:'detail_enriched'}}});
 const conn={query:async(sql,params=[])=>{
  const adapted=legacyInsert(sql,params);calls.push(adapted);
  if(sql.startsWith('SELECT r.id'))return[[{id:'r'}]];
  if(sql.startsWith('SELECT * FROM po_contents'))return[inserted?[inserted]:[]];
  if(sql.startsWith('INSERT INTO po_contents')){assert.ok(!/\bboard_id\b|\bboard_name\b/.test(adapted.sql));inserted={id:adapted.params[0],external_id:'p',fingerprint:'fp',source_id:SOURCE_ID,account_id:'a',game_id:GAME_ID,community_id:COMMUNITY_ID,raw_payload:JSON.stringify(item.rawPayload)};}
  if(sql.startsWith('SELECT * FROM po_analysis_jobs'))return[[{id:'j',content_id:inserted.id,content_fingerprint:'fp'}]];
  return[{affectedRows:1}];
 },beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}};
 const repo=Object.create(Repository.prototype);repo.syncUpsertLockWaitSeconds=3;repo.pool={getConnection:async()=>conn};
 const result=await repo._upsertContentPageAttempt({account,items:[item],syncScope:'posts',syncRunId:'r',leaseOwner:'owner',feed:{boardId:'100017',feedKey:'100017:home:merged::0:::'}});
 assert.equal(result.contents.length,1);assert.equal(result.contents[0].content.fingerprint,'fp');
 repo.query=async(sql,params)=>(await conn.query(sql,params))[0];
 const job=await repo.enqueueAnalysisJob(inserted.id,{profile:'light',version:'sentiment-v1',contentFingerprint:'fp'});
 assert.equal(job.content_fingerprint,'fp');
 const queue=calls.find(call=>call.sql.startsWith('INSERT INTO po_analysis_jobs'));assert.deepEqual(queue.params.slice(1,5),[inserted.id,'light','sentiment-v1','fp']);
 assert.ok(calls.some(call=>call.sql.startsWith('INSERT IGNORE INTO po_sync_run_contents')));
});
