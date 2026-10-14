'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {runBoundedLastNight}=require('../src/lastNightBoundedRuntime');
const {SOURCE_ID,GAME_ID,COMMUNITY_ID}=require('../src/lastNightOverseasDailyJob');
const account={id:'fixture-account',source_id:SOURCE_ID,platform:'bigplayer_h5',enabled:1};
const site={siteId:'fixture-site',url:'https://club-en.q1.com/?env=web&lang=en-US&gameId=2177&gameVersion=2177-US-ZS&languageId=2',enabled:true};
const source={id:SOURCE_ID,game_id:GAME_ID,community_id:COMMUNITY_ID,region_code:'overseas',platform:'bigplayer_h5',enabled:1,community_status:'enabled',config:JSON.stringify({boardId:'100017',siteUrls:[site]})};
function fixture({tourist=false}={}) {
  const calls=[],writes=[],analysis=[];
  const repo={query:async(sql,params)=>{
    calls.push(sql);
    if(sql.includes('CURRENT_USER')) return[{identity:'fixture@localhost',db:'public_opinion',port:3306}];
    if(sql.includes('FROM po_sources')) return[source];
    if(sql.includes('FROM po_accounts')) return[account];
    if(sql.includes('FROM po_source_sites')) return[{site_id:site.siteId,url:site.url,enabled:1}];
    if(sql.includes('FROM po_sync_runs')) return[];
    if(sql.includes('information_schema.COLUMNS')) return ['id','source_id','game_id','community_id','account_id','board_key','board_id','board_name','external_id','fingerprint','raw_payload','last_seen_at','content_id','feed_key','page_kind','section_id','feed_metadata','analysis_profile','analysis_version','content_fingerprint','status','lease_owner','analysis_level','analyzed_at'].map(column_name=>({column_name}));
    throw new Error('unplanned SQL');
  },getCredentialByAccount:async(id,type)=>{assert.equal(type,'api_token');return{account_id:account.id,credential_type:type,status:'active',secret_cipher:'{"v":1}'};},
  pool:{getConnection:async()=>({query:async()=>[[{acquired:1}]],destroy(){}})},
  upsertContentPage:async input=>{writes.push(input);return{storedCount:1,contents:[{content:{id:'fixture-content'},change:'inserted'}]};},
  enqueueAnalysisJob:async(id,input)=>{writes.push({id,...input});}};
  const transport=async(url,options)=>{
    calls.push({url:String(url),header:options.headers.authorization});
    const data=url.pathname.endsWith('/login/token')?{token:'fixture-site-token'}:url.pathname.endsWith('/user/context')?{gameBoards:[{id:100017}]}:
      url.pathname.endsWith('/auth/board')?{groups:[{id:10,type:0,sections:[{id:11,name:'Fixture'}]}]}:
      url.pathname.endsWith('/auth/post/')?{id:'fixture-post',content:'full fixture body'}:
      {items:[{id:'fixture-post',title:'Fixture',content:'summary',boardId:100017,createTime:'2026-10-09T01:00:00Z'}],hasMore:true,total:21};
    return{ok:true,status:200,url:String(url),json:async()=>({code:tourist?1:0,data})};
  };
  const plan={authorizationMode:'lastnight-bounded-current-runtime',stage:'metadata',tokenMode:'direct-api-token',accountId:account.id,expectedIdentity:'fixture@localhost',languageId:2,publishedFrom:'2026-10-09T00:00:00Z',publishedTo:'2026-10-10T00:00:00Z'};
  return{repo,transport,plan,calls,writes,analysis,cipher:{decrypt:()=> 'fixture-root-token'},analyze:async input=>{analysis.push(input);return{status:'completed'};}};
}
test('metadata direct token preserves Connector header contract, no exchange or store; exchange is explicit',async()=>{
  for(const tokenMode of ['direct-api-token','site-exchange']) {
    const f=fixture();const result=await runBoundedLastNight({...f,plan:{...f.plan,tokenMode}});
    assert.equal(result.status,'PASS_BOUNDED_STAGE',result.errorCode);assert.equal(f.writes.length,0);
    const http=f.calls.filter(row=>typeof row==='object');
    assert.equal(http.length,tokenMode==='site-exchange'?3:2);
    assert.equal(http.at(-1).header,tokenMode==='site-exchange'?'fixture-site-token':'Bearer fixture-root-token');
    assert.ok(!JSON.stringify(result).includes('fixture-root-token'));
  }
});
test('direct unprefixed, existing Bearer and opaque values preserve original Connector contract',async()=>{
  for(const [token,expected] of [['fixture-token','Bearer fixture-token'],['Bearer fixture-token','Bearer fixture-token'],['bearer fixture-token','bearer fixture-token'],['Opaque fixture-token','Bearer Opaque fixture-token']]) {
    const f=fixture();f.cipher={decrypt:()=>token};
    const result=await runBoundedLastNight(f);assert.equal(result.status,'PASS_BOUNDED_STAGE');
    const http=f.calls.filter(row=>typeof row==='object');assert.equal(http.length,2);assert.ok(http.every(row=>row.header===expected));
  }
});
test('single-page collect does not write Store/AI or fetch second page',async()=>{
  const f=fixture();const result=await runBoundedLastNight({...f,plan:{...f.plan,stage:'collect'}});
  assert.equal(result.status,'PASS_BOUNDED_STAGE',result.errorCode);assert.equal(result.stored,0);assert.equal(f.writes.length,0);
  assert.equal(f.analysis.length,0);
  assert.equal(f.calls.filter(row=>typeof row==='object'&&row.url.includes('merged-list')).length,1);
  assert.equal(result.hasMore,true); // partial sample, not complete-window success
});
test('tourist/identity mismatch fail before writes or downstream requests',async()=>{
  const f=fixture({tourist:true});const result=await runBoundedLastNight({...f,plan:{...f.plan,stage:'store-ai',tokenMode:'site-exchange'}});
  assert.equal(result.status,'NO_GO');assert.equal(f.writes.length,0);assert.equal(result.requests.length,1);
  const wrong=fixture();const failed=await runBoundedLastNight({...wrong,plan:{...wrong.plan,expectedIdentity:'other'}});
  assert.equal(failed.errorCode,'LAST_NIGHT_RUNTIME_IDENTITY_MISMATCH');assert.equal(failed.requests.length,0);
});
test('CLI import has no env/DB/worker side effects, missing explicit plan exits nonzero',()=>{
  const Module=require('node:module'),original=Module._load;
  const loaded=[];Module._load=function(request,...args){loaded.push(request);return original.call(this,request,...args);};
  try{require('../../scripts/lastnight-bounded-runtime');}finally{Module._load=original;}
  assert.ok(!loaded.includes('./worker'));assert.ok(!loaded.includes('mysql2/promise'));
  const result=require('node:child_process').spawnSync(process.execPath,[require.resolve('../../scripts/lastnight-bounded-runtime')],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,1);assert.match(result.stderr,/LAST_NIGHT_EXPLICIT_PLAN_REQUIRED/);
});
test('collect all existing page shapes enrich details; detail tourist stops stage without writes',async()=>{
  for(const shape of ['array','records','rows','posts','top-items','top-list']) {
    const f=fixture();const original=f.transport;
    f.transport=async(url,options)=>{
      const response=await original(url,options);
      if(!url.pathname.endsWith('/merged-list')) return response;
      const payload=await response.json(),items=payload.data.items;
      return {...response,json:async()=>shape==='array'?{code:0,data:items,hasMore:true,total:21}:
        shape.startsWith('top-')?{code:0,[shape.slice(4)]:items,hasMore:true,total:21}:{code:0,data:{[shape]:items,hasMore:true,total:21}}};
    };
    const result=await runBoundedLastNight({...f,plan:{...f.plan,stage:'collect'}});
    assert.equal(result.status,'PASS_BOUNDED_STAGE',`${shape}: ${result.errorCode}`);
    assert.deepEqual(result.details,{enriched:1,fallback:0,reasons:{}});assert.equal(f.writes.length,0);
  }
  for(const status of [200,401,403]) {
    const f=fixture(),original=f.transport;let detailSignal;
    f.transport=async(url,options)=>{
      if(url.pathname.endsWith('/auth/post/')) {detailSignal=options.signal;return{ok:status===200,status,url:String(url),json:async()=>({code:status===200?1:2})};}
      return original(url,options);
    };
    const result=await runBoundedLastNight({...f,plan:{...f.plan,stage:'store-ai'}});
    assert.equal(result.status,'NO_GO');assert.equal(f.writes.length,0);assert.ok(detailSignal.aborted);
    assert.equal(result.errorCode,status===200?'Q1_TOURIST_LOGIN':status===401?'UNAUTHORIZED':'PERMISSION_DENIED');
  }
});
test('metadata accepts unset window; collect summary fallback is not PASS',async()=>{
  const f=fixture();assert.equal((await runBoundedLastNight({...f,plan:{...f.plan,publishedFrom:null,publishedTo:null}})).status,'PASS_BOUNDED_STAGE');
  const original=f.transport;f.transport=(url,options)=>url.pathname.endsWith('/auth/post/')?Promise.reject(new Error('fixture timeout')):original(url,options);
  const result=await runBoundedLastNight({...f,plan:{...f.plan,stage:'collect'}});
  assert.equal(result.status,'NO_GO');assert.equal(result.errorCode,'LAST_NIGHT_HTTP_FAILED');
});
test('network cause is allowlisted, fatal retained through Connector wrapping and no downstream IO',async()=>{
  for(const causeCode of ['UNABLE_TO_VERIFY_LEAF_SIGNATURE','ECONNRESET','secret-token https://private/']) {
    const f=fixture();let calls=0,signal;
    f.transport=async(_url,options)=>{calls++;signal=options.signal;throw Object.assign(new TypeError('secret URL header token body'),{cause:{code:causeCode},code:'private-token'});};
    const result=await runBoundedLastNight({...f,plan:{...f.plan,stage:'collect'}});
    assert.equal(result.errorCode,'LAST_NIGHT_HTTP_FAILED');assert.equal(calls,1);assert.equal(f.writes.length,0);assert.ok(signal.aborted);
    assert.deepEqual(result.requests[0].transportError,{name:'TypeError',code:'UNCLASSIFIED',causeCode:causeCode.startsWith('secret')?'UNCLASSIFIED':causeCode});
    assert.ok(!JSON.stringify(result).includes('private-token'));assert.ok(!JSON.stringify(result).includes('secret URL'));
  }
});
test('non-JSON 401/403 classified before decode; explicit exchange uses only exchanged token',async()=>{
  for(const tokenMode of ['direct-api-token','site-exchange']) for(const status of [401,403]) {
    const f=fixture();let requests=0,decoded=0;
    f.transport=async url=>{requests++;return{status,ok:false,url:String(url),json:async()=>{decoded++;throw new SyntaxError('secret response');}};};
    const result=await runBoundedLastNight({...f,plan:{...f.plan,tokenMode}});
    assert.equal(result.errorCode,status===401?'UNAUTHORIZED':'PERMISSION_DENIED');assert.equal(result.requests[0].http,status);
    assert.equal(decoded,0);assert.equal(requests,1);assert.equal(f.writes.length,0);assert.ok(!JSON.stringify(result).includes('secret response'));
  }
  const f=fixture();const result=await runBoundedLastNight({...f,plan:{...f.plan,tokenMode:'site-exchange'}});
  assert.equal(result.status,'PASS_BOUNDED_STAGE');const http=f.calls.filter(row=>typeof row==='object');
  assert.equal(http.length,3);assert.ok(http[0].url.includes('/login/token?'));assert.equal(http[0].header,'fixture-root-token');
  assert.equal(http[1].header,'fixture-site-token');assert.equal(http[2].header,'fixture-site-token');
  assert.ok(!JSON.stringify(result).includes('fixture-root-token'));assert.ok(!JSON.stringify(result).includes('fixture-site-token'));
});
test('metadata and collect execute through actual readonly facade, not writable Repository',async()=>{
  const {protectReadonlyRepository}=require('../src/lastNightReadonlyGuard');
  const {Repository}=require('../../server/src/db/repository');
  for(const stage of ['metadata','collect']) {
    const f=fixture(),query=f.repo.query;let dispatch=0;
    f.repo.pool.query=async(options,params)=>{
      dispatch++;
      if(options.sql.includes('FROM po_credentials')) return [[{account_id:account.id,credential_type:'api_token',status:'active',secret_cipher:'{"v":1}'}]];
      return [await query(options.sql,params)];
    };
    f.repo.query=Repository.prototype.query;f.repo.getCredentialByAccount=Repository.prototype.getCredentialByAccount;
    const protectedStage=protectReadonlyRepository(f.repo,account.id);assert.equal(dispatch,0);
    const result=await runBoundedLastNight({...f,repo:protectedStage.repo,plan:{...f.plan,stage}});
    assert.equal(result.status,'PASS_BOUNDED_STAGE',result.errorCode);assert.equal(dispatch,5);assert.equal(f.writes.length,0);
  }
});
