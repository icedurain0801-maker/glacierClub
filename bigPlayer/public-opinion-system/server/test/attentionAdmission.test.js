const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAnalysisResult, retainVerifiedUrgent } = require('../src/services/riskSeverityNormalizer');
const bodies = [
  '游戏中期，符文副本程普、许诸、庞德三选一时，大家优先刷其中的哪个副本？',
  '大佬们，周瑜装备t啥属性？',
  '用银票有啥好处？'
];
test('neutral consultations stay normal even when legacy AI labels game experience related', () => {
  for (const body of bodies) {
    const out = normalizeAnalysisResult({ sentiment: 'neutral', severity: 'attention', gameExperienceRelated: true, gameComplaint: false }, { body });
    assert.equal(out.severity, 'normal', body);
    assert.equal(out.sentiment, 'neutral');
    assert.equal(normalizeAnalysisResult(out, { body }).severity, 'normal');
  }
});
test('narrowing attention preserves verified urgent results from the previous policy', () => {
  const body = '超能世界账号被盗';
  const riskDecision = { level: 'L3', claim_type: 'fact', issue_object: '账号', claim_evidence: body,
    issue_summary: '账号被盗', confidence: 0.9, evidence_types: [], hit_rules: ['R6'], rule_evidence: { R6: body } };
  const prior = normalizeAnalysisResult({ sentiment: 'negative', severity: 'urgent', riskDecision }, { body });
  const previous = { content_fingerprint: 'fp', risk_context: JSON.stringify({
    riskPolicyVersion: 'verifiable-issue-gates-v10-neutral-no-risk', rawAnalysis: prior.rawAnalysis }) };
  const next = normalizeAnalysisResult({ sentiment: 'negative', severity: 'negative', contentFingerprint: 'fp',
    riskDecision: { ...riskDecision, hit_rules: ['G3'], rule_evidence: {} } }, { body });
  assert.equal(next.severity, 'negative');
  assert.equal(retainVerifiedUrgent(next, previous, { body }).severity, 'urgent');
  assert.equal(retainVerifiedUrgent(next, { ...previous, content_fingerprint: 'changed' }, { body }).severity, 'negative');
});
test('a model cannot turn ordinary question objects into factual complaints', () => {
  for (const body of bodies) {
    const out = normalizeAnalysisResult({ sentiment: 'neutral', severity: 'attention', riskDecision: {
      level: 'L1', claim_type: 'fact', issue_object: body.slice(0, 3), claim_evidence: body,
      issue_summary: '玩法咨询', confidence: 0.9, evidence_types: [], hit_rules: ['G1'], rule_evidence: {}
    } }, { body });
    assert.equal(out.severity, 'normal', body);
  }
});
test('real complaints and failures in questions remain in the risk queue', () => {
  for (const [body, severity] of [['抽卡太坑了，真失望', 'attention'], ['进入副本每次都崩溃，怎么选才能正常玩？', 'negative'], ['充值未到账，请问怎么处理？', 'negative']]) {
    const out = normalizeAnalysisResult({ sentiment: 'negative', severity: 'attention' }, { body });
    assert.equal(out.severity, severity, body);
  }
});
