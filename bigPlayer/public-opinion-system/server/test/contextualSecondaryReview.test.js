'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixtureAI, reviewValue, env } = require('./fixtures/contextualReview');
const { TypeSafeUrgentReview } = require('../src/integrations/typeSafeUrgentReview');
const { CONTEXT_PROVIDER, commentContext, contextHash, contextJoins } = require('../src/services/commentAnalysisContext');
const { assertUrgentValidated } = require('../src/services/urgentValidation');
const { normalizeAnalysisResult } = require('../src/services/riskSeverityNormalizer');
const { defaultPolicy } = require('../src/services/aiAnalysisPolicy');
const { Repository } = require('../src/db/repository');
const comment = () => ({ contentType: 'comment', body: '맞아요 ㅠㅠ', fingerprint: 'same', analysisContext: { status: 'available', root: { id: 'p1', title: '让玩家之间赠送资源', body: '资源不能赠送很不方便，希望开放赠送。' } } });

test('L1 is independently reviewed by fixed Luna even when configured models and light policy differ', async () => {
  const { ai, requests } = fixtureAI();
  const result = await ai.analyze({ contentType: 'post', body: '这次活动体验很差', analysisPolicy: defaultPolicy() });
  assert.equal(requests.length, 1); assert.equal(requests[0].payload.model, 'gpt-5.6-luna'); assert.equal(requests[0].payload.max_completion_tokens, 2400); assert.equal(requests[0].payload.max_tokens, undefined);
  assert.equal(requests[0].input.firstLevel, undefined); assert.equal(requests[0].input.reason, undefined);
  assert.equal(result.rawAnalysis.urgentReview.firstLevel, 'L1'); assert.equal(result.severity, 'attention');
  assert.equal(result.typeSafeDecision.provider, CONTEXT_PROVIDER);
  const missing = structuredClone(result); delete missing.rawAnalysis.urgentReview;
  assert.throws(() => assertUrgentValidated(missing, { body: '这次活动体验很差' }), { code: 'SECONDARY_REVIEW_REQUIRED' });
});

for (const [sentiment, level, body, why] of [
  ['negative', 'L1', '맞아요 ㅠㅠ', '结合原帖的功能限制，评论认同不便并表达轻微不满。'],
  ['positive', 'L0', '不对，现在已经可以赠送了，很方便', '评论反驳原帖的不满并肯定当前功能，属于正面反馈。'],
  ['neutral', 'L0', '这个功能在哪个菜单？', '结合原帖可知是在询问功能入口，没有表达好恶。']
]) test(`comment sentiment ${sentiment} and final risk follow its stance rather than parent grade`, async () => {
  const item = { ...comment(), body };
  const { ai, requests } = fixtureAI({ level: 'L0', review: input => reviewValue(input, { level, sentiment, hasIssue: false, isQuestion: sentiment === 'neutral', reason: why, sentimentReason: why }) });
  const result = await ai.analyze(item);
  assert.equal(requests.length, 1, 'L0 comments still require contextual review');
  assert.equal(requests[0].input.text, body); assert.equal(requests[0].input.context.root.body, item.analysisContext.root.body);
  assert.equal(result.sentiment, sentiment); assert.equal(result.severity, level === 'L1' ? 'attention' : 'normal');
  assert.equal(result.rawAnalysis.urgentReview.status, 'approved', 'same-level normal review is not mislabeled as a downgrade');
  assert.equal(result.rawAnalysis.sentimentScore, .82); assert.equal(result.rawAnalysis.sentimentReason, why);
  assert.equal(normalizeAnalysisResult(result, item).sentiment, sentiment);
});

test('missing and unavailable original post is explicit and missing-context explanation is mandatory', async () => {
  const { ai, requests } = fixtureAI({ review: input => reviewValue(input, { level: 'L0', sentiment: 'neutral' }) });
  const result = await ai.analyze({ content_type: 'comment', title: '不能作为原帖的旧标题', body: '맞아요 ㅠㅠ' });
  assert.deepEqual(requests[0].input.context, { status: 'missing' }); assert.equal(requests[0].input.text, '맞아요 ㅠㅠ');
  assert.match(result.rawAnalysis.sentimentReason, /原帖缺失/); assert.equal(result.sentiment, 'neutral');
  const variant = fixtureAI({ review: input => reviewValue(input, { level: 'L0', sentiment: 'neutral', sentimentReason: '缺少原始讨论语境，仅为简短附和，无法确定好恶。' }) });
  const marked = await variant.ai.analyze({ contentType: 'comment', body: '是的' });
  assert.match(marked.rawAnalysis.sentimentReason, /^原帖缺失；/);
});

test('reply context remains separate and context changes invalidate memory and persistent cache keys', async () => {
  const item = comment(); item.analysisContext.parent = { id: 'reply1', body: '我觉得这限制挺合理' };
  const { ai, requests } = fixtureAI();
  await ai.analyze(item); await ai.analyze(item); assert.equal(requests.length, 1);
  const previous = ai.cacheKey('same', ai.selectProfile('light'), item);
  item.analysisContext.root.body = '已开放赠送，体验很好。'; await ai.analyze(item); assert.equal(requests.length, 2);
  assert.notEqual(ai.cacheKey('same', ai.selectProfile('light'), item), previous);
  assert.equal(requests[0].input.context.parent.body, '我觉得这限制挺合理');
  const job = { content_type: 'comment', body: item.body, analysis_root_id: 'p1', analysis_root_title: item.analysisContext.root.title, analysis_root_body: item.analysisContext.root.body, analysis_parent_id: 'reply1', analysis_parent_body: item.analysisContext.parent.body };
  assert.equal(ai.cacheKey('same', ai.selectProfile('light'), job), ai.cacheKey('same', ai.selectProfile('light'), item));
});

test('L2/L3 still require independent concrete evidence and cannot quote the parent instead', async () => {
  for (const [level, body, emergency] of [['L2', '活动奖励未到账', 'none'], ['L3', '全服无法登录，持续3小时无法进入游戏', 'login_or_asset']]) {
    const { ai } = fixtureAI({ level, review: input => reviewValue(input, { level, hasIssue: true, emergency, reason: '当前原文报告可核查服务异常，需优先处理。', sentimentReason: '当前内容表达对服务异常的不满。' }) });
    const result = await ai.analyze({ contentType: 'post', body });
    assert.equal(result.severity, level === 'L2' ? 'negative' : 'urgent'); assertUrgentValidated(result, { body });
  }
  const { ai } = fixtureAI({ review: input => reviewValue(input, { level: 'L2', quote: input.context.root.body, hasIssue: true }) });
  await assert.rejects(ai.analyze(comment()), { code: 'URGENT_REVIEW_INVALID_RESPONSE' });
});

test('invalid sentiment, invented evidence, model mismatch and upstream failures never become saved results', async () => {
  for (const patch of [{ sentiment: 'mixed' }, { sentimentConfidence: 1.2 }, { sentimentReason: '' }, { quote: '不存在的引文' }]) {
    const { ai } = fixtureAI({ review: input => reviewValue(input, patch) });
    await assert.rejects(ai.analyze(comment())); assert.equal(ai.cache.size, 0);
  }
  const { ai } = fixtureAI(); const item = comment(), result = await ai.analyze(item);
  for (const mutate of [r => r.rawAnalysis.urgentReview.model = 'old-mini', r => r.sentiment = 'positive', r => r.rawAnalysis.commentContext.root.body = '已改变']) {
    const copy = structuredClone(result); mutate(copy); assert.throws(() => assertUrgentValidated(copy, item), { code: 'SECONDARY_REVIEW_REQUIRED' });
  }
  const reviewer = new TypeSafeUrgentReview(env, { fetchImpl: async () => { throw Error('network unavailable'); } });
  await assert.rejects(reviewer.review(item.body, { content: item }), { code: 'URGENT_REVIEW_REQUEST_FAILED' });
});

test('context SQL fences ancestry by ownership, community and board; deleted roots cannot be inherited', async () => {
  for (const scope of ['game_id', 'source_id', 'account_id', 'community_id']) assert(contextJoins.includes(`root.${scope}`) && contextJoins.includes(`parent.${scope}`));
  for (const alias of ['root', 'parent', 'c']) assert(contextJoins.includes("JSON_EXTRACT(" + alias + ".raw_payload,'$.boardId')"));
  assert.match(contextJoins, /root\.id=c\.root_content_id/); assert.match(contextJoins, /parent\.root_content_id=root\.id/);
  assert.match(contextJoins, /root\.is_deleted=0/); assert.match(contextJoins, /parent\.is_deleted=0/);
  assert.deepEqual(commentContext({ content_type: 'comment', root_content_id: 'not-in-scope' }), { status: 'missing' });
  const repo = Object.create(Repository.prototype), calls = [];
  repo.query = async (sql, values) => { calls.push({ sql, values }); return []; };
  await repo._claimAnalysisJobsOnce({ profile: 'light', version: 'v', leaseOwner: 'test' });
  assert(calls.some(v => v.sql.includes(contextJoins) && v.sql.includes('analysis_root_body')));
});

test('warehouse rechecks parent context and rejects changed context before any write', async () => {
  const item = comment(), { ai } = fixtureAI(), result = await ai.analyze(item);
  for (const changed of [false, true]) {
    const repo = Object.create(Repository.prototype); let writes = 0, committed = false, rolledBack = false;
    repo.pool = { getConnection: async () => ({ beginTransaction: async () => {}, commit: async () => { committed = true; }, rollback: async () => { rolledBack = true; }, release() {}, query: async sql => {
      if (sql.startsWith('SELECT game_id')) return [[{ content_type: 'comment', body: item.body, fingerprint: 'same' }]];
      if (sql.startsWith('SELECT root.id')) return [[{ analysis_root_id: 'p1', analysis_root_title: item.analysisContext.root.title, analysis_root_body: changed ? '已改为正面内容' : item.analysisContext.root.body }]];
      if (sql.startsWith('SELECT * FROM po_analyses')) return [[]];
      writes++; return [[]];
    } }) };
    if (changed) { await assert.rejects(repo.insertAnalysis('comment1', { ...result, contentFingerprint: 'same' }), { code: 'SECONDARY_REVIEW_REQUIRED' }); assert.equal(writes, 0); assert(rolledBack); }
    else { await repo.insertAnalysis('comment1', { ...result, contentFingerprint: 'same' }); assert(writes > 0 && committed && !rolledBack); }
  }
  assert.notEqual(contextHash(item), contextHash({ ...item, analysisContext: { status: 'missing' } }));
});
