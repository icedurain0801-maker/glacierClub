const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAnalysisResult } = require('../src/services/riskSeverityNormalizer');
const risk = { level: 'L1', claim_type: 'emotion', confidence: 0.9, hit_rules: ['G1'], evidence_types: [], noise_reason: null };
test('ordinary neutral content is normal even when the AI returned L1', () => {
  for (const body of ['欧一回', '签到\nhttps://example.com/image.jpg', '有钻石了', '大富翁是不是每天给15个普通骰子和2个指定骰子', '这算有用的属性吗？', '两个红抽。太羡慕了。', '怎么弄的']) {
    const result = normalizeAnalysisResult({sentiment:'neutral',severity:'attention',riskDecision:risk}, {body});
    assert.equal(result.severity, 'normal', body);
    assert.equal(normalizeAnalysisResult(result, {body}).severity, 'normal', 'cache roundtrip: ' + body);
  }
});
test('actual dissatisfaction and incomplete fault reports remain watchable', () => {
  for (const [body,sentiment] of [['140多黑石头就一个能看','negative'],['最烦就是自走棋，太耗时间。','negative'],['进不去了','neutral'],['偶尔闪退','neutral']]) {
    assert.equal(normalizeAnalysisResult({sentiment,severity:'attention',riskDecision:risk},{body}).severity,'attention',body);
  }
});
test('neutral concrete product issues still escalate', () => {
  const body='显示增加100积分，但是积分没有变';
  const result=normalizeAnalysisResult({sentiment:'neutral',severity:'attention',riskDecision:risk},{body});
  assert.equal(result.severity,'negative');
});
