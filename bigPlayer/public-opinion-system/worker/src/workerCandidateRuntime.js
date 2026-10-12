'use strict';
const {createDrainController}=require('./workerDrainController');
// Explicit candidate lifecycle, not installed in the existing service main.
// Caller supplies the scan; no timer, process signal or second consumer here.
function createWorkerCandidateRuntime({deps,scan}={}) {
  if(!deps?.repo||typeof scan!=='function')throw new TypeError('Candidate runtime dependencies required');
  const drain=deps.drainController||createDrainController(),runtimeDeps={...deps,drainController:drain};
  let inflight=null,closing=null;
  function run() {
    if(drain.isDraining())return Promise.resolve({skipped:true,reasonCode:'WORKER_DRAINING'});
    if(inflight)return inflight;
    const ticket=drain.admit();
    if(!ticket)return Promise.resolve({skipped:true,reasonCode:'WORKER_DRAINING'});
    inflight=Promise.resolve().then(()=>scan(runtimeDeps)).finally(()=>{ticket.release();inflight=null;});
    return inflight;
  }
  function shutdown() {
    if(closing)return closing;
    drain.request();
    const pending=inflight;
    closing=(async()=>{
      // Failure must not skip waiting for safe task/lease/poll cleanup.
      if(pending)try{await pending;}catch{}
      await drain.whenIdle();
      await runtimeDeps.closeOverseasCandidate?.();
      await runtimeDeps.repo.pool?.end?.();
    })();
    return closing;
  }
  return Object.freeze({run,shutdown,deps:runtimeDeps,productionActivationAllowed:false});
}
module.exports={createWorkerCandidateRuntime};
