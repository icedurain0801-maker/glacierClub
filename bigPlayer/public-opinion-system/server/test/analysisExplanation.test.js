const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAnalysisResult } = require('../src/services/riskSeverityNormalizer');
const { Repository } = require('../src/db/repository');
const risk = { level: 'L1', level_name: '关注级', gate_result: 'GATE1_fail_L1',
  claim_type: 'emotion', confidence: 0.9, claim_evidence: '进不去了', issue_object: '',
  issue_summary: null, hit_rules: ['G1'], evidence_types: [], action_intent: [],
  reason: '玩家表示无法进入，但没有明确进入的功能和出现条件，需要核实对象。' };

test('policy validation preserves the actual AI explanation across memory cache and persistence', () => {
  const reason = '“进不去了”表达进入受阻的不满，但未说明是登录还是活动入口，也没有持续时间。';
  const first = normalizeAnalysisResult({ sentiment: 'negative', severity: 'attention', reason, riskDecision: risk }, { body: '进不去了' });
  assert.equal(first.reason, reason); assert.equal(first.analysisReason, reason);
  assert.notEqual(first.riskDecision.reason, reason);
  const cached = normalizeAnalysisResult(first, { body: '进不去了' });
  assert.equal(cached.analysisReason, reason); assert.equal(cached.severity, 'attention');
  const persisted = normalizeAnalysisResult({ severity: 'attention', analysis_reason: '固定模板',
    risk_context: JSON.stringify({ rawAnalysis: first.rawAnalysis }) }, { body: '进不去了' });
  assert.equal(persisted.analysisReason, reason); assert.equal(persisted.rawAnalysis.reason, reason);
});

test('blank model reason falls back to the original AI risk explanation, not policy text', () => {
  const result = normalizeAnalysisResult({ sentiment: 'negative', severity: 'attention', reason: '  ', riskDecision: risk }, { body: '进不去了' });
  assert.equal(result.analysisReason, risk.reason);
});

test('legacy explanations remain readable and DB length limits do not alter the archived AI text', () => {
  assert.equal(normalizeAnalysisResult({ sentiment: 'neutral', analysis_reason: '玩家仅询问活动入口。' }).analysisReason, '玩家仅询问活动入口。');
  const text = '玩家反馈'.repeat(100);
  const result = normalizeAnalysisResult({ sentiment: 'negative', reason: text, riskDecision: risk }, { body: '进不去了' });
  assert.equal(result.analysisReason.length, 255); assert.equal(result.rawAnalysis.reason, text);
});

test('list and detail SQL recover archived explanations without returning full raw analysis', async () => {
  const repo = Object.create(Repository.prototype); const calls = [];
  repo.query = async sql => { calls.push(sql); return []; };
  await repo.listContents({ page: 1, pageSize: 1 });
  await repo.listContentTree({ rootContentId: 'content-1' });
  const selects = calls.filter(sql => sql.includes(' AS analysis_reason'));
  assert.equal(selects.length, 2);
  for (const sql of selects) {
    assert.match(sql, /\$\.rawAnalysis\.reason/);
    assert.match(sql, /\$\.rawAnalysis\.originalRiskDecision\.reason/);
    assert.match(sql, /JSON_TYPE/); assert.match(sql, /NULLIF\(TRIM/);
  }
});
