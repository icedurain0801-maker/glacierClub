const test = require('node:test');
const assert = require('node:assert/strict');
const { sentimentProbability, TypeSafeAnalyzer } = require('../../../server/src/integrations/typeSafeAnalyzer');
global.window = { PublicOpinionRiskModes: require('../../../shared/riskModes') };
const { sentimentPercentage } = require('../../../../admin/PublicOpinion/assets/content.js');
test('positive and neutral use their own probability, never risk confidence or negative score', () => {
  assert.equal(sentimentPercentage({sentiment:'positive',sentiment_score:.96,negative_score:0,confidence:.4}), ' · 96%');
  assert.equal(sentimentPercentage({sentiment:'neutral',sentiment_score:.87,negative_score:0}), ' · 87%');
  assert.equal(sentimentPercentage({sentiment:'positive',negative_score:0,confidence:.99}), '');
});
test('negative display is unchanged even when separate sentiment probability exists', () => {
  assert.equal(sentimentPercentage({sentiment:'negative',negative_score:.53,sentiment_score:.99}), ' · 53%');
  assert.equal(sentimentPercentage({sentiment:'negative',negativeScore:0}), ' · 0%');
});
test('probability validates bounds and missing values without invented fallback', () => {
  assert.equal(sentimentProbability({choice:'positive',confidence:.98,probabilities:{positive:.99}},'positive'),.99);
  assert.equal(sentimentProbability({choice:'neutral',confidence:.91},'neutral'),.91);
  for (const value of [null,undefined,NaN,Infinity,-1,1.1,'0.9']) {
    assert.equal(sentimentProbability({probabilities:{neutral:value}},'neutral'),null);
  }
  assert.equal(sentimentProbability({choice:'negative',confidence:.9},'positive'),null);
});
test('stored raw analysis keeps separate emotion probability without changing existing negative or risk result',()=>{
 const a=new TypeSafeAnalyzer();const text='今天签到';const answers={level:{choice:'L0',confidence:.7},has_verifiable_issue:{noul:0},emergency_trigger:{choice:'none'},sentiment:{choice:'positive',confidence:.98,probabilities:{positive:.99}},reason:{choice:'normal'},evidence:{choice:'q0'},quality:{score:0},recommend_home:{noul:0},recommend_pin:{noul:0},recommend_feature:{noul:0}};
 const result=a.parse({answers},text,a.questions(text));
 assert.equal(result.rawAnalysis.sentimentScore,.99);assert.equal(result.confidence,.7);assert.equal(result.negativeScore,0);assert.equal(result.severity,'normal');
});
