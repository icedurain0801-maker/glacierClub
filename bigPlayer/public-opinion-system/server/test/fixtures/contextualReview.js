'use strict';
const { TypeSafeAnalyzer } = require('../../src/integrations/typeSafeAnalyzer');
const { TypeSafeUrgentReview } = require('../../src/integrations/typeSafeUrgentReview');
const env = { AI_ANALYSIS_URL: 'https://fixture.invalid/chat/completions', AI_ANALYSIS_TOKEN: 'isolated-fixture', AI_ANALYSIS_LIGHT_MODEL: 'old-mini', AI_ANALYSIS_DEEP_MODEL: 'old-deep' };
function firstPass(level = 'L1') {
  return { answers: { level: { choice: level, confidence: .95 }, has_verifiable_issue: { noul: ['L2', 'L3'].includes(level) ? .99 : 0 }, emergency_trigger: { choice: level === 'L3' ? 'login_or_asset' : 'none' }, sentiment: { choice: 'negative', confidence: .48 }, reason: { choice: level === 'L0' ? 'normal' : level === 'L1' ? 'emotion' : level === 'L2' ? 'issue' : 'emergency' }, evidence: { choice: 'q0' }, quality: { score: 0 }, recommend_home: { noul: 0 }, recommend_pin: { noul: 0 }, recommend_feature: { noul: 0 } } };
}
function reviewValue(input, changes = {}) {
  return { level: 'L1', confidence: .94, hasIssue: false, isQuestion: false, emergency: 'none', reason: '当前评论附和对游戏功能的不满，没有独立报告具体异常。', quote: input.text.slice(0, 100), sentiment: 'negative', sentimentConfidence: .82, sentimentReason: input.context?.status === 'missing' ? '原帖缺失，当前评论语义不足，需谨慎判断。' : '结合原帖讨论的功能限制，当前评论表达认同不满的态度。', ...changes };
}
function fixtureAI({ level = 'L1', review = input => reviewValue(input), onRequest = () => {} } = {}) {
  const requests = [];
  const reviewer = new TypeSafeUrgentReview(env, { fetchImpl: async (_, options) => {
    const payload = JSON.parse(options.body), input = JSON.parse(payload.messages[1].content);
    requests.push({ payload, input }); onRequest(payload, input);
    const value = await review(input);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }));
  } });
  const ai = new TypeSafeAnalyzer(env, { urgentReviewer: reviewer, explainer: { explain: async text => ({ status: 'generated', reason: '当前文字为普通游戏讨论。', quote: text, inputTokens: 0, outputTokens: 0, totalTokens: 0 }) } });
  ai.key = () => 'isolated-fixture'; ai.configured = () => true; ai.request = async () => firstPass(level);
  return { ai, requests };
}
module.exports = { env, firstPass, reviewValue, fixtureAI };
