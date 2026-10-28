const test = require('node:test'), assert = require('node:assert/strict');
const { mergeFeedback } = require('../src/services/feedbackMerge');
test('same translated meaning across languages merges by distinct content ID', () => {
  const items = [{ text: 'ハロウィン', translatedText: '万圣节', count: 29, feedbackIds: ['1','2'] }, { text: '할로윈', translatedText: '万圣节', feedbackIds: ['2','3'] }, { text: 'halloween', feedbackIds: ['4'] }];
  const result = mergeFeedback(items);
  assert.equal(result.length, 1); assert.equal(result[0].text, '万圣节'); assert.equal(result[0].count, 4);
  assert.deepEqual(result[0].originalTexts, ['ハロウィン','할로윈','halloween']);
  assert.equal(Object.hasOwn(result[0], 'feedbackIds'), false);
});
test('different meanings remain separate and singleton languages can form a frequent term', () => {
  const result = mergeFeedback([{ text:'skin',translatedText:'皮肤',feedbackIds:['1'] },{text:'スキン',translatedText:'皮肤',feedbackIds:['2']},{text:'halloween event',translatedText:'万圣节活动',feedbackIds:['1','2']},{text:'halloween',feedbackIds:['1','2']}]);
  assert.equal(result.length, 3); assert.equal(result.find(t=>t.text==='皮肤').count,2);
});
test('single-occurrence concrete terms remain and distinct issues are not merged', () => {
  const result = mergeFeedback([{ text: '莉莉丝觉醒材料', feedbackIds: ['1'] }, { text: '伤害不足', feedbackIds: ['2'] }, { text: '伤害削弱', feedbackIds: ['3', '4'] }]);
  assert.equal(result.length, 3); assert.equal(result[0].text, '伤害削弱'); assert.equal(result[1].count, 1);
});
