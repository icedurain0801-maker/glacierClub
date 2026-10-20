const test = require('node:test');
const assert = require('node:assert/strict');
const { TypeSafeAnalyzer } = require('../../../server/src/integrations/typeSafeAnalyzer');
const { normalizeAnalysisResult } = require('../../../server/src/services/riskSeverityNormalizer');
const { AiAnalyzer } = require('../../../server/src/integrations/aiAnalyzer');
function response(level='L2', confidence=.9, issue=.8, trigger='none') { return { answers: { level:{choice:level,confidence},has_verifiable_issue:{noul:issue},emergency_trigger:{choice:trigger},sentiment:{choice:'negative'},reason:{choice:'issue'},evidence:{choice:'q0'},quality:{score:0},recommend_home:{noul:0},recommend_pin:{noul:0},recommend_feature:{noul:0} } }; }
test('factory switches provider and keeps legacy available',()=>{
 assert(new AiAnalyzer({PUBLIC_OPINION_ANALYSIS_PROVIDER:'typesafe'}) instanceof TypeSafeAnalyzer);
 assert(!(new AiAnalyzer({PUBLIC_OPINION_ANALYSIS_PROVIDER:'legacy'}) instanceof TypeSafeAnalyzer));
});
test('confidence, emergency and verifiable gates survive repeated normalization and persistence',()=>{
 const ai=new TypeSafeAnalyzer({});const text='竞技场第三回合卡死';const questions=ai.questions(text);
 for(const [raw,confidence,issue,trigger,expected,status]of [['L2',.5,.8,'none','attention','auto_passed'],['L3',.5,.8,'login_or_asset','negative','manual_review'],['L3',.9,.8,'none','negative','auto_passed'],['L3',.9,.2,'login_or_asset','attention','auto_passed'],['L0',.9,.1,'none','normal','auto_passed']]){
  const result=ai.parse(response(raw,confidence,issue,trigger),text,questions);
  assert.equal(result.severity,expected);assert.equal(result.typeSafeDecision.status,status);
  const normalized=normalizeAnalysisResult(result,{body:text});assert.equal(normalized.severity,expected);assert.equal(normalized.needsDeep,false);
  const persisted=normalizeAnalysisResult({severity:expected,risk_context:JSON.stringify({rawAnalysis:normalized.rawAnalysis})},{body:text});assert.equal(persisted.severity,expected);assert(persisted.reason.includes(text));
 }
});
test('invalid answers are never converted to normal',()=>{
 const ai=new TypeSafeAnalyzer({});const data=response();data.answers.level.confidence=NaN;
 assert.throws(()=>ai.parse(data,'test',ai.questions('test')),{code:'TYPESAFE_INVALID_RESPONSE'});
});
test('batch concurrency 10 and comments do not inherit parent title',async()=>{
 let active=0,max=0;const payloads=[];
 const ai=new TypeSafeAnalyzer({}, {explainer: { explain: async () => ({ status: 'generated', reason: '普通评论，没有具体问题或紧急事实。', inputTokens: 1, outputTokens: 1, totalTokens: 2 }) }, fetchImpl:async(_,options)=>{
  active++;max=Math.max(max,active);payloads.push(JSON.parse(options.body));await new Promise(r=>setTimeout(r,10));active--;
  return {ok:true,status:200,json:async()=>response('L0')};
 }});ai.key=()=> 'isolated-key';
 const results=await ai.analyzeBatch(Array.from({length:25},(_,i)=>({contentType:'comment',title:'全服炸服',body:'普通评论'+i})));
 assert.equal(results.length,25);assert.equal(max,10);assert(payloads.every(p=>!p.state.text.includes('全服炸服')));
 assert(payloads.every(p=>Object.values(p.questions).every(q=>['choice','noul','score'].includes(q.type))));
});
test('401 does not retry or invoke legacy',async()=>{
 let calls=0;const ai=new TypeSafeAnalyzer({}, {fetchImpl:async()=>{calls++;return {ok:false,status:401};}});
 await assert.rejects(ai.request({},'test'),{code:'TYPESAFE_HTTP_401'});assert.equal(calls,1);
});
