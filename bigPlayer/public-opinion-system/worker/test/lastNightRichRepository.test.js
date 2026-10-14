'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {Repository}=require('../../server/src/db/repository');
const {normalizeIndependentPost}=require('../src/lastNightIndependentContent');
const {legacyInsert,legacyItem}=require('../src/lastNightLegacyContentContract');
const {richContentQuery}=require('../src/lastNightRichContentQuery');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('../src/lastNightScope');
test('frozen normalize -> actual Repository legacy insert readback -> actual AI enqueue preserves rich truth',async()=>{
 const account={id:'a',source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID};const feed={boardId:'100017',feedKey:'100017:home:merged::0:::'};
 const detail={id:'p',isDeleted:true,content:[{type:5,data:'opaque not text'}]},detailHash=crypto.createHash('sha256').update(JSON.stringify(detail)).digest('hex');
 const item=normalizeIndependentPost({externalId:'p',contentType:'post',sourceUrl:'https://club-en.q1.com/',title:'title',body:'',publishedAt:'2026-10-08T00:00:00Z',isDeleted:true,rawPayload:{_contentIntegrity:{status:'detail_enriched'},_lastNightProviderDetail:detail,_lastNightProviderDetailSha256:detailHash,_lastNightAnalysisBasis:{bodyTextAvailable:false,opaqueAnalyzed:false}}},feed);
 assert.equal(item.isDeleted,false); // Known frozen defect MUST be corrected at SQL boundary.
 let saved;const calls=[];
 const q=richContentQuery(async(sql,params)=>{calls.push({sql,params});
  if(sql.startsWith('SELECT r.id'))return[[{id:'r'}]];
  if(sql.startsWith('SELECT * FROM po_contents'))return[saved?[saved]:[]];
  if(sql.startsWith('INSERT INTO po_contents')){const columns=sql.match(/\(([^)]+)\) VALUES/)[1].split(',').map(value=>value.trim());saved=Object.fromEntries(columns.slice(0,params.length).map((key,index)=>[key,params[index]]));}
  if(sql.startsWith('SELECT * FROM po_analysis_jobs'))return[[{id:'job'}]];
  return[{affectedRows:1}];
 });
 const conn={query:async(sql,params)=>{const legacy=legacyInsert(sql,params);return q(legacy.sql,legacy.params);},beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}};
 const repo=Object.create(Repository.prototype);repo.syncUpsertLockWaitSeconds=3;repo.pool={getConnection:async()=>conn};
 const result=await repo._upsertContentPageAttempt({account,items:[legacyItem(item)],syncScope:'posts',syncRunId:'r',leaseOwner:'o',feed});
 assert.equal(result.contents[0].content.is_deleted,1);assert.equal(saved.body,'');assert.notEqual(saved.fingerprint,item.fingerprint);
 const raw=JSON.parse(saved.raw_payload);assert.deepEqual(raw._lastNightProviderDetail,detail);assert.equal(raw._lastNightProviderDetailSha256,detailHash);assert.equal(raw._lastNightAnalysisBasis.bodyTextAvailable,false);
 repo.query=async(sql,params)=>(await q(sql,params))[0];await repo.enqueueAnalysisJob(saved.id,{profile:'light',version:'sentiment-v1',contentFingerprint:saved.fingerprint});
 const job=calls.find(call=>call.sql.startsWith('INSERT INTO po_analysis_jobs'));assert.equal(job.params[4],saved.fingerprint);assert.equal(job.params[7],'LAST_NIGHT_CONTENT_DELETED');assert.ok(job.sql.endsWith('id=id'));
});
