const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSeverity, buildAnalysisReason } = require('../src/services/riskSeverityNormalizer');

test('negative content always stays at least attention', () => {
  const result = normalizeSeverity({ sentiment: 'negative', severity: 'normal', title: '一般吐槽', body: '体验一般' });
  assert.equal(result.severity, 'attention');
  assert.deepEqual(result.reasons, ['negative_floor_attention']);
});

test('game issue samples 919167 and 919098 upgrade to urgent', () => {
  for (const body of ['今天早上云顶出 bug 了，导致 9 点多才正常打上', '试炼之地有个红点消不掉，无法正常使用']) {
    const result = normalizeSeverity({ sentiment: 'negative', severity: 'attention', title: '', body });
    assert.equal(result.severity, 'urgent');
    assert.equal(result.gameIssueMatched, true);
    assert.ok(result.reasons.includes('game_issue_upgrade'));
  }
});

test('negative score upgrade uses inclusive 0.60/0.60 boundaries', () => {
  assert.equal(normalizeSeverity({ sentiment: 'negative', severity: 'attention', negativeScore: 0.6, confidence: 0.6 }).severity, 'urgent');
  assert.equal(normalizeSeverity({ sentiment: 'negative', severity: 'attention', negativeScore: 0.599, confidence: 0.6 }).severity, 'attention');
  assert.equal(normalizeSeverity({ sentiment: 'negative', severity: 'attention', negativeScore: 0.6, confidence: 0.599 }).severity, 'attention');
});

test('positive content is forced normal even when it contains game issue words', () => {
  const result = normalizeSeverity({ sentiment: 'positive', severity: 'urgent', title: '闪退解决方法', body: '分享更新后闪退的解决方法' });
  assert.equal(result.severity, 'normal');
  assert.equal(result.gameIssueMatched, false);
  assert.deepEqual(result.reasons, ['positive_forced_normal']);
});

test('neutral content keeps its model severity and does not inherit parent risk', () => {
  const result = normalizeSeverity({ sentiment: 'neutral', severity: 'attention', title: '回复', body: '收到，谢谢', parentSeverity: 'urgent' });
  assert.equal(result.severity, 'attention');
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
