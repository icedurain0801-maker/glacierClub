'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixtureAI, reviewValue, env } = require('./fixtures/contextualReview');
const { TypeSafeExplanation } = require('../src/integrations/typeSafeExplanation');
const { normalizeAnalysisResult } = require('../src/services/riskSeverityNormalizer');

for (const body of ['已经尽力', '新人求助，这套阵容第三关怎么过？', '今天打到第三关了']) {
  test(`false L1 ${body} is replaced by the independent normal decision and sentiment`, async () => {
    const { ai, requests } = fixtureAI({ review: input => reviewValue(input, {
      level: 'L0', sentiment: 'neutral', sentimentConfidence: .96,
      reason: '仅陈述游戏进展或寻求玩法帮助，没有对产品表达不满，也没有报告异常。',
      sentimentReason: '当前文字属于正常讨论，没有明确负面态度。'
    }) });
    const item = { contentType: 'post', body };
    const result = await ai.analyze(item);
    assert.equal(requests.length, 1);
    assert.match(requests[0].payload.messages[0].content, /没有明显不满且没有实际异常，必须返回L0/);
    assert.equal(result.rawAnalysis.firstPassDecision.final_level, 'L1');
    assert.equal(result.typeSafeDecision.final_level, 'L0');
    assert.equal(result.severity, 'normal');
    assert.equal(result.sentiment, 'neutral');
    assert.equal(result.negativeScore, 0);
    assert.equal(result.rawAnalysis.sentimentScore, .96);
    assert.equal(result.rawAnalysis.urgentReview.status, 'downgraded');
    assert.match(result.analysisReason, /没有对产品表达不满/);
    const normalized = normalizeAnalysisResult(result, item);
    assert.equal(normalized.severity, 'normal');
    assert.equal(normalized.reason, result.analysisReason);
    assert.equal((await ai.analyze(item)).severity, 'normal');
    assert.equal(requests.length, 1, 'only reviewed final results may enter the cache');
  });
}

test('neutral wording of an actual fault remains L2 instead of being cleared as no dissatisfaction', async () => {
  const { ai } = fixtureAI({ level: 'L2', review: input => reviewValue(input, {
    level: 'L2', hasIssue: true, sentiment: 'neutral', emergency: 'none',
    reason: '报告竞技场第三回合技能卡死并扣分，存在具体可核查对象和异常。',
    sentimentReason: '以中性语气陈述故障事实。'
  }) });
  const result = await ai.analyze({ body: '竞技场新英雄第三回合技能卡死，重新进入判负扣分' });
  assert.equal(result.severity, 'negative');
  assert.equal(result.typeSafeDecision.final_level, 'L2');
  assert.equal(result.sentiment, 'neutral');
  assert.match(result.reason, /技能卡死/);
});

test('failed independent L1 review does not fall back to the earlier negative probability or explanation', async () => {
  const { ai } = fixtureAI({ review: () => { throw Error('review unavailable'); } });
  await assert.rejects(ai.analyze({ body: '已经尽力' }), { code: 'URGENT_REVIEW_REQUEST_FAILED' });
  assert.equal(ai.cache.size, 0);
});

test('explanation cannot silently disagree with an L1 decision', async () => {
  const explainer = new TypeSafeExplanation(env, { fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ level: 'L0', reason: '没有明显不满，仅陈述努力状态。', quote: '已经尽力' }) } }] })) });
  assert.equal((await explainer.explain('已经尽力', { final_level: 'L1' })).status, 'failed');
});
