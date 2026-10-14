'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {runAuthorizationCheck}=require('../../scripts/lastnight-authorization-check');
const input={mode:'isolated',source:{id:'081a16d2-5545-4afd-9c65-e04777e4540b'},account:{id:'fixture-account',source_id:'081a16d2-5545-4afd-9c65-e04777e4540b'},expectedAccountId:'fixture-account',token:'fixture-root-secret',
  sites:[2,9,16].map(id=>({url:`https://club-en.q1.com/?env=web&lang=en-US&gameId=2177&gameVersion=2177-US-ZS&languageId=${id}`}))};
function fixture(code=0) {return async url=>({ok:true,status:200,url:String(url),json:async()=>({code,data:url.pathname.endsWith('/login/token')?{token:'fixture-site-secret'}:url.pathname.endsWith('/user/context')?{gameBoards:[{id:100017}]}:{groups:[{id:10,type:0,sections:[{id:11,name:'Fixture'}]}]}})});}
test('three sites use session and board parser; at most nine timed signed metadata requests, no secrets/feed',async()=>{
  const result=await runAuthorizationCheck({...input,transport:fixture()});
  assert.equal(result.status,'PASS_ISOLATED_AUTHORIZATION');assert.equal(result.requests.length,9);assert.equal(result.sites.length,3);
  assert.ok(result.requests.every(row=>row.startedAt&&row.finishedAt&&row.signatureSha256.length===64));
  assert.ok(!JSON.stringify(result).includes('fixture-root-secret'));assert.ok(!JSON.stringify(result).includes('fixture-site-secret'));
  assert.ok(result.requests.every(row=>!row.signature.path.includes('post')));
});
test('tourist stops entire phase at first exchange; wrong account and live transport are rejected',async()=>{
  const result=await runAuthorizationCheck({...input,transport:fixture(1)});
  assert.equal(result.status,'NO_GO');assert.equal(result.requests.length,1);assert.equal(result.sites.length,0);
  assert.equal(result.requests[0].providerCode,1);
  await assert.rejects(runAuthorizationCheck({...input,expectedAccountId:'other',transport:fixture()}),{code:'LAST_NIGHT_AUTH_SCOPE_MISMATCH'});
  await assert.rejects(runAuthorizationCheck({...input,transport:globalThis.fetch}),{code:'PRODUCTION_EXECUTION_DISABLED'});
});
test('timeout stops hung transport; no retries, DB/consumer or fallback requests',async()=>{
  const result=await runAuthorizationCheck({...input,windowMs:50,transport:()=>new Promise(()=>{})});
  assert.equal(result.status,'NO_GO');assert.equal(result.requests.length,1);
  const child=require('node:child_process').spawnSync(process.execPath,[require.resolve('../../scripts/lastnight-authorization-check'),'--execute'],{encoding:'utf8',windowsHide:true});
  assert.equal(child.status,1);assert.match(child.stderr,/PRODUCTION_EXECUTION_DISABLED/);
});
test('wrong env/lang, duplicate query and unknown keys fail before transport',async()=>{
  for(const suffix of ['&env=app','&languageId=2','&unknown=1']) await assert.rejects(runAuthorizationCheck({...input,sites:[{url:input.sites[0].url+suffix},...input.sites.slice(1)],transport:()=>{throw new Error('must not call');}}));
  for(const url of [input.sites[0].url.replace('env=web','env=app'),input.sites[0].url.replace('lang=en-US','lang=xx')]) await assert.rejects(runAuthorizationCheck({...input,sites:[{url},...input.sites.slice(1)],transport:()=>{throw new Error('must not call');}}));
});
