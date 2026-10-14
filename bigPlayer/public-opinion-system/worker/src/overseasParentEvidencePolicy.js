'use strict';
const crypto=require('node:crypto');
const {canonical}=require('./overseasBigPlayerRunContractJournal');
const hash=v=>crypto.createHash('sha256').update(canonical(v)).digest('hex');
const fail=()=>{throw Object.assign(Error('Parent evidence invalid'),{code:'OVERSEAS_PARENT_EVIDENCE_INVALID'});};
const stages=['run','source','state','identity','manifest/tasks','CP','audit'];
function exact(v,keys){if(!v||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length||Reflect.ownKeys(v).some(k=>!keys.includes(k)))fail();for(const k of keys)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'))fail();}
function unique(ids){if(!Array.isArray(ids)||ids.some(x=>typeof x!=='string'||!x)||new Set(ids).size!==ids.length)fail();return [...ids].sort();}
// Pure integrity projection, not an authorization/DB cursor writer. Pins must
// originate outside the supplied evidence; synthetic pins prove only tests.
function projectParentEvidence({batchId,children,expectedChildren,pins}={}){
  if(typeof batchId!=='string'||!batchId||!Array.isArray(expectedChildren)||!expectedChildren.length||!Array.isArray(children)||children.length!==expectedChildren.length)fail();
  unique(expectedChildren.map(x=>x.runId));unique(expectedChildren.map(x=>x.siteId));unique(children.map(x=>x.runId));exact(pins,expectedChildren.map(x=>x.runId));
  const projected=[];
  for(const scope of expectedChildren){
    exact(scope,['runId','siteId','windowStart','windowEnd','owner','manifestSha256','taskIdentities']);
    const tasks=unique(scope.taskIdentities);if(!tasks.length||tasks.some(x=>!/^[a-f0-9]{64}$/.test(x))||typeof scope.owner!=='string'||!scope.owner)fail();
    for(const k of ['windowStart','windowEnd'])if(typeof scope[k]!=='string'||!Number.isFinite(Date.parse(scope[k]))||new Date(scope[k]).toISOString()!==scope[k])fail();
    if(scope.windowStart>=scope.windowEnd)fail();
    const child=children.find(x=>x.runId===scope.runId);exact(child,['runId','siteId','status','raw']);if(child.siteId!==scope.siteId)fail();
    if(['queued','running'].includes(child.status)){if(child.raw!==null||pins[child.runId]!==null)fail();projected.push({siteId:scope.siteId,status:child.status,cursor:null});continue;}
    if(!['success','partial','failed','awaiting_manual_verification'].includes(child.status)||typeof child.raw!=='string')fail();
    let e;try{e=JSON.parse(child.raw);}catch{fail();}
    if(canonical(e)!==child.raw||hash(e)!==pins[child.runId])fail();
    exact(e,['batchId','runId','siteId','windowStart','windowEnd','owner','epoch','status','sealed','manifest','audit','terminal','checkpoints','checkpointSetSha256']);
    if(e.batchId!==batchId||e.status!==child.status||!Number.isSafeInteger(e.epoch)||e.epoch<1||e.sealed!==true)fail();
    for(const k of ['runId','siteId','windowStart','windowEnd'])if(e[k]!==scope[k])fail();
    if(e.owner!==scope.owner)fail();exact(e.manifest,['expansionSealed','taskIdentities','taskSetSha256']);
    if(e.manifest.expansionSealed!==true||hash(e.manifest)!==scope.manifestSha256||canonical(unique(e.manifest.taskIdentities))!==canonical(tasks)||e.manifest.taskSetSha256!==hash(tasks))fail();
    exact(e.audit,['id','runId','owner','epoch','status','manifestSha256','checkpointSetSha256']);exact(e.terminal,['runId','owner','epoch','status','auditSha256']);
    for(const v of [e.audit,e.terminal])for(const k of ['runId','owner','epoch','status'])if(v[k]!==e[k])fail();
    if(e.audit.manifestSha256!==scope.manifestSha256)fail();
    if(typeof e.audit.id!=='string'||!e.audit.id||e.terminal.auditSha256!==hash(e.audit)||!Array.isArray(e.checkpoints)||!e.checkpoints.length)fail();
    unique(e.checkpoints.map(cp=>cp.id));if(hash(e.checkpoints)!==e.checkpointSetSha256||e.audit.checkpointSetSha256!==e.checkpointSetSha256)fail();
    if(canonical(unique(e.checkpoints.map(cp=>cp.taskIdentity)))!==canonical(tasks))fail();
    let cursor=null;
    for(const cp of e.checkpoints){
      exact(cp,['id','runId','siteId','owner','epoch','taskIdentity','windowStart','windowEnd','status','cursor','lastItemAt']);
      for(const k of ['runId','siteId','owner','epoch','windowStart','windowEnd'])if(cp[k]!==e[k])fail();
      if(!['completed','failed'].includes(cp.status)||(e.status==='success'&&(cp.status!=='completed'||cp.cursor!==null)))fail();
      if(cp.lastItemAt!==null){if(!Number.isFinite(Date.parse(cp.lastItemAt))||new Date(cp.lastItemAt).toISOString()!==cp.lastItemAt||cp.lastItemAt<scope.windowStart||cp.lastItemAt>=scope.windowEnd)fail();if(cursor===null||cp.lastItemAt>cursor)cursor=cp.lastItemAt;}
    }
    projected.push({siteId:scope.siteId,status:e.status,cursor:e.status==='success'?cursor:null});
  }
  const statuses=projected.map(x=>x.status),status=statuses.some(s=>['queued','running'].includes(s))?'awaiting_children':statuses.includes('awaiting_manual_verification')?'awaiting_manual_verification':statuses.every(s=>s==='success')?'success':statuses.every(s=>s==='failed')?'failed':'partial';
  return Object.freeze({status,cursorCandidates:status==='success'?projected.map(x=>({siteId:x.siteId,cursor:x.cursor})):[],automaticWriteAllowed:false,productionActivationAllowed:false});
}
function projectParentLockOrder(groups){exact(groups,stages);return stages.flatMap(stage=>unique(groups[stage]).map(id=>({stage,id})));}
function assertParentLockOrder(groups,actual){if(canonical(actual)!==canonical(projectParentLockOrder(groups)))fail();return true;}
module.exports={projectParentEvidence,projectParentLockOrder,assertParentLockOrder};
