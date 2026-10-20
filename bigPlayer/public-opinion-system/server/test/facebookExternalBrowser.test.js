'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {loopbackUrl,ExternalBrowserClient}=require('../../login-session-service/src/externalBrowserClient');
const {createBrokerServer}=require('../../login-session-service/src/externalBrowserBroker');
test('external browser connector rejects remote URLs and untrusted debugger paths',()=>{
  assert.equal(loopbackUrl('http://127.0.0.1:4312').hostname,'127.0.0.1');
  for(const u of ['http://localhost:4312','https://127.0.0.1:4312','http://127.0.0.1:4312/path','http://user:pass@127.0.0.1:4312','http://192.168.1.2:4312'])assert.throws(()=>loopbackUrl(u),{code:'EXTERNAL_BROWSER_URL_INVALID'});
  assert.equal(loopbackUrl('ws://127.0.0.1:54321/devtools/browser/abc-123',true).port,'54321');
  for(const u of ['ws://evil.test:99/devtools/browser/abc','ws://127.0.0.1:99/private','ws://127.0.0.1:99/devtools/browser/abc?token=x'])assert.throws(()=>loopbackUrl(u,true),{code:'EXTERNAL_BROWSER_URL_INVALID'});
});
test('browser broker requires internal authentication and accepts only a bound account',async()=>{
  const calls=[];const server=createBrokerServer({internalToken:'fixture-token',broker:{open:async input=>{calls.push(input);return {endpoint:'ws://127.0.0.1:54321/devtools/browser/abc'}}}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.equal((await fetch(base+'/sessions',{method:'POST'})).status,401);
    const client=new ExternalBrowserClient({LOGIN_SESSION_INTERNAL_TOKEN:'fixture-token',LOGIN_SESSION_EXTERNAL_BROWSER_URL:base});
    assert.equal(await client.open({sourceId:'source-a',accountId:'account-a',platform:'facebook',credentials:{password:'must-not-be-sent'}}),'ws://127.0.0.1:54321/devtools/browser/abc');
    assert.deepEqual(calls,[{sourceId:'source-a',accountId:'account-a',platform:'facebook'}]);
    const headers={authorization:'Bearer fixture-token','content-type':'application/json',origin:base};
    assert.equal((await fetch(base+'/sessions',{method:'POST',headers,body:'{}'})).status,403);
    await assert.rejects(new ExternalBrowserClient({}).open({}),{code:'EXTERNAL_BROWSER_NOT_CONFIGURED'});
  }finally{await new Promise(r=>server.close(r))}
});
