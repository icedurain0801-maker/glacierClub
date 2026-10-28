'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
require('../../server/src/runtimeEnv').loadRuntimeEnv=()=>false;
const {fixtureAI,firstPass}=require('../../server/test/fixtures/contextualReview');
const {defaultPolicy}=require('../../server/src/services/aiAnalysisPolicy');
const {Q1AnalysisRunner}=require('../src/q1DailyAnalysisRunner');
const {processPersistentAnalysisJobs}=require('../src/worker');
for(const kind of ['backlog','daily'])for(const fail of [false,true])test(`${kind} quality snapshot ${fail?'write failure retries':'reaches candidate admission'}`,async()=>{
 const p=defaultPolicy();Object.assign(p.quality,{minScore:.6,minBodyLength:10,rule:'本社区优先推荐详细攻略'});
 const job={id:'job',content_id:'c',content_type:'post',body:'字'.repeat(10),fingerprint:'fp',content_fingerprint:'fp',game_id:'g',community_id:'cm',source_id:'s',platform:'bigplayer_h5',lease_owner:'isolated',attempts:1,analysis_policy:JSON.stringify(p)};
 const {ai}=fixtureAI({level:'L0'});ai.request=async()=>{const value=firstPass('L0');value.answers.sentiment.choice='neutral';value.answers.quality.score=3;value.answers.recommend_home.noul=1;return value};
 ai.qualityExplainer={explain:async()=>({status:'generated',reason:'提供具体游戏攻略和步骤，具有参考价值。'})};
 const candidates=[],finished=[];
 const repo={enqueueAnalysisJob:async()=>{},claimAnalysisJobs:async({profile})=>profile==='light'?[job]:[],getAnalysisCache:async()=>[],insertAnalysis:async()=>{},upsertAnalysisCache:async()=>{},upsertQualityCandidate:async(id,a)=>{candidates.push({id,a});if(fail)throw Object.assign(new Error('isolated failure'),{code:'QUALITY_TEST_FAILURE'})},finishAnalysisJob:async(id,a)=>finished.push(a),loadKeywordRules:async()=>[]};
 if(kind==='backlog')await processPersistentAnalysisJobs({repo,ai,analysisMaxAttempts:3},null,[]);else await new Q1AnalysisRunner({repo,ai,maxAttempts:3,log(){}}).processBatch('light');
 assert.equal(candidates.length,1);assert.equal(candidates[0].id,'c');assert.deepEqual(candidates[0].a.qualityPolicy,p.quality);assert.equal(candidates[0].a.body,job.body);assert.equal(candidates[0].a.contentType,'post');
 assert.equal(finished[0].status,fail?'retryable':'completed');
});
