'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createControlledManifest,authorizeControlledTuple,createSyntheticControlledConsumer}=require('../src/overseasControlledManifest');
const identity={sourceId:'s',accountId:'a',gameId:'g',communityId:'c',windowStart:'2026-10-08T00:00:00.000Z',windowEnd:'2026-10-09T00:00:00.000Z'};
const tuple={contentId:'content',jobId:'job',fingerprint:'a'.repeat(64),profile:'light',version:'v1'};
const manifest=()=>createControlledManifest({kind:'analysis',identity,tuples:[tuple]});
const reserved=r=>({status:'reserved',durable:true,reservationId:'fake',manifestSha256:r.manifestSha256,tupleSha256:r.tupleSha256,callId:r.callId});
test('strict fixed identity and every tuple dimension reject drift and copies',()=>{
  const m=manifest();for(const key of Object.keys(identity))assert.throws(()=>authorizeControlledTuple(m,{identity:{...identity,[key]:'other'},tuple}));
  for(const key of Object.keys(tuple))assert.throws(()=>authorizeControlledTuple(m,{identity,tuple:{...tuple,[key]:key==='fingerprint'?'b'.repeat(64):'other'}}));
  assert.throws(()=>authorizeControlledTuple({...m},{identity,tuple}));assert.throws(()=>createControlledManifest({kind:'analysis',identity,tuples:[tuple,tuple]}));
  assert.throws(()=>createControlledManifest({kind:'analysis',identity,tuples:[]}));assert.throws(()=>authorizeControlledTuple(m,{identity,tuple:{...tuple,extra:'x'}}));
  assert.equal(authorizeControlledTuple(m,{identity,tuple}).tuple.jobId,'job');assert.equal(m.productionActivationAllowed,false);
});
test('getters, symbols, noncanonical and empty windows reject',()=>{
  let calls=0;const bad={...tuple};Object.defineProperty(bad,'version',{get(){calls++;return 'v1';},enumerable:true});
  assert.throws(()=>createControlledManifest({kind:'analysis',identity,tuples:[bad]}));assert.equal(calls,0);
  assert.throws(()=>createControlledManifest({kind:'analysis',identity,tuples:[{...tuple,[Symbol('x')]:'x'}]}));
  assert.throws(()=>createControlledManifest({kind:'analysis',identity:{...identity,windowEnd:identity.windowStart},tuples:[tuple]}));
});
test('translation exact version/language and no notification dependency',()=>{
  const t={contentId:'c',jobId:'t',fingerprint:tuple.fingerprint,targetLanguage:'zh-CN',version:'t1'},m=createControlledManifest({kind:'translation',identity,tuples:[t]});
  assert.equal(authorizeControlledTuple(m,{identity,tuple:t}).tuple.version,'t1');assert.throws(()=>authorizeControlledTuple(m,{identity,tuple:{...t,version:'t2'}}));
  assert.throws(()=>createSyntheticControlledConsumer({manifest:m,notifications:'enabled',fakeDeps:{mode:'synthetic-only',reserve:async()=>{},consume:async()=>{}}}));
});
test('every fake call awaits matching reservation protocol; no retry/refund/notification',async()=>{
  let count=0,reserves=0;const ids=[],events=[];
  const consumer=createSyntheticControlledConsumer({manifest:manifest(),notifications:'disabled',fakeDeps:{mode:'synthetic-only',reserve:async r=>{reserves++;ids.push(r.callId);events.push('reserve');return reserved(r);},consume:async()=>{count++;events.push('consume');return 'fake';}}});
  for(let i=0;i<2;i++){const result=await consumer.consume({identity,tuple});assert.equal(result.syntheticOutbox.externalDeliveryAttempted,false);}
  assert.equal(count,2);assert.equal(reserves,2);assert.notEqual(ids[0],ids[1]);assert.deepEqual(events,['reserve','consume','reserve','consume']);
});
test('callback and receipt descriptors strict; callbacks captured before awaiting',async()=>{
  let getters=0,calls=0,replaced=0;
  const bad={mode:'synthetic-only',reserve:async()=>{},consume:async()=>{}};Object.defineProperty(bad,'consume',{get(){getters++;return async()=>{};},enumerable:true});
  assert.throws(()=>createSyntheticControlledConsumer({manifest:manifest(),notifications:'disabled',fakeDeps:bad}));assert.equal(getters,0);
  for(const make of [r=>({...reserved(r),[Symbol('x')]:true}),r=>({...reserved(r),extra:true}),r=>{const v=reserved(r);Object.defineProperty(v,'durable',{get(){getters++;return true;},enumerable:true});return v;}]){
    const c=createSyntheticControlledConsumer({manifest:manifest(),notifications:'disabled',fakeDeps:{mode:'synthetic-only',reserve:async r=>make(r),consume:async()=>{calls++;}}});await assert.rejects(c.consume({identity,tuple}));
  }assert.equal(calls,0);assert.equal(getters,0);
  const deps={mode:'synthetic-only',reserve:async r=>{deps.consume=async()=>{replaced++;};return reserved(r);},consume:async()=>{calls++;}};
  await createSyntheticControlledConsumer({manifest:manifest(),notifications:'disabled',fakeDeps:deps}).consume({identity,tuple});assert.equal(calls,1);assert.equal(replaced,0);
});
test('outside tuple, denied/memory/drift receipts and reserve failure never consume',async()=>{
  let calls=0;for(const patch of [{status:'denied'},{durable:false},{callId:'wrong'},{tupleSha256:'wrong'}]){
    const c=createSyntheticControlledConsumer({manifest:manifest(),notifications:'disabled',fakeDeps:{mode:'synthetic-only',reserve:async r=>({...reserved(r),...patch}),consume:async()=>{calls++;}}});await assert.rejects(c.consume({identity,tuple}));
  }assert.equal(calls,0);
});
test('input fingerprint change during reserve denies before fake consume',async()=>{
  const input={identity,tuple:{...tuple}};let calls=0;
  const c=createSyntheticControlledConsumer({manifest:manifest(),notifications:'disabled',fakeDeps:{mode:'synthetic-only',reserve:async r=>{input.tuple.fingerprint='b'.repeat(64);return reserved(r);},consume:async()=>{calls++;}}});
  await assert.rejects(c.consume(input));assert.equal(calls,0);
});
