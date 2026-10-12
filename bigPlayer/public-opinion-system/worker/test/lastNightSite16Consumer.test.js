'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {consumeSite16}=require('../src/lastNightSite16Consumer');
const {Repository}=require('../../server/src/db/repository');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('../src/lastNightScope');
test('23 feed consumer calls actual Connector boundary and finalizes partial segment after atomic empty page',async()=>{
 const siteId='site-3bb48be7f9a82185d6a045e9a5cbd3d7',from='2026-10-02T03:07:34.810Z',to='2026-10-09T03:07:34.810Z';
 const account={id:'a',source_id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID};
 const token={parentId:'parent',accountId:'a',ownerId:'owner',epoch:10};
 const descriptors=Array.from({length:23},(_,i)=>({account_id:'a',site_id:'site-f069f4495d534693dd87b2485053e7cd',status:'completed',task_kind:'q1_feed',sync_scope:'posts',root_platform_content_id:'',window_start:from,window_end:to,task_key:`100017:home:merged::${i}:::`}));
 const calls=[],journal=[];let requests=0;
 const q=async(sql,params=[])=>{calls.push({sql,params});
  if(sql.startsWith('SELECT lease_run_id'))return[[{lease_run_id:'parent',lease_owner:'owner',lease_epoch:10,live:1}]];
  if(sql.startsWith('SELECT id,status,account_id')||sql.startsWith('SELECT * FROM po_sync_runs'))return[[{id:'r',status:'running',source_id:SOURCE_ID,account_id:'a',site_id:siteId,lease_owner:'owner',lease_epoch:1,live:1}]];
  if(sql.startsWith('SELECT * FROM po_sync_checkpoints'))return[[]];
  return[{affectedRows:1}];
 };
 const repo=Object.create(Repository.prototype);
 const result=await consumeSite16({query:q,bounded:p=>p,token,runId:'r',runEpoch:1,repo,runtime:{account,source:{config:JSON.stringify({siteUrls:[{siteId,url:'https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=16'}]})}},
  connector:{listComments:async()=>{throw new Error('unexpected');},listFeedContents:async input=>{requests++;assert.equal(input.source.siteId,siteId);assert.equal(input.cursor,null);assert.equal(input.dailyBounded,true);return{items:[],hasMore:false,nextCursor:null};}},
  descriptors,publishedFrom:from,publishedTo:to,persistEvidence:async value=>journal.push(value),commitState:{pending:false},deadlineAt:Date.now()+10000,maxPages:1});
 assert.equal(requests,1);assert.equal(result.segmentStatus,'partial');assert.equal(result.requiresSegmentFinalization,false);assert.equal(result.fullChainComplete,false);
 assert.equal(journal.at(-1).phase,'segment_finish_committed');assert.ok(calls.some(call=>call.sql.includes('lease_owner=NULL,lease_until=NULL,error_code=?')));
});
