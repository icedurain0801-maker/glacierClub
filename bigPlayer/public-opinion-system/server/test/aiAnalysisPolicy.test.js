const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultPolicy, normalizePolicy, policyHash } = require('../src/services/aiAnalysisPolicy');
const { TypeSafeAnalyzer } = require('../src/integrations/typeSafeAnalyzer');
const { Repository } = require('../src/db/repository');

test('validation rejects empty ranges, incomplete levels, invalid intensity and long rules', () => {
  for (const mutate of [p => p.levels.L1.ranges = [], p => delete p.levels.L2, p => p.levels.L0.intensity = 'bad', p => p.levels.L3.rule = 'x'.repeat(2001), p => p.levels.L0.rule = '']) {
    const policy = defaultPolicy(); mutate(policy);
    assert.throws(() => normalizePolicy(policy, { strict: true }), { code: 'INVALID_INPUT' });
  }
});
test('community update preserves other communities and is transactionally audited', async () => {
  const stored = { defaults: defaultPolicy(), communities: { a: defaultPolicy(), b: defaultPolicy() } };
  stored.communities.b.levels.L1.rule = 'B的规则';
  let saved, commits = 0, audits = 0;
  const repo = Object.create(Repository.prototype);
  repo.pool = { getConnection: async () => ({ beginTransaction: async () => {}, commit: async () => commits++, rollback: async () => {}, release() {}, query: async (sql, params) => {
    if (sql.startsWith('SELECT')) return [[{ ai_analysis_policy: JSON.stringify(stored) }]];
    if (sql.startsWith('UPDATE')) saved = JSON.parse(params[0]);
    if (sql.startsWith('INSERT')) audits++;
    return [{ affectedRows: 1 }];
  } }) };
  const next = defaultPolicy(); next.levels.L1.rule = 'A的新规则';
  await repo.updateAiAnalysisPolicy('g', 'a', next);
  assert.equal(saved.communities.b.levels.L1.rule, 'B的规则');
  assert.equal(saved.communities.a.levels.L1.rule, 'A的新规则');
  assert.equal(commits, 1); assert.equal(audits, 1);
  repo.getGame = async () => ({ ai_analysis_policy: JSON.stringify(saved) });
  assert.equal((await repo.getAiAnalysisPolicy('g', 'b')).levels.L1.rule, 'B的规则');
  assert.deepEqual(await repo.getAiAnalysisPolicy('g', 'c'), defaultPolicy());
});
test('queue insert binds policy and preserves it for the same content version', async () => {
  const repo = Object.create(Repository.prototype), calls = [];
  repo.query = async (sql, params) => { calls.push({ sql, params }); return []; };
  const policy = defaultPolicy(); policy.levels.L1.rule = '任务快照';
  await repo.enqueueAnalysisJob('c', { contentFingerprint: 'fp', analysisPolicy: policy });
  assert.deepEqual(JSON.parse(calls[0].params[7]), policy);
  assert.match(calls[0].sql, /analysis_policy=IF\(NOT\(content_fingerprint/);
});
function analyzerFixture(level = 'L1') {
  const calls = { requests: [], reviews: 0, explanations: 0 };
  const ai = new TypeSafeAnalyzer({}, { explainer: { explain: async () => { calls.explanations++; return { status: 'generated', reason: '本条表达一般不满，没有明确异常。', inputTokens: 0, outputTokens: 0, totalTokens: 0 }; } }, urgentReviewer: { review: async (text, options) => {
    calls.reviews++; calls.reviewPolicy = options.policy;
    const { commentContext, contextHash } = require('../src/services/commentAnalysisContext');
    return { level: 'L1', confidence: .95, hasIssue: false, isQuestion: false, emergency: 'none', quote: text, reason: '本条只是一般不满，应进入关注级。', status: 'approved', version: require('../src/services/urgentValidation').VERSION, model: 'gpt-5.6-luna', sourceHash: require('../src/services/urgentValidation').hash(text), sentiment: 'negative', sentimentConfidence: .9, sentimentReason: commentContext(options.content).status === 'missing' ? '原帖缺失，仅根据当前文字识别不满。' : '本条对游戏匹配表达不满。', contextStatus: commentContext(options.content).status, contextHash: contextHash(options.content) };
  } } });
  ai.key = () => 'mock-key';
  ai.request = async payload => { calls.requests.push(payload); return {}; };
  ai.parse = (_, text) => ({ severity: level === 'L1' ? 'attention' : 'negative', sentiment: 'negative', negativeScore: .9, confidence: .9, reason: '初判', typeSafeDecision: { provider: require('../src/integrations/typeSafeAnalyzer').VERSION, raw_level: level, final_level: level, status: 'auto_passed', confidence: .9, source_hash: require('../src/services/urgentValidation').hash(text) }, rawAnalysis: { topicDecision: { topics: [] } }, inputTokens: 0, outputTokens: 0, totalTokens: 0, recommendHome: false });
  return { ai, calls };
}
test('edited rules reach TypeSafe; deep strength reaches independent reviewer', async () => {
  const { ai, calls } = analyzerFixture();
  const policy = defaultPolicy(); policy.levels.L1.intensity = 'deep'; policy.levels.L1.rule = '本游戏匹配抱怨需重点核查';
  const [result] = await ai.analyzeBatch([{ body: '匹配太难了', contentType: 'comment', analysisPolicy: policy }]);
  assert.match(calls.requests[0].questions.level.instructions, /本游戏匹配抱怨需重点核查/);
  assert.equal(calls.reviews, 1);
  assert.equal(calls.reviewPolicy.levels.L1.rule, policy.levels.L1.rule);
  assert.equal(result.rawAnalysis.analysisPolicy.hash, policyHash(policy));
});
test('light strength cannot bypass secondary review; disabled level still filters reviewed content', async () => {
  const { ai, calls } = analyzerFixture(); const policy = defaultPolicy();
  await ai.analyzeBatch([{ body: '匹配太难了', contentType: 'comment', analysisPolicy: policy }]);
  assert.equal(calls.reviews, 1); assert.equal(calls.explanations, 0);
  policy.levels.L1.intensity = 'off';
  const [result] = await ai.analyzeBatch([{ body: '匹配太难了', contentType: 'comment', analysisPolicy: policy }]);
  assert.equal(result.severity, 'normal'); assert.equal(result.rawAnalysis.analysisPolicy.filtered, true);
  assert.equal(require('../src/services/riskSeverityNormalizer').normalizeAnalysisResult(result).severity, 'normal');
  assert.equal(result.recommendHome, false); assert.equal(calls.reviews, 2); assert.equal(calls.explanations, 0);
});
test('post-only scope filters comments and policy changes bypass cached results', async () => {
  const { ai, calls } = analyzerFixture(); const policy = defaultPolicy();
  policy.levels.L1.ranges = ['post'];
  const [comment] = await ai.analyzeBatch([{ body: '匹配太难了', contentType: 'comment', analysisPolicy: policy }]);
  assert.equal(comment.rawAnalysis.analysisPolicy.filtered, true);
  policy.levels.L1.ranges.push('comment');
  const [allowed] = await ai.analyzeBatch([{ body: '匹配太难了', contentType: 'comment', analysisPolicy: policy }]);
  assert.equal(allowed.severity, 'attention'); assert.equal(calls.requests.length, 2);
  policy.levels.L1.ranges = ['post'];
  const [post] = await ai.analyzeBatch([{ body: '匹配太难了', contentType: 'post', analysisPolicy: policy }]);
  assert.equal(post.severity, 'attention');
});
test('historical job without snapshot keeps the existing policy behavior', async () => {
  const { ai, calls } = analyzerFixture('L2');
  await ai.analyzeBatch([{ body: '奖励连续三天未到账', contentType: 'post' }]);
  assert.equal(calls.reviews, 1); assert.equal(calls.reviewPolicy, null);
});
