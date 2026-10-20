const test = require('node:test');
const assert = require('node:assert/strict');
const { TypeSafeAnalyzer, VERSION: PROVIDER } = require('../src/integrations/typeSafeAnalyzer');
const { TypeSafeUrgentReview } = require('../src/integrations/typeSafeUrgentReview');
const { TypeSafeExplanation } = require('../src/integrations/typeSafeExplanation');
const { normalizeAnalysisResult, retainVerifiedUrgent } = require('../src/services/riskSeverityNormalizer');
const { VERSION, hash, assertUrgentValidated } = require('../src/services/urgentValidation');
const { Repository } = require('../src/db/repository');
const riskModes = require('../../shared/riskModes');
const { commentContext, contextHash } = require('../src/services/commentAnalysisContext');
const urgentText = '全服无法登录，持续3小时无法进入游戏';
const env = { AI_ANALYSIS_URL: 'https://isolated.test/chat', AI_ANALYSIS_TOKEN: 'fixture', AI_ANALYSIS_LIGHT_MODEL: 'fixture' };
const response = (level = 'L3', reason = 'emergency') => ({ answers: { level: { choice: level, confidence: .95 }, has_verifiable_issue: { noul: .98 }, emergency_trigger: { choice: level === 'L3' ? 'login_or_asset' : 'none' }, sentiment: { choice: 'neutral', confidence: .9 }, reason: { choice: reason }, evidence: { choice: 'q0' }, quality: { score: 0 }, recommend_home: { noul: 0 }, recommend_pin: { noul: 0 }, recommend_feature: { noul: 0 } } });
const approved = (text = urgentText) => ({ version: VERSION, status: 'approved', level: 'L3', confidence: .95, hasIssue: true, isQuestion: false, emergency: 'login_or_asset', reason: '报告全服持续无法登录，属于群体服务中断，需紧急核查', quote: text, sourceHash: hash(text), model: 'fixture' });
function analyzer({ first = response(), review = approved(), reasonFail = false } = {}) {
  let reviews = 0;
  const ai = new TypeSafeAnalyzer({}, { urgentReviewer: { review: async (_, { content }) => { reviews++; if (review instanceof Error) throw review; return { ...review, model: 'gpt-5.6-luna', sentiment: 'neutral', sentimentConfidence: .9, sentimentReason: commentContext(content).status === 'missing' ? '原帖缺失，仅据当前评论识别态度。' : '当前文字报告具体情况，情感保持中性。', contextStatus: commentContext(content).status, contextHash: contextHash(content) }; } }, explainer: { explain: async (text, decision) => reasonFail ? { status: 'failed' } : { status: 'generated', reason: `原文“${text}”：${decision.final_level === 'L0' ? '仅讨论游戏机制，没有报告实际异常' : '报告具体异常，需要核查'}`, quote: text, inputTokens: 0, outputTokens: 0, totalTokens: 0 } } });
  ai.key = () => 'fixture'; ai.request = async () => first;
  return { ai, reviews: () => reviews };
}
test('screenshot damage consultation contradicting L2 is corrected to L0 with a concrete reason', async () => {
  const { ai } = analyzer({ first: response('L2', 'normal') });
  const result = await ai.analyze({ body: '为何低品质真理伤害那么炸裂\n不是和血量挂钩吗' });
  assert.equal(result.severity, 'normal'); assert.match(result.reason, /游戏机制/);
});
test('L2 dice report is independently reviewed in the combined queue without becoming L3', async () => {
  const text = '我也好奇，我只知道红色的骰子第一天用完了。第二天没有回复，只有白色的骰子恢复了';
  const review = { ...approved(text), level: 'L2', emergency: 'none', reason: '原文报告红色骰子未恢复，需要核查具体异常' };
  const { ai, reviews } = analyzer({ first: response('L2', 'issue'), review });
  const result = await ai.analyze({ content_type: 'comment', title: '全服无法登录', body: text });
  assert.equal(result.severity, 'negative'); assert.equal(reviews(), 1);
  assert.equal(result.rawAnalysis.urgentReview.firstLevel, 'L2');
  assert.match(result.analysisReason, /核查具体异常/);
  assert.equal(normalizeAnalysisResult(result, { content_type: 'comment', body: text }).severity, 'negative');
  assert.deepEqual(riskModes.severitiesForRiskMode('urgent'), ['negative', 'urgent']);
  assert.deepEqual(riskModes.severitiesForRiskMode('negative'), ['negative', 'urgent']);
});
test('confirmed urgent has a second review, exact quote and matching final reason through repeated normalization', async () => {
  const { ai, reviews } = analyzer(); const content = { body: urgentText };
  const result = await ai.analyze(content); assert.equal(reviews(), 1); assert.equal(result.severity, 'urgent');
  assert.equal(result.rawAnalysis.urgentReview.status, 'approved'); assert(result.reason.includes(result.rawAnalysis.urgentReview.quote));
  assert.equal(normalizeAnalysisResult(normalizeAnalysisResult(result, content), content).severity, 'urgent');
  assert.equal(normalizeAnalysisResult({ severity: 'urgent', sentiment: result.sentiment, risk_context: JSON.stringify({ rawAnalysis: result.rawAnalysis }), analysis_reason: result.reason }, content).severity, 'urgent');
});
test('independent reviewer can downgrade and the final explanation follows its decision', async () => {
  const review = { ...approved(), level: 'L2', status: 'downgraded', emergency: 'none', reason: '报告局部异常，未达到紧急条件' };
  const { ai } = analyzer({ review }); const result = await ai.analyze({ body: urgentText });
  assert.equal(result.severity, 'negative'); assert.match(result.reason, /未达到紧急/);
});
test('review errors and reason generation failures fail analysis rather than persist an urgent result', async () => {
  const error = Object.assign(new Error('review unavailable'), { code: 'URGENT_REVIEW_REQUEST_FAILED' });
  await assert.rejects(analyzer({ review: error }).ai.analyze({ body: urgentText }), { code: error.code });
  await assert.rejects(analyzer({ first: response('L0', 'normal'), reasonFail: true }).ai.analyze({ body: '机制如何使用' }), { code: 'ANALYSIS_REASON_REQUIRED' });
});
test('unreviewed legacy, mismatched content, missing reasons, weak confidence and fabricated proof are rejected', async () => {
  const result = await analyzer().ai.analyze({ body: urgentText });
  const mutations = [r => delete r.rawAnalysis.urgentReview, r => r.rawAnalysis.urgentReview.sourceHash = hash('other'), r => r.rawAnalysis.urgentReview.quote = '骰子恢复了', r => r.rawAnalysis.urgentReview.confidence = .5, r => r.typeSafeDecision.confidence = NaN, r => r.typeSafeDecision.has_verifiable_issue = NaN, r => r.typeSafeDecision.emergency_trigger = 'none', r => r.rawAnalysis.urgentReview.confidence = 2, r => { r.reason = ''; r.analysisReason = ''; }, r => r.rawAnalysis.urgentReview.isQuestion = true];
  for (const mutate of mutations) { const copy = structuredClone(result); mutate(copy); assert.throws(() => assertUrgentValidated(copy, { body: urgentText }), { code: 'URGENT_REVIEW_REQUIRED' }); }
  assert.throws(() => normalizeAnalysisResult(result, { body: '内容变了' }), { code: 'URGENT_REVIEW_REQUIRED' });
  assert.throws(() => normalizeAnalysisResult({ ...result, rawAnalysis: {}, typeSafeDecision: { ...result.typeSafeDecision, provider: 'typesafe-v11-production-v1' } }, { body: urgentText }), { code: 'URGENT_REVIEW_REQUIRED' });
  const current = { severity: 'normal', sentiment: 'neutral', reason: '正常咨询', contentFingerprint: 'same' };
  const previous = { severity: 'urgent', content_fingerprint: 'same', riskPolicyVersion: require('../src/services/riskSeverityNormalizer').RISK_POLICY_VERSION, risk_context: JSON.stringify({ rawAnalysis: { typeSafeDecision: { ...result.typeSafeDecision, provider: 'typesafe-v11-production-v1' } } }) };
  assert.equal(retainVerifiedUrgent(current, previous, { body: urgentText }), current);
});
function jsonReply(value) { return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }], usage: { total_tokens: 10 } }) }; }
test('review HTTP contract is blind to the first grade and excludes credentials from results', async () => {
  let payload;
  const reviewer = new TypeSafeUrgentReview(env, { fetchImpl: async (_, opts) => { payload = JSON.parse(opts.body); return jsonReply(approved()); } });
  const result = await reviewer.review(urgentText);
  assert.deepEqual(JSON.parse(payload.messages[1].content), { text: urgentText });
  assert.equal(result.status, 'approved'); assert(!JSON.stringify(result).includes('AI_ANALYSIS_TOKEN'));
});
test('review rejects fabricated, hypothetical, ordinary-dice evidence and invalid JSON', async () => {
  for (const [text, value] of [[urgentText, { ...approved(), quote: '内容不存在' }], ['如果全服无法登录', { ...approved(), quote: '如果全服无法登录' }], ['红色骰子第二天没有恢复', { ...approved(), quote: '红色骰子第二天没有恢复' }], [urgentText, { ...approved(), reason: '' }], [urgentText, { ...approved(), level: 'L2', isQuestion: true }]]) {
    const reviewer = new TypeSafeUrgentReview(env, { fetchImpl: async () => jsonReply(value) }); await assert.rejects(reviewer.review(text));
  }
  await assert.rejects(new TypeSafeUrgentReview(env, { fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [] }) }) }).review(urgentText), { code: 'URGENT_REVIEW_INVALID_RESPONSE' });
});
test('explanation disagreement, missing explanation and fabricated quotes cannot become a successful reason', async () => {
  for (const value of [{ level: 'L0', reason: '正常', quote: urgentText }, { level: 'L2', reason: '', quote: urgentText }, { level: 'L2', reason: '异常', quote: '不存在' }]) {
    const explanation = await new TypeSafeExplanation(env, { fetchImpl: async () => jsonReply(value) }).explain(urgentText, { final_level: 'L2' }); assert.equal(explanation.status, 'failed');
  }
});
test('warehouse blocks unreviewed urgent before writing and rolls back', async () => {
  const repo = Object.create(Repository.prototype); const writes = []; let rolledBack = false;
  const conn = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => { rolledBack = true; }, release() {}, query: async sql => sql.startsWith('SELECT game_id') ? [[{ body: urgentText, fingerprint: 'fp' }]] : sql.startsWith('SELECT * FROM po_analyses') ? [[]] : (writes.push(sql), [[]]) };
  repo.pool = { getConnection: async () => conn };
  await assert.rejects(repo.insertAnalysis('qa', { ...await analyzer().ai.analyze({ body: urgentText }), rawAnalysis: {}, contentFingerprint: 'fp' }), { code: 'URGENT_REVIEW_REQUIRED' });
  assert.equal(writes.length, 0); assert(rolledBack);
});
test('urgent direct alert insertion cannot bypass the analysis gate or link an unreviewed row', async () => {
  const repo = Object.create(Repository.prototype); let inserted = false, rolledBack = false;
  repo.pool = { getConnection: async () => ({ beginTransaction: async () => {}, rollback: async () => { rolledBack = true; }, release() {}, query: async sql => { if (sql.startsWith('SELECT a.*')) return [[{ severity: 'urgent', game_id: 'g', community_id: 'c', sentiment: 'negative', body: urgentText }]]; inserted = true; return [[]]; } }) };
  await assert.rejects(repo.insertAlert({ gameId: 'g', communityId: 'c', severity: 'urgent', contentIds: ['qa'] }), { code: 'URGENT_REVIEW_REQUIRED' });
  assert(!inserted); assert(rolledBack);
});
test('risk list and count SQL require approved review and expose only review metadata', async () => {
  const repo = Object.create(Repository.prototype); const calls = [];
  repo.query = async (sql, params) => { calls.push({ sql, params }); return sql.includes('COUNT(*)') ? [{ total: 0 }] : []; };
  await repo.listContents({ riskMode: 'urgent' }); await repo.countContents({ riskMode: 'urgent' });
  assert(calls.filter(c => c.sql.includes('po_analyses')).every(c => c.sql.includes('urgentReview.status')));
  assert(calls.some(c => c.sql.includes('AS urgent_review')));
  assert(calls.some(c => c.params.includes('urgent'))); assert(calls.some(c => c.params.includes('negative')));
  assert(calls.filter(c => c.sql.includes('po_analyses')).every(c => c.sql.includes("a.severity='negative' OR")));
});

test('active alert links reject unreviewed analysis and stale content atomically', async () => {
  const result = await analyzer().ai.analyze({ body: urgentText });
  for (const valid of [false, true]) {
    const repo = Object.create(Repository.prototype); let inserted = false, committed = false, rollback = false;
    const row = { severity: 'urgent', sentiment: result.sentiment, analysis_reason: result.reason, game_id: 'g', community_id: 'c', body: urgentText, fingerprint: 'fp', content_fingerprint: 'fp', risk_context: JSON.stringify({ rawAnalysis: valid ? result.rawAnalysis : {} }) };
    repo.pool = { getConnection: async () => ({ beginTransaction: async () => {}, commit: async () => { committed = true; }, rollback: async () => { rollback = true; }, release() {}, query: async sql => {
      if (sql.startsWith('SELECT game_id')) return [[{ game_id: 'g', community_id: 'c', severity: 'urgent', status: 'pending' }]];
      if (sql.startsWith('SELECT a.*')) return [[row]];
      inserted = true; return [[]];
    } }) };
    if (valid) { await repo.linkAlertContent('a', 'c'); assert(inserted && committed && !rollback); }
    else { await assert.rejects(repo.linkAlertContent('a', 'c'), { code: 'URGENT_REVIEW_REQUIRED' }); assert(!inserted && !committed && rollback); }
    row.content_fingerprint = 'old';
    await assert.rejects(repo.linkAlertContent('a', 'c'), { code: 'URGENT_REVIEW_REQUIRED' });
  }
});

test('cache binds the current text even if the caller reuses a stale fingerprint', async () => {
  const { ai, reviews } = analyzer();
  await ai.analyze({ body: urgentText, fingerprint: 'same' });
  ai.request = async () => response('L0', 'normal');
  const next = await ai.analyze({ body: '为何伤害和血量挂钩', fingerprint: 'same' });
  assert.equal(next.severity, 'normal'); assert.equal(reviews(), 1);
});

test('worker retries failed reviews and reasons without saving results or notifying, then marks exhausted jobs failed', async () => {
  require('../src/runtimeEnv').loadRuntimeEnv = () => false;
  const { Q1AnalysisRunner } = require('../../worker/src/q1DailyAnalysisRunner');
  for (const code of ['URGENT_REVIEW_REQUEST_FAILED', 'URGENT_REVIEW_INVALID_RESPONSE', 'ANALYSIS_REASON_REQUIRED']) {
    for (const attempts of [1, 2]) {
      const finished = []; let writes = 0, alerts = 0;
      const repo = { claimAnalysisJobs: async () => [{ id: 'j', content_id: 'c', body: urgentText, attempts, fingerprint: 'fp', lease_owner: 'test' }], getAnalysisCache: async () => [],
        insertAnalysis: async () => { writes++; }, finishAnalysisJob: async (_, value) => { finished.push(value); } };
      const ai = { selectProfile: () => ({ name: 'light', version: 'test' }), cacheKey: () => 'test', analyzeBatch: async () => { throw Object.assign(new Error(code), { code }); } };
      const runner = new Q1AnalysisRunner({ repo, ai, alertEngine: { process: async () => { alerts++; } }, maxAttempts: 2, log() {} });
      assert.equal(await runner.processBatch('light'), 0);
      assert.equal(writes, 0); assert.equal(alerts, 0); assert.equal(finished[0].errorCode, code);
      assert.equal(finished[0].status, attempts === 1 ? 'retryable' : 'failed');
    }
  }
});


test('L2 second review can clear or downgrade a false alarm and replace first-pass evidence', async () => {
  const text = '为何低品质真理伤害那么炸裂';
  for (const level of ['L0', 'L1']) {
    const review = { ...approved(text), level, status: 'downgraded', hasIssue: false, isQuestion: level === 'L0', emergency: 'none', reason: level === 'L0' ? '本条仅咨询伤害机制，未报告实际异常' : '仅表达个人感受，缺少可核查异常' };
    const { ai, reviews } = analyzer({ first: response('L2', 'issue'), review });
    const result = await ai.analyze({ body: text });
    assert.equal(reviews(), 1); assert.equal(result.severity, level === 'L0' ? 'normal' : 'attention');
    assert.equal(result.typeSafeDecision.final_level, level); assert.equal(result.typeSafeDecision.has_verifiable_issue, 0);
    assert(result.analysisReason.includes(review.reason)); assert(result.analysisReason.includes(text));
  }
});
test('L2 can become L3 only with validated serious evidence; L2 review failure is retried without caching', async () => {
  const { ai } = analyzer({ first: response('L2', 'issue') });
  const result = await ai.analyze({ body: urgentText });
  assert.equal(result.severity, 'urgent'); assert.equal(result.typeSafeDecision.emergency_trigger, 'login_or_asset');
  assertUrgentValidated(result, { body: urgentText });
  const failed = analyzer({ first: response('L2', 'issue'), review: Object.assign(new Error('unavailable'), { code: 'URGENT_REVIEW_REQUEST_FAILED' }) }).ai;
  await assert.rejects(failed.analyze({ body: urgentText }), { code: 'URGENT_REVIEW_REQUEST_FAILED' });
  assert.equal(failed.cache.size, 0);
});
test('new L2 policy rejects missing, weak or mismatched review before warehouse writes', async () => {
  const text = '活动奖励未到账';
  const review = { ...approved(text), level: 'L2', emergency: 'none', reason: '报告活动奖励未到账，是具体可核查异常' };
  const result = await analyzer({ first: response('L2', 'issue'), review }).ai.analyze({ body: text });
  for (const mutate of [r => delete r.rawAnalysis.urgentReview, r => r.rawAnalysis.urgentReview.confidence = .7, r => r.rawAnalysis.urgentReview.quote = '伪造原文', r => r.rawAnalysis.urgentReview.sourceHash = hash('different'), r => r.rawAnalysis.urgentReview.hasIssue = false, r => r.typeSafeDecision.final_level = 'L3']) {
    const copy = structuredClone(result); mutate(copy);
    assert.throws(() => assertUrgentValidated(copy, { body: text }), { code: 'URGENT_REVIEW_REQUIRED' });
  }
  let writes = 0, rolledBack = false;
  const repo = Object.create(Repository.prototype);
  repo.pool = { getConnection: async () => ({ beginTransaction: async () => {}, commit: async () => {}, rollback: async () => { rolledBack = true; }, release() {}, query: async sql => sql.startsWith('SELECT game_id') ? [[{ body: text, fingerprint: 'fp' }]] : sql.startsWith('SELECT * FROM po_analyses') ? [[]] : (writes++, [[]]) }) };
  await assert.rejects(repo.insertAnalysis('test', { ...result, rawAnalysis: {}, contentFingerprint: 'fp' }), { code: 'URGENT_REVIEW_REQUIRED' });
  assert.equal(writes, 0); assert(rolledBack);
});
test('L2 HTTP reviewer rejects weak confidence, questions and nonexistent quotations', async () => {
  const text = '活动奖励未到账';
  const value = { ...approved(text), level: 'L2', emergency: 'none', reason: '报告活动奖励未到账，是具体可核查异常' };
  assert.equal((await new TypeSafeUrgentReview(env, { fetchImpl: async () => jsonReply(value) }).review(text)).status, 'approved');
  for (const invalid of [{ ...value, confidence: .7 }, { ...value, isQuestion: true }, { ...value, hasIssue: false }, { ...value, quote: '不存在' }]) {
    await assert.rejects(new TypeSafeUrgentReview(env, { fetchImpl: async () => jsonReply(invalid) }).review(text));
  }
});
