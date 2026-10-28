const test=require('node:test');const assert=require('node:assert/strict');const runtime=require('../src/runtimeEnv');runtime.loadRuntimeEnv=()=>false;const app=require('../src/app');let base;const source={id:'c',game_id:'g',status:'enabled'};test.before(async()=>{app.repo.resolveCommunityCanonical=async()=>({community:source,communityId:'c',gameId:'g',regionCode:'domestic'});app.repo.getCommunity=async()=>source;app.repo.getAiAnalysisPolicy=async()=>({version:1,levels:{L0:{intensity:'light',ranges:['post','comment'],rule:'线上规则'}}});app.repo.updateAiAnalysisPolicy=async(g,c,p)=>{assert.equal(g,'g');return p};await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}/api/public-opinion`});test.after(async()=>{await new Promise(r=>app.server.close(r));await app.repo.pool.end()});test('AI analysis policy route reads and writes community policy',async()=>{let r=await fetch(base+'/ai-analysis-policy?regionCode=domestic&communityId=c');if(r.status!==200) console.log(await r.clone().text());assert.equal(r.status,200);assert.equal(r.json instanceof Function,true);let body=await r.json();assert.equal(body.data.levels.L0.rule,'线上规则');r=await fetch(base+'/ai-analysis-policy?regionCode=domestic&communityId=c',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify((()=>{const p=require('../src/services/aiAnalysisPolicy').defaultPolicy();p.levels.L1={intensity:'off',ranges:['comment'],rule:'仅评论'};return p})())});assert.equal(r.status,200);body=await r.json();assert.equal(body.data.levels.L1.intensity,'off')});




test('AI policy rejects empty ranges and missing community',async()=>{const p=require('../src/services/aiAnalysisPolicy').defaultPolicy();p.levels.L1.ranges=[];let r=await fetch(base+'/ai-analysis-policy?regionCode=domestic&communityId=c',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(p)});assert.equal(r.status,400);r=await fetch(base+'/ai-analysis-policy?regionCode=domestic');assert.equal(r.status,400)});
test('debug HTTP API accepts draft text and exposes only its scoped task', async () => {
  app.repo.getGame = async () => ({ name: '测试游戏' });
  app.ai.singlePass = true; app.ai.configured = () => true;
  app.ai.analyzeBatch = async items => items.map(() => ({ typeSafeDecision: { final_level: 'L0' }, sentiment: 'neutral', reason: '正常内容' }));
  const response = await fetch(base + '/ai-analysis-policy/test?regionCode=domestic&communityId=c', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ policy: require('../src/services/aiAnalysisPolicy').defaultPolicy(), items: [{ contentType: 'post', body: '今天签到' }] }) });
  assert.equal(response.status, 202);
  const body = await response.json();
  const result = await fetch(base + `/ai-analysis-policy/tests/${body.data.id}?regionCode=domestic&communityId=c`);
  assert.equal(result.status, 200);
  const data = (await result.json()).data;
  assert.equal(data.status, 'completed'); assert.equal(data.results[0].level, 'L0');
  assert.equal((await fetch(base + '/ai-analysis-policy/tests/not-found?regionCode=domestic&communityId=c')).status, 404);
});
