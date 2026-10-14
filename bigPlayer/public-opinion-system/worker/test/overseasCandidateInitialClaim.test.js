'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createCandidateInitialClaim,assertCandidateInitialClaim}=require('../src/overseasCandidateInitialClaim');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
function binding(){const siteUrl='https://club-en.q1.com/?env=1&gameId=2&gameVersion=1&languageId=1';return {runId:id(1),sourceId:id(2),accountId:id(3),gameId:id(4),communityId:id(5),siteId:'site-en',boardId:'100017',siteUrl,siteUrlSha256:crypto.createHash('sha256').update(siteUrl).digest('hex'),windowStart:'2026-10-08T00:00:00.000Z',windowEnd:'2026-10-09T00:00:00.000Z',manifestSha256:'a'.repeat(64)};}
test('exact queued0 CAS wins once; repeated or expired row never increments epoch',async()=>{
 const b=binding(),calls=[];let claimed=false,owner;
 const repo={query:async(sql,p)=>{calls.push({sql,p});if(sql.startsWith('UPDATE ')){
  assert.match(sql,/status='queued' AND lease_epoch=0 AND attempts=0/);assert.match(sql,/parent_run_id IS NULL AND trigger_type='manual'/);assert.doesNotMatch(sql,/\bOR\b|lease_epoch=lease_epoch/);
  assert.deepEqual(p.slice(2),[b.runId,b.sourceId,b.accountId,b.siteId,'2026-10-08 00:00:00.000','2026-10-09 00:00:00.000']);
  if(claimed)return {affectedRows:0};claimed=true;owner=p[0];return {affectedRows:1};
 }return [{id:b.runId,source_id:b.sourceId,account_id:b.accountId,site_id:b.siteId,window_start:b.windowStart,window_end:b.windowEnd,parent_run_id:null,trigger_type:'manual',sync_mode:'incremental',scheduled_at:null,status:'running',lease_owner:owner,lease_epoch:1,attempts:1}];}};
 const claim=createCandidateInitialClaim({repo,manifestSha256:b.manifestSha256,initialRunBindings:[b]});assert.equal(assertCandidateInitialClaim(claim,repo),claim);
 assert.equal((await claim({runId:b.runId,leaseOwner:'isolated'})).lease_epoch,1);assert.equal(await claim({runId:b.runId,leaseOwner:'other'}),null);assert.equal(calls.length,3);
});
test('unauthorized run/account and copied capability fail without SQL',async()=>{
 const b=binding();let writes=0;const repo={query:async()=>{writes++;throw Error('unexpected');}},claim=createCandidateInitialClaim({repo,manifestSha256:b.manifestSha256,initialRunBindings:[b]});
 for(const patch of [{runId:id(9)},{accountId:id(9)}])await assert.rejects(claim({runId:b.runId,leaseOwner:'isolated',...patch}),{code:'OVERSEAS_INITIAL_CLAIM_UNVERIFIED'});
 assert.throws(()=>assertCandidateInitialClaim(claim,{...repo}),{code:'OVERSEAS_INITIAL_CLAIM_UNVERIFIED'});assert.throws(()=>assertCandidateInitialClaim(claim.bind(null),repo),{code:'OVERSEAS_INITIAL_CLAIM_UNVERIFIED'});
 assert.throws(()=>createCandidateInitialClaim({repo,manifestSha256:b.manifestSha256,initialRunBindings:[{...b,leaseOwner:'x',leaseEpoch:1}]}),{code:'OVERSEAS_INITIAL_CLAIM_UNVERIFIED'});assert.equal(writes,0);
});
test('unknown ACK has no retry or ordinary fallback',async()=>{
 const b=binding();let calls=0;const error=Error('synthetic ACK loss'),repo={query:async()=>{calls++;throw error;}};
 const claim=createCandidateInitialClaim({repo,manifestSha256:b.manifestSha256,initialRunBindings:[b]});await assert.rejects(claim({runId:b.runId,leaseOwner:'isolated'}),e=>e===error);assert.equal(calls,1);
});
