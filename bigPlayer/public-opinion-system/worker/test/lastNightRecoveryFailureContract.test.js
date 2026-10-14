'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {SOURCE_ID}=require('../src/lastNightScope');
const {diagnoseDetailPage,bindCommittedSession}=require('../src/lastNightRecoveryFailureContract');
test('detail diagnostics expose only hashed identity and fixed status/code allowlist',()=>{
 const result=diagnoseDetailPage([{externalId:'private-id',contentType:'activity',body:'SECRET',rawPayload:{token:'TOKEN',_contentIntegrity:{status:'summary_fallback',code:'DETAIL_RESPONSE_INVALID'}}},{externalId:'x',contentType:'post',rawPayload:{_contentIntegrity:{status:'summary_fallback',code:'secret arbitrary message'}}}]);
 const json=JSON.stringify(result);assert.ok(!/private-id|SECRET|TOKEN|arbitrary/.test(json));assert.equal(result[0].accepted,false);assert.equal(result[0].integrityCode,'DETAIL_RESPONSE_INVALID');assert.equal(result[1].integrityCode,'unclassified');
});
test('dual authenticated journal binding preserves cursor but never grants production execution',()=>{
 const base={phase:'recovery_page_committed',sourceId:SOURCE_ID,accountId:'a',sourceConfig:'config',afterCheckpoint:{cursor:'offset20'},token:{parentId:'parent',accountId:'a',ownerId:'old',epoch:1536}};
 const session={phase:'resume_committed',sourceId:SOURCE_ID,accountId:'a',token:{parentId:'parent',accountId:'a',ownerId:'new',epoch:1537}};
 const input={base,session,baseSha:'a'.repeat(64),sessionSha:'b'.repeat(64),approvedBaseSha:'a'.repeat(64),approvedSessionSha:'b'.repeat(64)};
 const proof=bindCommittedSession(input);assert.equal(proof.token.epoch,1537);assert.equal(proof.afterCheckpoint.cursor,'offset20');assert.equal(proof.failureRecovery.productionAdmitted,false);
 for(const changed of [{session:{...session,token:{...session.token,epoch:1538}}},{approvedSessionSha:'c'.repeat(64)},{session:{...session,accountId:'other'}}])assert.throws(()=>bindCommittedSession({...input,...changed}),{code:'LAST_NIGHT_FAILURE_SESSION_BINDING_INVALID'});
});
