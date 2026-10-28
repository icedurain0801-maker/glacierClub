const test = require('node:test'), assert = require('node:assert/strict');
const { TypeSafeQualityExplanation } = require('../src/integrations/typeSafeQualityExplanation');
const { TypeSafeAnalyzer } = require('../src/integrations/typeSafeAnalyzer');
const ui = require('../../../admin/PublicOpinion/assets/alerts.js');
const text = '分享第33关通关阵容：前排放坦克，后排搭配治疗，第三回合集中输出。治疗需要保留技能应对后排受伤，输出优先攻击敌方核心，低练度可先补防御装备。';
const reason = '给出第三十三关前后排搭配和集中输出时机，为卡关玩家提供可参考的阵容思路，适合首页推荐。';
const env = { AI_ANALYSIS_URL:'https://fixture.test/chat', AI_ANALYSIS_TOKEN:'fixture-secret', AI_ANALYSIS_MODEL:'fixture' };
const response = value => ({ ok:true, json:async()=>({choices:[{message:{content:JSON.stringify(value)}}],usage:{prompt_tokens:2,completion_tokens:3}}) });
test('recommendation explanation requests value and exact source evidence without changing decisions', async()=>{
  let payload; const decision={recommendHome:true,recommendPin:false,recommendFeature:false,qualityScore:.95};
  const explainer=new TypeSafeQualityExplanation(env,{fetchImpl:async(_,o)=>{payload=JSON.parse(o.body);return response({reason,quote:'前排放坦克，后排搭配治疗'});}});
  const result=await explainer.explain(text,decision);
  assert.equal(result.status,'generated');assert.match(result.reason,/第三十三关/);assert.equal(result.totalTokens,5);
  assert.deepEqual(JSON.parse(payload.messages[1].content).recommendations,['首页推荐']);
  assert.deepEqual(decision,{recommendHome:true,recommendPin:false,recommendFeature:false,qualityScore:.95});
  assert(!JSON.stringify(result).includes('fixture-secret'));
});
test('invalid, fabricated, non-Chinese and failed explanations cannot masquerade as saved quality reasons',async()=>{
  for(const value of [{reason,quote:'不存在的原文依据'},{reason:'正常',quote:'前排放坦克，后排搭配治疗'},{reason:'This post is a useful detailed guide.',quote:'前排放坦克，后排搭配治疗'}]) {
    const result=await new TypeSafeQualityExplanation(env,{fetchImpl:async()=>response(value)}).explain(text,{recommendHome:true});assert.equal(result.status,'failed');
  }
  const failed=await new TypeSafeQualityExplanation(env,{fetchImpl:async()=>{throw Error('private');}}).explain(text,{recommendHome:true});assert.equal(failed.errorCode,'QUALITY_EXPLANATION_REQUEST_FAILED');
});
test('evidence index selects an exact bounded source fragment; invalid indices and stitched quotes fail',async()=>{
  let options;
  const result=await new TypeSafeQualityExplanation(env,{fetchImpl:async(_,o)=>{
    options=JSON.parse(JSON.parse(o.body).messages.at(-1).content).quoteOptions;
    return response({reason,quoteIndex:0});
  }}).explain(text,{recommendHome:true});
  assert.equal(result.status,'generated');assert.equal(result.quote,options[0]);assert(text.includes(result.quote));assert(result.quote.length<=60);
  for(const value of [{reason,quoteIndex:-1},{reason,quoteIndex:999},{reason,quoteIndex:'0'},{reason,quote:'前排放坦克...第三回合集中输出'},{reason,quote:text}]) {
    assert.equal((await new TypeSafeQualityExplanation(env,{fetchImpl:async()=>response(value)}).explain(text,{recommendHome:true})).status,'failed');
  }
});
function analyzer(qualityExplainer, recommended=true) {
  const ai=new TypeSafeAnalyzer({}, {qualityExplainer,explainer:{explain:async()=>({status:'generated',reason:'内容分享通关经验，未表达不满或实际异常',inputTokens:0,outputTokens:0,totalTokens:0})}});
  ai.key=()=> 'fixture';ai.request=async()=>({answers:{level:{choice:'L0',confidence:.95},has_verifiable_issue:{noul:0},emergency_trigger:{choice:'none'},sentiment:{choice:'neutral',confidence:.9},reason:{choice:'normal'},evidence:{choice:'q0'},quality:{score:3},recommend_home:{noul:recommended?.95:0},recommend_pin:{noul:0},recommend_feature:{noul:0}}});return ai;
}
test('new analysis persists a separate quality reason and prevents legacy-cache reuse',async()=>{
  const ai=analyzer({explain:async()=>({status:'generated',reason,quote:'前排放坦克，后排搭配治疗',inputTokens:2,outputTokens:3,totalTokens:5})});
  const result=await ai.analyze({body:text});assert.equal(result.qualityReason,reason);assert.notEqual(result.analysisReason,reason);assert.equal(result.recommendHome,true);assert.equal(result.recommendPin,false);assert.equal(result.severity,'normal');assert.equal(result.totalTokens,5);assert.equal(result.rawAnalysis.qualityExplanation.reason,reason);
  const crypto=require('node:crypto'),profile=ai.selectProfile('light');const legacy=crypto.createHash('sha256').update(JSON.stringify({version:require('../src/integrations/typeSafeAnalyzer').VERSION,sentimentVersion:1,explanationVersion:require('../src/integrations/typeSafeExplanation').EXPLANATION_VERSION,fingerprint:'fp',profile:profile.name})).digest('hex');assert.notEqual(ai.cacheKey('fp',profile),legacy);
});
test('recommended analysis retries when quality reason fails; nonrecommended analysis needs no quality call',async()=>{
  const ai=analyzer({explain:async()=>({status:'failed'})});await assert.rejects(ai.analyze({body:text}),{code:'QUALITY_REASON_REQUIRED'});assert.equal(ai.cache.size,0);
  const ordinary=analyzer({explain:async()=>{throw Error('must not call');}},false);assert.equal((await ordinary.analyze({body:text})).qualityReason,'');
});
test('actions omit duplicate visible recommendation names while retaining accessible context',()=>{
  const html=ui.qualityActionHtml({id:'q',recommend_home:true,recommend_pin:true});assert.doesNotMatch(html,/<span class="subline">/);assert.match(html,/aria-label="首页推荐：采纳"/);assert.match(html,/aria-label="栏目置顶：忽略"/);assert.equal((html.match(/data-quality-action/g)||[]).length,6);
});
test('quality UI shows recommendation value instead of risk analysis, with escaped text and no placeholder fallback',()=>{
  assert.equal(ui.qualityReasonHtml({analysis_reason:'未表达负面情绪',quality_reason:'分享阵容搭配与技能使用时机，供卡关玩家参考'}),'分享阵容搭配与技能使用时机，供卡关玩家参考');
  assert.equal(ui.qualityReasonHtml({analysis_reason:'未表达负面情绪',quality_reason:'TypeSafe结构化质量及推荐判断'}),'推荐理由待生成');
  assert.equal(ui.qualityReasonHtml({analysis_reason:'未表达负面情绪'}),'推荐理由待生成');
  assert.match(ui.qualityReasonHtml({qualityReason:'<script>分享具体攻略方法</script>'}),/&lt;script&gt;/);
});
