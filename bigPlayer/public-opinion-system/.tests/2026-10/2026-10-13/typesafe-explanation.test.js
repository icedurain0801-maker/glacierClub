const test = require('node:test');
const assert = require('node:assert/strict');
const { TypeSafeExplanation } = require('../../../server/src/integrations/typeSafeExplanation');
const { TypeSafeAnalyzer } = require('../../../server/src/integrations/typeSafeAnalyzer');
const { normalizeAnalysisResult } = require('../../../server/src/services/riskSeverityNormalizer');
const text = '竞技场第三回合卡死，重进判负扣分';
const decision = { final_level: 'L2', raw_level: 'L2', evidence: text, status: 'auto_passed' };
const env = { AI_ANALYSIS_URL: 'https://isolated.invalid/chat', AI_ANALYSIS_TOKEN: 'isolated', AI_ANALYSIS_LIGHT_MODEL: 'gpt-4.1-mini' };
test('one short call validates original quote and records usage', async () => {
  let calls = 0;
  const adapter = new TypeSafeExplanation(env, { fetchImpl: async (_, opts) => {
    calls++; const body = JSON.parse(opts.body); assert.equal(body.max_tokens, 220); assert.equal(body.response_format.type, 'json_object');
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reason: '明确报告竞技场技能卡死并造成判负扣分，可核查功能故障，未报告群体中断。', quote: '第三回合卡死' }) } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }) };
  } });
  const result = await adapter.explain(text, decision);
  assert.equal(calls, 1); assert.equal(result.status, 'generated'); assert.equal(result.totalTokens, 30); assert(result.reason.includes('第三回合卡死'));
});
test('fabricated quotes, timeout and HTTP errors fail without retries or sensitive errors', async () => {
  for (const response of [() => { throw new Error('secret'); }, () => ({ ok: false, status: 401 }), () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"reason":"错误","quote":"全服宕机"}' } }] }) })]) {
    let calls = 0; const result = await new TypeSafeExplanation(env, { fetchImpl: async () => { calls++; return response(); } }).explain(text, decision);
    assert.equal(result.status, 'failed'); assert.equal(calls, 1); assert(!JSON.stringify(result).includes('secret'));
  }
});
test('only risk results call explainer; grade survives persistence; cache reuses explanation', async () => {
  let calls = 0;
  const ai = new TypeSafeAnalyzer({}, { explainer: { explain: async () => { calls++; return { status: 'generated', reason: '原文“第三回合卡死”：报告具体竞技场故障。', inputTokens: 2, outputTokens: 3, totalTokens: 5 }; } }, fetchImpl: async (_, opts) => {
    const normal = JSON.parse(opts.body).state.text === '新人求助';
    return { ok: true, json: async () => ({ answers: { level: { choice: normal ? 'L0' : 'L2', confidence: .9 }, has_verifiable_issue: { noul: .8 }, emergency_trigger: { choice: 'none' }, sentiment: { choice: normal ? 'neutral' : 'negative' }, reason: { choice: normal ? 'normal' : 'issue' }, evidence: { choice: 'q0' }, quality: { score: 0 }, recommend_home: { noul: 0 }, recommend_pin: { noul: 0 }, recommend_feature: { noul: 0 } } }) };
  } });
  ai.key = () => 'isolated';
  const [normal, risk] = await ai.analyzeBatch([{ body: '新人求助' }, { body: text }]);
  assert.equal(calls, 1); assert.equal(normal.rawAnalysis.explanation.status, 'skipped_normal'); assert.equal(risk.severity, 'negative'); assert.equal(risk.totalTokens, 5);
  await ai.analyze({ body: text }); assert.equal(calls, 1);
  const persisted = normalizeAnalysisResult({ risk_context: JSON.stringify({ rawAnalysis: risk.rawAnalysis }) }, { body: text });
  assert.equal(persisted.severity, 'negative'); assert.equal(persisted.reason, risk.reason);
});
test('failed explanation preserves decision and exposes honest fallback', async () => {
  const ai = new TypeSafeAnalyzer({});
  assert.equal((await ai.explainer.explain(text, decision)).errorCode, 'EXPLANATION_NOT_CONFIGURED');
});
