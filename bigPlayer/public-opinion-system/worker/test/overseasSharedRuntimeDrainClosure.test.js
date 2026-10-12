'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createDrainController}=require('../src/workerDrainController');
const {createOverseasSharedRuntimeLifecycle}=require('../src/overseasSharedRuntimeLifecycle');
// Explicit memory dependencies: no env loading, SQL, transport or recovery proof.
require('../../server/src/runtimeEnv').loadRuntimeEnv=()=>{};
const {runOnce}=require('../src/worker');
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const idle=()=>({scanIdle:true,pollIdle:true,renewalsIdle:true,commitLanesIdle:true,leaseReleased:true});
const ticks=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('actual runOnce blocked queue read and independent cleanup ticket are joined before close',async()=>{
  const read=gate(),entered=gate(),cleanupEntered=gate(),releaseGate=gate(),releaseEntered=gate(),candidateGate=gate(),candidateEntered=gate(),events=[],drain=createDrainController();
  let leaseReleased=false,scanDone=false,cleanup;
  const deps={drainController:drain,leaseOwner:'isolated-drain',sourceConcurrency:1,unifiedScheduler:{mode:'off'},
    scanLease:{acquire:async()=>{events.push('scan-acquired');return {};},renew:async()=>true,release:async()=>{events.push('scan-release-entered');releaseEntered.resolve();await releaseGate.promise;leaseReleased=true;events.push('scan-released');}},
    repo:{pool:{end:async()=>events.push('pool-ended')},health:async()=>{},listRunnableSyncRuns:async()=>{entered.resolve();return read.promise;},listManualDueSources:async()=>{throw Error('post-drain manual read');},listDueSources:async()=>{throw Error('post-drain due read');},enqueueMissingAnalysis:async()=>{throw Error('post-drain backlog');}},
    closeOverseasCandidate:async()=>{events.push('candidate-entered');candidateEntered.resolve();await candidateGate.promise;events.push('candidate-closed');}};
  assert.equal(Object.hasOwn(deps.repo,'query'),false);assert.equal(deps.unifiedScheduler.mode,'off');
  const runtime=createOverseasSharedRuntimeLifecycle({deps,scan:async rd=>{
    cleanup=rd.drainController.admit();assert.ok(cleanup);cleanupEntered.resolve();
    try{return await runOnce(rd);}finally{scanDone=true;events.push('scan-returned');}
  },stopAdmissions:async()=>events.push('admissions-stopped'),verifyQuiescent:async()=>{assert.equal(scanDone,true);assert.equal(leaseReleased,true);assert.equal(drain.stats().active,0);events.push('quiescent');return idle();},readRollbackInventory:async()=>{throw Error('rollback not requested');}});
  const running=runtime.run();await cleanupEntered.promise;await entered.promise;
  assert.equal(runtime.run(),running);assert.equal(drain.stats().active,3);
  const closing=runtime.close();assert.equal(runtime.close(),closing);assert.equal(drain.admit(),null);
  assert.equal((await runtime.run()).reasonCode,'WORKER_ADMISSION_PAUSED');await ticks();
  assert.equal(events.includes('quiescent'),false);assert.equal(events.includes('pool-ended'),false);
  read.resolve([]);await releaseEntered.promise;await ticks();
  assert.equal(scanDone,false);assert.equal(leaseReleased,false);assert.equal(drain.stats().active,3);
  assert.equal(events.includes('quiescent'),false);assert.equal(events.includes('pool-ended'),false);
  releaseGate.resolve();assert.equal((await running).reasonCode,'WORKER_DRAINING');await ticks();
  assert.equal(leaseReleased,true);assert.equal(drain.stats().active,1);assert.equal(events.includes('quiescent'),false);
  cleanup.release();cleanup.release();await candidateEntered.promise;
  assert.equal(drain.stats().active,0);assert.equal(events.includes('pool-ended'),false);
  candidateGate.resolve();assert.equal((await closing).status,'CLOSED');
  assert.deepEqual(events,['scan-acquired','admissions-stopped','scan-release-entered','scan-released','scan-returned','quiescent','candidate-entered','candidate-closed','pool-ended']);
  assert.equal(runtime.productionActivationAllowed,false);
});
test('unknown quiescence rejects close without closing candidate or pool',async()=>{
  const variants=[null,undefined,...Object.keys(idle()).flatMap(key=>[{},undefined,'true',1,false].map(value=>{const v=idle();if(value&&typeof value==='object')delete v[key];else v[key]=value;return v;}))];
  for(const evidence of variants){const events=[],runtime=createOverseasSharedRuntimeLifecycle({deps:{repo:{pool:{end:async()=>events.push('pool')}},closeOverseasCandidate:async()=>events.push('candidate')},scan:async()=>{},stopAdmissions:async()=>{},verifyQuiescent:async()=>evidence,readRollbackInventory:async()=>({})});await assert.rejects(runtime.close(),{code:'OVERSEAS_SHARED_DRAIN_UNPROVEN'});assert.equal(runtime.status(),'BLOCKED');assert.deepEqual(events,[]);await assert.rejects(runtime.rollbackAssessment(),{code:'OVERSEAS_SHARED_ROLLBACK_UNAVAILABLE'});}
});
test('quiescence or candidate cleanup exceptions cannot fall through to pool end',async()=>{
  for(const failAt of ['quiescence','candidate']){const events=[],runtime=createOverseasSharedRuntimeLifecycle({deps:{repo:{pool:{end:async()=>events.push('pool')}},closeOverseasCandidate:async()=>{events.push('candidate');if(failAt==='candidate')throw Error('synthetic cleanup unknown');}},scan:async()=>{},stopAdmissions:async()=>{},verifyQuiescent:async()=>{if(failAt==='quiescence')throw Error('synthetic quiescence unknown');return idle();},readRollbackInventory:async()=>({})});await assert.rejects(runtime.close(),/synthetic .* unknown/);assert.equal(runtime.status(),'BLOCKED');assert.equal(events.includes('pool'),false);}
});
