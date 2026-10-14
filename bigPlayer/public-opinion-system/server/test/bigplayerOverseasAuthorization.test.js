'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BigPlayerH5Connector } = require('../src/connectors/bigPlayerH5Connector');
const source = { id:'overseas-qa', platform:'bigplayer_h5', account:{id:'qa-account'}, config:{baseUrl:'https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=2',boardId:'100017'} };
function fixture({status=200, malformed=false, redirect=false}={}) {
  const requests=[];
  const connector=new BigPlayerH5Connector({BIGPLAYER_H5_ENABLED:'true',BIGPLAYER_H5_ALLOWED_HOSTS:'club.q1.com,club-en.q1.com'}, {
    credentialContext:{loadApiToken:async()=> 'fixture-only'},
    fetchImpl:async (value,options) => {
      const url=new URL(value); requests.push({url,options});
      if(url.pathname.endsWith('/setting/language')) return {ok:true,status:200,url:String(url),json:async()=>({code:0,data:[{languageID:2,code:'en-US'}]})};
      // The public legacy endpoint is an HTML SPA fallback, not a JSON API.
      if(url.pathname.startsWith('/internal/') || malformed) return {ok:true,status:200,url:String(url),json:async()=>{throw new SyntaxError('fixture HTML');}};
      if(status!==200) return {ok:false,status,url:String(url)};
      const data=url.pathname.endsWith('/user/context') ? {gameBoards:[{id:100017,name:'Last Light'}]}
        : url.pathname.endsWith('/auth/board') ? {groups:[{id:10,type:0,sections:[{id:11,name:'News'}]}]}
        : {items:[],hasMore:false,total:0};
      return {ok:true,status:200,url:redirect?'https://club.q1.com/api':String(url),json:async()=>({code:0,data})};
    }
  });
  return {connector,requests};
}
test('overseas token health uses Q1 context, configured board and JSON feed on its own origin',async()=>{
  const {connector,requests}=fixture();
  const health=await connector.accountHealth(source);
  assert.equal(health.authorized,true,health.reason);
  assert.deepEqual(requests.map(x=>x.url.pathname),['/api/club/v1/setting/language','/api/club/v1/auth/user/context','/api/club/v2/auth/board','/api/club/v1/auth/post/model/merged-list']);
  assert.ok(requests.every(x=>x.url.origin==='https://club-en.q1.com' && x.options.redirect==='manual'));
  assert.equal(requests[2].url.searchParams.get('id'),'100017');
  assert.equal(requests[3].url.searchParams.get('boardId'),'100017');
  assert.equal(requests[1].options.headers['content-language'],'en-US');
  assert.equal(requests[0].options.headers.authorization,undefined);
});
test('overseas 401/403 and malformed JSON remain unauthorized without legacy fallback',async()=>{
  for(const [options,reason] of [[{status:401},'UNAUTHORIZED'],[{status:403},'PERMISSION_DENIED'],[{malformed:true},'MALFORMED_RESPONSE']]){
    const {connector,requests}=fixture(options); const health=await connector.accountHealth(source);
    assert.equal(health.authorized,false); assert.equal(health.reason,reason);
    assert.equal(requests.length,2); assert.equal(requests[1].url.pathname,'/api/club/v1/auth/user/context');
  }
});
test('Q1 rejects cross-region request destinations before sending credentials',async()=>{
  const {connector,requests}=fixture();
  await assert.rejects(()=>connector.requestQ1('https://club.q1.com/api',source,'fixture-only'),e=>e.code==='H5_URL_OUTSIDE_ALLOWED_HOSTS');
  for(const target of ['https://club-en.q1.com.evil.invalid/api','http://club-en.q1.com/api','https://club-en.q1.com:8443/api']) {
    await assert.rejects(()=>connector.requestQ1(target,source,'fixture-only'),e=>e.code==='H5_URL_OUTSIDE_ALLOWED_HOSTS');
  }
  assert.equal(requests.length,0);
});
test('Q1 rejects a response reporting a different region origin',async()=>{
  const {connector}=fixture({redirect:true});
  const health=await connector.accountHealth(source);
  assert.equal(health.authorized,false); assert.equal(health.reason,'H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS');
});
