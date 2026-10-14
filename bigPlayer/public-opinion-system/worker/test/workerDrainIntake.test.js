'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runOnce}=require('../src/worker');
const {createDrainController}=require('../src/workerDrainController');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture() {
 const drain=createDrainController(),calls=[];
 const deps={drainController:drain,leaseOwner:'candidate',sourceConcurrency:1,
  scanLease:{acquire:async()=>{calls.push('scan');return {};},renew:async()=>true,release:async()=>{calls.push('release');}},
  unifiedScheduler:{mode:'off'},repo:{health:async()=>{},listRunnableSyncRuns:async()=>[],listManualDueSources:async()=>[],listDueSources:async()=>[],
   clearManualRequest:async()=>{calls.push('legacy-clear');},enqueueMissingAnalysis:async()=>{calls.push('backlog');}},runSource:async()=>{calls.push('source');}};
 return {drain,calls,deps};
}
test('draining before scan performs zero intake and leaves all markers',async()=>{
 const f=fixture();f.drain.request();assert.equal((await runOnce(f.deps)).reasonCode,'WORKER_DRAINING');assert.deepEqual(f.calls,[]);
});
test('drain during queue read waits scan, prevents next stages and releases lease',async()=>{
 const f=fixture(),read=deferred(),entered=deferred();
 f.deps.repo.listRunnableSyncRuns=async()=>{entered.resolve();return read.promise;};
 const work=runOnce(f.deps);await entered.promise;f.drain.request();let idle=false;const wait=f.drain.whenIdle().then(()=>{idle=true;});
 await Promise.resolve();assert.equal(idle,false);read.resolve([]);
 assert.equal((await work).reasonCode,'WORKER_DRAINING');await wait;assert.deepEqual(f.calls,['scan','release']);
});
test('drain during admitted manual CAS keeps ticket and finishes that task, skips backlog',async()=>{
 const f=fixture(),cas=deferred(),entered=deferred();let started=false;
 f.deps.repo.listManualDueSources=async()=>[{id:'manual',enabled:1,game_enabled:1,collect_requested_at:'2026-10-09 00:00:00.000'}];
 f.deps.repo.query=async(sql,params)=>{assert.match(sql,/collect_requested_at<=>\?/);assert.equal(params[0],'manual');entered.resolve();return cas.promise;};
 f.deps.runSource=async(deps,source,run,ticket)=>{assert.equal(deps.drainController.owns(ticket),true);assert.equal(source.id,'manual');started=true;};
 const work=runOnce(f.deps);await entered.promise;f.drain.request();cas.resolve({affectedRows:1});await work;await f.drain.whenIdle();
 assert.equal(started,true);assert.equal(f.calls.includes('legacy-clear'),false);assert.equal(f.calls.includes('backlog'),false);
});
test('changed manual marker CAS never dispatches stale work',async()=>{
 const f=fixture();f.deps.repo.listManualDueSources=async()=>[{id:'manual',enabled:1,game_enabled:1,collect_requested_at:'old'}];
 f.deps.repo.query=async()=>({affectedRows:0});await runOnce(f.deps);assert.equal(f.calls.includes('source'),false);
});
test('candidate shutdown joins active work before sessions and pool, rejects new scans',async()=>{
 const {createWorkerCandidateRuntime}=require('../src/workerCandidateRuntime');
 const blocked=deferred(),started=deferred(),calls=[];
 const runtime=createWorkerCandidateRuntime({deps:{repo:{pool:{end:async()=>calls.push('pool')}},closeOverseasCandidate:()=>calls.push('session')},
  scan:async deps=>{const task=deps.drainController.admit();started.resolve();await blocked.promise;calls.push('commit');task.release();}});
 const running=runtime.run();await started.promise;
 const closing=runtime.shutdown();assert.equal(runtime.shutdown(),closing);
 assert.equal((await runtime.run()).reasonCode,'WORKER_DRAINING');assert.deepEqual(calls,[]);
 blocked.resolve();await running;await closing;assert.deepEqual(calls,['commit','session','pool']);
});
test('overseas manual candidate requires durable handoff instead of clearing marker or legacy dispatch',async()=>{
 const f=fixture();let handed=0;
 f.deps.repo.listManualDueSources=async()=>[{id:'manual',platform:'bigplayer_h5',region_code:'overseas',enabled:1,game_enabled:1,collect_requested_at:'old'}];
 f.deps.repo.query=async()=>{throw Error('unsafe CAS fallback');};
 f.deps.handoffOverseasManualRequest=async source=>{assert.equal(source.id,'manual');handed++;return {status:'accepted'};};
 await runOnce(f.deps);assert.equal(handed,1);assert.equal(f.calls.includes('source'),false);assert.equal(f.calls.includes('legacy-clear'),false);
});
test('manual poll query in flight is joined but cannot dispatch after drain',async()=>{
 const f=fixture(),task=deferred(),poll=deferred(),entered=deferred();let reads=0,dispatched=0;
 f.deps.sourceConcurrency=2;f.deps.queuePollIntervalMs=250;
 f.deps.repo.listRunnableSyncRuns=async()=>{
  if(++reads===1)return [{source:{id:'initial'},syncRun:{id:'initial-run',trigger_type:'manual'}}];
  entered.resolve();return poll.promise;
 };
 f.deps.runSource=async()=>{dispatched++;await task.promise;};
 const work=runOnce(f.deps);await entered.promise;f.drain.request();task.resolve();
 let finished=false;work.then(()=>{finished=true;});await Promise.resolve();assert.equal(finished,false);
 poll.resolve([{source:{id:'new'},syncRun:{id:'new-run',trigger_type:'manual'}}]);
 await work;await f.drain.whenIdle();assert.equal(dispatched,1);assert.equal(f.calls.includes('backlog'),false);
});
