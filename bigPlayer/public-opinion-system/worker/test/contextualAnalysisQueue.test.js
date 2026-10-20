'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('../../server/src/runtimeEnv').loadRuntimeEnv=()=>false;
const {fixtureAI}=require('../../server/test/fixtures/contextualReview');
const {Q1AnalysisRunner}=require('../src/q1DailyAnalysisRunner');
const {processPersistentAnalysisJobs}=require('../src/worker');
const job=()=>({id:'job1',content_id:'c1',content_type:'comment',body:'맞아요 ㅠㅠ',fingerprint:'fp',content_fingerprint:'fp',game_id:'g',community_id:'cm',source_id:'s',platform:'bigplayer_h5',analysis_root_id:'root',analysis_root_title:'建议开放赠送',analysis_root_body:'资源无法赠送，使用不方便。',lease_owner:'isolated',attempts:1});
for(const kind of ['backlog','daily'])for(const fail of [false,true])test(`${kind} ${fail?'retries review failures without writes or notifications':'passes original post and persists contextual review'}`,async()=>{
 const writes=[],finished=[],notifications=[];
 const fixture=fixtureAI(fail?{review:async()=>{throw Object.assign(new Error('offline'),{code:'URGENT_REVIEW_REQUEST_FAILED'})}}:{});
 const repo={claimAnalysisJobs:async({profile})=>profile==='light'?[job()]:[],getAnalysisCache:async()=>[],enqueueAnalysisJob:async()=>{},insertAnalysis:async(id,a)=>writes.push({id,a}),upsertAnalysisCache:async()=>{},upsertQualityCandidate:async()=>{},finishAnalysisJob:async(id,a)=>finished.push(a),loadKeywordRules:async()=>[]};
 const alertEngine={process:async()=>{notifications.push('notification');return[]}};
 if(kind==='backlog')await processPersistentAnalysisJobs({repo,ai:fixture.ai,alertEngine,analysisMaxAttempts:3},null,[]);
 else await new Q1AnalysisRunner({repo,ai:fixture.ai,alertEngine,maxAttempts:3,log(){}}).processBatch('light');
 assert.equal(fixture.requests.length,1);assert.equal(fixture.requests[0].input.context.root.body,job().analysis_root_body);assert.equal(fixture.requests[0].payload.model,'gpt-5.6-luna');
 assert.deepEqual(notifications,[]);
 if(fail){assert.deepEqual(writes,[]);assert.equal(finished[0].status,'retryable');assert.equal(finished[0].errorCode,'URGENT_REVIEW_REQUEST_FAILED')}
 else{assert.equal(writes.length,1);assert.equal(writes[0].a.sentiment,'negative');assert.equal(writes[0].a.rawAnalysis.urgentReview.contextStatus,'available');assert.equal(finished[0].status,'completed')}
});
