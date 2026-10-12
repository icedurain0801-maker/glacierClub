'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {canonical}=require('../src/overseasBigPlayerRunContractJournal');
const {projectParentEvidence,projectParentLockOrder,assertParentLockOrder}=require('../src/overseasParentEvidencePolicy');
const hash=v=>crypto.createHash('sha256').update(canonical(v)).digest('hex');
function fixture(statuses=['success','success']){
  const expectedChildren=statuses.map((_,i)=>{
    const taskIdentities=[hash(['task',i,0]),hash(['task',i,1])].sort(),manifest={expansionSealed:true,taskIdentities,taskSetSha256:hash(taskIdentities)};
    return {runId:`run${i}`,siteId:`site${i}`,windowStart:'2026-10-08T00:00:00.000Z',windowEnd:'2026-10-09T00:00:00.000Z',owner:'fake-owner',taskIdentities,manifestSha256:hash(manifest)};
  }),pins={};
  const children=expectedChildren.map((scope,i)=>{
    const status=statuses[i];if(['queued','running'].includes(status)){pins[scope.runId]=null;return {runId:scope.runId,siteId:scope.siteId,status,raw:null};}
    const binding=Object.fromEntries(['runId','siteId','windowStart','windowEnd','owner'].map(k=>[k,scope[k]]));
    const checkpoints=scope.taskIdentities.map((taskIdentity,n)=>({...binding,id:`cp${i}-${n}`,epoch:1,taskIdentity,status:status==='success'?'completed':'failed',cursor:status==='success'?null:'safe20',lastItemAt:'2026-10-08T12:00:00.000Z'})),checkpointSetSha256=hash(checkpoints);
    const manifest={expansionSealed:true,taskIdentities:scope.taskIdentities,taskSetSha256:hash(scope.taskIdentities)};
    const audit={id:`a${i}`,runId:scope.runId,owner:scope.owner,epoch:1,status,manifestSha256:scope.manifestSha256,checkpointSetSha256};
    const e={...binding,batchId:'batch',epoch:1,status,sealed:true,manifest,audit,terminal:{runId:scope.runId,owner:scope.owner,epoch:1,status,auditSha256:hash(audit)},checkpoints,checkpointSetSha256};pins[scope.runId]=hash(e);return {runId:scope.runId,siteId:scope.siteId,status,raw:canonical(e)};
  });return {batchId:'batch',expectedChildren,pins,children};
}
test('fixed successful child/audit/CP evidence projects no write authority',()=>{const r=projectParentEvidence(fixture());assert.equal(r.status,'success');assert.equal(r.cursorCandidates.length,2);assert.equal(r.automaticWriteAllowed,false);});
test('partial failed manual pending policies never promote successful cursor',()=>{for(const [statuses,status] of [[['partial','partial'],'partial'],[['failed','failed'],'failed'],[['success','failed'],'partial'],[['success','awaiting_manual_verification'],'awaiting_manual_verification'],[['success','running'],'awaiting_children']]){const r=projectParentEvidence(fixture(statuses));assert.equal(r.status,status);assert.deepEqual(r.cursorCandidates,[]);}});
test('missing duplicate child, fixed hash or batch drift fails',()=>{for(const change of [f=>f.children.pop(),f=>f.children[1]=f.children[0],f=>f.batchId='other',f=>f.pins.run0='f'.repeat(64)]){const f=fixture();change(f);assert.throws(()=>projectParentEvidence(f));}});
test('repinned seal audit CP epoch/hash half-open endpoint drift rejects',()=>{for(const change of [e=>e.sealed=false,e=>e.audit.epoch=2,e=>e.checkpoints[0].epoch=2,e=>e.checkpoints[0].lastItemAt=e.windowEnd,e=>e.checkpoints=[],e=>e.terminal.auditSha256='f'.repeat(64)]){const f=fixture(),e=JSON.parse(f.children[0].raw);change(e);f.children[0].raw=canonical(e);f.pins.run0=hash(e);assert.throws(()=>projectParentEvidence(f));}});
test('fake ordered lock projection rejects reverse/missing/duplicate stages',()=>{const g={run:['z','a'],source:['s'],state:['st'],identity:['i'],'manifest/tasks':['m'],CP:['cp'],audit:['a']},expected=projectParentLockOrder(g);assert.deepEqual(expected.slice(0,2).map(x=>x.id),['a','z']);assert.equal(assertParentLockOrder(g,expected),true);assert.throws(()=>assertParentLockOrder(g,[...expected].reverse()));assert.throws(()=>assertParentLockOrder(g,expected.filter(x=>x.stage!=='state')));});
test('repinned CP subset cannot replace independent complete task manifest',()=>{const f=fixture(),e=JSON.parse(f.children[0].raw);e.checkpoints.pop();e.checkpointSetSha256=hash(e.checkpoints);e.audit.checkpointSetSha256=e.checkpointSetSha256;e.terminal.auditSha256=hash(e.audit);f.children[0].raw=canonical(e);f.pins.run0=hash(e);assert.throws(()=>projectParentEvidence(f));});
