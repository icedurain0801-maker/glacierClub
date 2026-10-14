'use strict';
const crypto=require('node:crypto');
const {canonical}=require('./overseasBigPlayerRunContractJournal');
const brands=new WeakMap(),identityKeys=['sourceId','accountId','gameId','communityId','windowStart','windowEnd'];
const fail=()=>{throw Object.assign(Error('Controlled synthetic policy rejected'),{code:'OVERSEAS_CONTROLLED_POLICY_REJECTED'});};
const hash=v=>crypto.createHash('sha256').update(canonical(v)).digest('hex');
function dataFields(v,keys){if(!v||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length||Reflect.ownKeys(v).some(k=>!keys.includes(k)))fail();const out={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value'))fail();out[k]=d.value;}return out;}
function exact(v,keys){
  if(!v||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==keys.length)fail();
  for(const key of Reflect.ownKeys(v))if(!keys.includes(key))fail();
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!Object.hasOwn(d,'value')||typeof d.value!=='string'||!d.value.trim()||d.value.trim()!==d.value)fail();}
  return Object.freeze(Object.fromEntries(keys.map(k=>[k,v[k]])));
}
function identityOf(v){const out=exact(v,identityKeys);for(const key of ['windowStart','windowEnd'])if(!Number.isFinite(Date.parse(out[key]))||new Date(out[key]).toISOString()!==out[key])fail();if(out.windowStart>=out.windowEnd)fail();return out;}
function tupleOf(v,kind){
  if(!['analysis','translation'].includes(kind))fail();
  const out=exact(v,['contentId','jobId','fingerprint',kind==='analysis'?'profile':'targetLanguage','version']);
  if(!/^[a-f0-9]{64}$/.test(out.fingerprint)||(kind==='analysis'?out.profile!=='light':out.targetLanguage!=='zh-CN'))fail();return out;
}
function createControlledManifest({kind,identity,tuples}={}){
  const fixed=identityOf(identity);if(!Array.isArray(tuples)||!tuples.length||tuples.length>10000)fail();
  const entries=tuples.map(v=>tupleOf(v,kind));if(new Set(entries.map(v=>v.jobId)).size!==entries.length||new Set(entries.map(v=>v.contentId)).size!==entries.length)fail();
  entries.sort((a,b)=>a.jobId<b.jobId?-1:a.jobId>b.jobId?1:0);
  const spec={format:'overseas-synthetic-consumption-v1',kind,identity:fixed,tuples:Object.freeze(entries)};
  const manifest=Object.freeze({...spec,manifestSha256:hash(spec),productionActivationAllowed:false});brands.set(manifest,{kind,identity:fixed,jobs:new Map(entries.map(v=>[v.jobId,v]))});return manifest;
}
function authorizeControlledTuple(manifest,{identity,tuple}={}){
  const ctx=brands.get(manifest);if(!ctx||canonical(identityOf(identity))!==canonical(ctx.identity))fail();
  const value=tupleOf(tuple,ctx.kind),expected=ctx.jobs.get(value.jobId);if(!expected||canonical(value)!==canonical(expected))fail();
  return Object.freeze({manifestSha256:manifest.manifestSha256,tupleSha256:hash(expected),tuple:expected,identity:ctx.identity});
}
// Explicit fake harness only. Callback assertions do not prove real persistence
// or suppress arbitrary callback side effects; run exclusively with offline guard.
function createSyntheticControlledConsumer({manifest,fakeDeps,notifications}={}){
  if(!brands.has(manifest)||notifications!=='disabled')fail();
  const deps=dataFields(fakeDeps,['mode','reserve','consume']);
  if(deps.mode!=='synthetic-only'||typeof deps.reserve!=='function'||typeof deps.consume!=='function')fail();
  const reserve=deps.reserve,consume=deps.consume;
  return Object.freeze({productionActivationAllowed:false,async consume(input){
    const authorization=authorizeControlledTuple(manifest,input),request=Object.freeze({...authorization,callId:crypto.randomUUID()});
    const receipt=dataFields(await reserve(request),['status','durable','reservationId','manifestSha256','tupleSha256','callId']);
    if(receipt.status!=='reserved'||receipt.durable!==true||typeof receipt.reservationId!=='string'||!receipt.reservationId.trim()||receipt.reservationId!==receipt.reservationId.trim()
      ||['manifestSha256','tupleSha256','callId'].some(k=>receipt[k]!==request[k]))fail();
    // Recheck after awaited reserve, so mutation of caller input cannot consume.
    authorizeControlledTuple(manifest,input);
    const result=await consume(Object.freeze({...authorization,reservation:Object.freeze(receipt)}));
    return Object.freeze({result,syntheticOutbox:Object.freeze({status:'disabled',externalDeliveryAttempted:false,jobId:authorization.tuple.jobId}),productionActivationAllowed:false});
  }});
}
module.exports={createControlledManifest,authorizeControlledTuple,createSyntheticControlledConsumer};
