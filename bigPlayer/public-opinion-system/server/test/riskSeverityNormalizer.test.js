const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSeverity, normalizeAnalysisResult, buildAnalysisReason } = require('../src/services/riskSeverityNormalizer');

test('semantic complaints bypass both thresholds while an explicit consultation does not', () => {
  assert.equal(normalizeSeverity({ sentiment: 'negative', severity: 'attention', negativeScore: 0.2, confidence: 0.1, gameComplaint: true }).severity, 'negative');
  assert.equal(normalizeSeverity({ sentiment: 'negative', severity: 'attention', negativeScore: 0.2, gameComplaint: false, body: '请问bug修复公告在哪看' }).severity, 'attention');
  assert.equal(normalizeSeverity({ sentiment: 'neutral', severity: 'normal', gameComplaint: false, gameExperienceRelated: true, body: '匹配机制怎么用' }).severity, 'attention');
  assert.equal(normalizeSeverity({ sentiment: 'negative', severity: 'urgent', negativeScore: 0.1, gameComplaint: false }).severity, 'attention');
});

test('legacy missing semantic flag does not upgrade a bare bug consultation', () => {
  for (const body of ['请问bug修复公告在哪看？', '请问有bug反馈入口吗？', '请问漏洞反馈入口在哪里？', 'Where is the bug FAQ?', '匹配机制应该怎么玩？']) {
    assert.equal(normalizeAnalysisResult({ sentiment: 'negative', severity: 'attention', negativeScore: 0.1, confidence: 1 }, { body }).severity, 'attention');
  }
  for (const body of ['今天云顶出 bug 了，导致活动无法参加', 'The game keeps crashing', '登录失败导致无法参与活动']) {
    assert.equal(normalizeAnalysisResult({ sentiment: 'negative', severity: 'attention', negativeScore: 0.1, confidence: 0.1 }, { body }).severity, 'negative');
  }
});

test('repeated normalization retains the raw result, quality fields and clean explanation', () => {
  const input = { sentiment: 'positive', severity: 'urgent', negativeScore: 0.99, confidence: 0, reason: '攻略已验证', qualityScore: 0.95, recommendHome: true, recommendPin: true, recommendFeature: true };
  const first = normalizeAnalysisResult(input);
  const second = normalizeAnalysisResult(first);
  assert.equal(second.severity, 'normal');
  assert.equal(second.originalSeverity, 'urgent');
  assert.equal(second.rawAnalysis.severity, 'urgent');
  assert.equal(second.analysisReason, input.reason);
  assert.equal(second.recommendHome && second.recommendPin && second.recommendFeature, true);
  assert.deepEqual(second.severityNormalizationReasons, ['positive_forced_normal']);
  assert.equal(input.severity, 'urgent');
});

test('negative content always stays at least attention', () => {
  const result = normalizeSeverity({ sentiment: 'negative', severity: 'normal', title: '一般吐槽', body: '体验一般' });
  assert.equal(result.severity, 'attention');
  assert.deepEqual(result.reasons, ['negative_floor_attention']);
});

test('game issue samples 919167 and 919098 enter negative pending', () => {
  for (const body of ['今天早上云顶出 bug 了，导致 9 点多才正常打上', '试炼之地有个红点消不掉，无法正常使用']) {
    const result = normalizeSeverity({ sentiment: 'negative', severity: 'attention', title: '', body });
    assert.equal(result.severity, 'negative');
    assert.equal(result.gameIssueMatched, true);
    assert.ok(result.reasons.includes('game_issue_upgrade'));
  }
});

test('negative score alone never bypasses the verifiable-issue gate', () => {
  for (const confidence of [0, 0.2, 0.599, 0.6, 1]) {
    assert.equal(normalizeSeverity({ sentiment: 'negative', severity: 'attention', negativeScore: 0.499, confidence }).severity, 'attention');
    assert.equal(normalizeSeverity({ sentiment: 'negative', severity: 'attention', negativeScore: 0.5, confidence }).severity, 'attention');
    for (const negativeScore of [0.501, 0.86]) assert.equal(normalizeSeverity({ sentiment: 'negative', severity: 'attention', negativeScore, confidence }).severity, 'attention');
  }
});

test('positive content is forced normal even when it contains game issue words', () => {
  const result = normalizeSeverity({ sentiment: 'positive', severity: 'urgent', title: '闪退解决方法', body: '分享更新后闪退的解决方法' });
  assert.equal(result.severity, 'normal');
  assert.equal(result.gameIssueMatched, false);
  assert.deepEqual(result.reasons, ['positive_forced_normal']);
});

test('unrelated neutral content does not keep a conflicting model risk and does not inherit parent risk', () => {
  const result = normalizeSeverity({ sentiment: 'neutral', severity: 'attention', title: '回复', body: '收到，谢谢', parentSeverity: 'urgent' });
  assert.equal(result.severity, 'normal');
  assert.deepEqual(result.reasons, []);
});

test('invalid severity is audited for every sentiment while sentiment rules remain deterministic', () => {
  const positive = normalizeSeverity({ sentiment: 'positive', severity: 'unexpected' });
  const neutral = normalizeSeverity({ sentiment: 'neutral', severity: 'unexpected' });
  const negative = normalizeSeverity({ sentiment: 'negative', severity: 'unexpected' });
  assert.deepEqual(
    { severity: positive.severity, reasons: positive.reasons },
    { severity: 'normal', reasons: ['invalid_severity_defaulted', 'positive_forced_normal'] }
  );
  assert.deepEqual(
    { severity: neutral.severity, reasons: neutral.reasons },
    { severity: 'normal', reasons: ['invalid_severity_defaulted'] }
  );
  assert.deepEqual(
    { severity: negative.severity, reasons: negative.reasons },
    { severity: 'attention', reasons: ['invalid_severity_defaulted', 'negative_floor_attention'] }
  );
});

test('analysis reason truncates the base before a complete audit suffix', () => {
  const normalized = normalizeSeverity({ sentiment: 'positive', severity: 'urgent' });
  const audit = 'severity=urgent->normal;reasons=positive_forced_normal';
  const result = buildAnalysisReason('x'.repeat(400), normalized);
  assert.equal(result.length, 255);
  assert.ok(result.endsWith(audit));
  assert.equal((result.match(/severity=/g) || []).length, 1);
});

test('progressive severity requires a qualifying issue before the AI serious decision', () => {
  for (const sentiment of ['neutral', 'negative']) {
    const base = { sentiment, severity: 'urgent', negativeScore: 0.2, gameComplaint: true, gameExperienceRelated: true, body: '我的账号被盗，全部道具丢失' };
    assert.equal(normalizeSeverity(base).severity, 'urgent');
    assert.equal(normalizeSeverity({ ...base, severity: 'attention' }).severity, 'negative');
  }
  assert.equal(normalizeSeverity({ sentiment: 'neutral', severity: 'urgent', gameExperienceRelated: false }).severity, 'normal');
  const input = { sentiment: 'neutral', severity: 'normal', negativeScore: 0.1, gameComplaint: true, gameExperienceRelated: true };
  const first = normalizeAnalysisResult(input);
  const persisted = { sentiment: 'neutral', severity: first.severity, negative_score: 0.1, risk_context: JSON.stringify({ gameComplaint: true, gameExperienceRelated: true, rawAnalysis: first.rawAnalysis, originalSeverity: first.originalSeverity }) };
  assert.equal(normalizeAnalysisResult(persisted).severity, 'negative');
  assert.equal(normalizeAnalysisResult(first).severity, 'negative');
});
