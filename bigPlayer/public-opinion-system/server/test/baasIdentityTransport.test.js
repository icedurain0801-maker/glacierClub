const test=require('node:test'),assert=require('node:assert/strict');
const {BaasAccess}=require('../src/services/baasAccess');
const req={headers:{authorization:'Bearer fixture'}};
const user=roles=>new Response(JSON.stringify({end_user_id:'fixture',is_anonymous:false,roles}));
test('identity read retries transient network and service failure within one budget',async()=>{
  for(const failure of ['network',429,503]){let calls=0;const signals=[];const access=new BaasAccess({fetchImpl:async(_,opts)=>{signals.push(opts.signal);if(++calls===1){if(failure==='network')throw Error('reset');return new Response('',{status:failure})}return user(['admin'])}});assert.equal((await access.authenticate(req)).permissions.manage,true);assert.equal(calls,2);assert.equal(signals[0],signals[1]);}
});
test('identity retries never bypass revoked credentials or current role changes',async()=>{
  for(const status of [401,403]){let calls=0;const access=new BaasAccess({fetchImpl:async()=>{calls++;return new Response('',{status})}});await assert.rejects(access.authenticate(req),{code:'BAAS_LOGIN_REQUIRED'});assert.equal(calls,1)}
  let roles=['admin'];const access=new BaasAccess({fetchImpl:async()=>user(roles)});assert.equal((await access.authenticate(req)).permissions.manage,true);roles=['viewer'];assert.equal((await access.authenticate(req)).permissions.manage,false);
});
test('persistent identity failure stays a structured 503 without writing or leaking credentials',async()=>{let calls=0;const access=new BaasAccess({fetchImpl:async()=>{calls++;throw Error('private fixture')}});await assert.rejects(access.authenticate(req),error=>error.code==='BAAS_UNAVAILABLE'&&error.status===503&&!error.message.includes('fixture'));assert.equal(calls,2)});
