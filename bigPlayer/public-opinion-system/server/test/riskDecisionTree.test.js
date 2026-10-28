const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { evaluateRiskDecision } = require('../src/services/riskDecisionTree');
const { normalizeAnalysisResult, retainVerifiedUrgent, RISK_POLICY_VERSION } = require('../src/services/riskSeverityNormalizer');
const { AiAnalyzer } = require('../src/integrations/aiAnalyzer');

function fixture(body, extra = {}) {
  return { body, sentiment: 'negative', severity: 'urgent', negativeScore: 0.99, confidence: 0.9,
    riskDecision: { level: 'L2', level_name: '紧急告警', gate_result: 'GATE3_default_L2', claim_type: 'fact',
      issue_object: body.slice(0, 4), claim_evidence: body, issue_summary: '具体游戏问题', confidence: 0.9,
      evidence_types: [], action_intent: [], hit_rules: ['G3'], rule_evidence: {}, reason: `“${body}”`, ...extra } };
}
const decide = (body, extra, context = {}) => evaluateRiskDecision({ ...fixture(body, extra), ...context });

test('99% negative emotion and refund intentions cannot bypass GATE1', () => {
  const d = decide('超能世界太坑了，气死我了，想退款', { claim_type: 'emotion', action_intent: ['refund'], hit_rules: ['R4'] });
  assert.equal(d.level, 'L1'); assert.equal(d.gate_result, 'GATE1_fail_L1');
});
test('luck whitelist runs after exceptions, which still require a verifiable claim', () => {
  assert.equal(decide('超能世界十连全蓝，脸黑，气死了').level, 'L1');
  const d = decide('超能世界十连全蓝，怀疑暗改爆率', { claim_type: 'allegation' });
  assert.equal(d.level, 'L2'); assert.equal(d.whitelist_override, true);
  assert.equal(decide('超能世界爆率公示在哪里？').level, 'L1');
});
test('plain consultation about money does not become urgent', () => {
  assert.equal(decide('超能世界退款流程是什么？', { claim_type: 'emotion', action_intent: ['refund'] }).level, 'L1');
});
test('single incidental crash is attention, reproducible boss crash is negative', () => {
  assert.equal(decide('超能世界刚才闪退一次了').level, 'L1');
  assert.equal(decide('超能世界发起联盟boss集结每十次闪退一次，重连导致队伍不同步，是否手机问题？').level, 'L2');
  assert.equal(decide('When I start alliance boss rallies my game crashes 1 out of 10 times. Is it my phone?').level, 'L2');
});
test('fabricated issue object and evidence fail GATE1', () => {
  for (const extra of [{ issue_object: '不存在的抽卡' }, { claim_evidence: '虚构的投诉' }]) {
    assert.equal(decide('超能世界活动奖励未到账', extra).level, 'L1');
  }
});
test('observable source facts repair a missing issue summary or model emotion label', () => {
  for (const extra of [{ issue_summary: '' }, { claim_type: 'emotion', issue_object: '', issue_summary: null }]) {
    const r = decide('超能世界活动奖励未到账', extra);
    assert.equal(r.level, 'L2'); assert.ok(r.issue_summary); assert.equal(r.source_fact_repaired, true);
  }
  assert.equal(decide('超能世界进入集结时每十次闪退一次', { claim_type: 'emotion' }).level, 'L2');
});
test('hypothetical or resolved clauses cannot prove a live problem', () => {
  for (const body of ['如果超能世界账号被盗怎么办', '超能世界闪退已解决']) assert.equal(decide(body).level, 'L1');
});
test('R1 compliance allegation requires its original quote', () => {
  const body = '超能世界抽卡被指涉嫌赌博';
  assert.equal(decide(body, { claim_type: 'allegation', hit_rules: ['R1'], rule_evidence: { R1: body } }).level, 'L3');
  assert.equal(decide(body, { hit_rules: ['R1'], rule_evidence: { R1: '虚构涉赌原文' } }).level, 'L2');
});
test('minor controversy requires both payment and complaint evidence', () => {
  for (const [body, expected] of [['超能世界未成年小孩充值1000元，已投诉12315', 'L3'], ['超能世界未成年小孩充值1000元', 'L2']]) {
    assert.equal(decide(body, { hit_rules: ['R2'], rule_evidence: { R2: body } }).level, expected);
  }
});
test('a real external complaint is urgent, a complaint-process question is not', () => {
  const body = '超能世界充值扣款不到账，已在黑猫投诉';
  assert.equal(decide(body, { hit_rules: ['R4'], rule_evidence: { R4: body }, action_intent: ['complaint'] }).level, 'L3');
  assert.equal(decide('超能世界黑猫投诉入口在哪？', { hit_rules: ['R4'], rule_evidence: { R4: '黑猫' } }).level, 'L1');
});
test('R5 financial bug needs an observable reproduction path', () => {
  const body = '超能世界进入活动点击领取可无限领取奖励';
  assert.equal(decide(body, { hit_rules: ['R5'], rule_evidence: { R5: body }, evidence_types: ['repro_steps'] }).level, 'L3');
  assert.equal(decide('超能世界疑似无限领取奖励', { hit_rules: ['R5'], rule_evidence: { R5: '无限领取奖励' }, evidence_types: ['repro_steps'] }).level, 'L2');
});
test('R6 account theft and R7 sustained outage are urgent', () => {
  for (const [body, rule] of [['超能世界我的账号被盗，装备丢失', 'R6'], ['超能世界全服持续3小时无法登录游戏', 'R7']]) {
    assert.equal(decide(body, { hit_rules: [rule], rule_evidence: { [rule]: body } }).level, 'L3');
  }
});
test('organized action needs a concrete action quote', () => {
  const body = '超能世界奖励未到账，公会组织明天集体退款';
  assert.equal(decide(body, { hit_rules: ['R8'], rule_evidence: { R8: body }, action_intent: ['organize'] }).level, 'L3');
  assert.equal(decide('超能世界奖励未到账', { hit_rules: ['R8'], rule_evidence: { R8: '奖励未到账' }, action_intent: ['organize'] }).level, 'L2');
});
test('R9/R10/R11 do not invent missing cross-platform and cluster metadata', () => {
  const body = '超能世界活动奖励未到账';
  for (const rule of ['R9', 'R10', 'R11']) assert.equal(decide(body, { hit_rules: [rule], rule_evidence: { [rule]: body } }).level, 'L2');
  assert.equal(decide(body, { hit_rules: ['R10'], rule_evidence: { R10: body } }, { riskMetadata: { clusterCount: 50 } }).level, 'L3');
  assert.equal(decide(body, { hit_rules: ['R9'], rule_evidence: { R9: body } }, { riskMetadata: { crossPlatform: true, baseline: 10, engagement: 30 } }).level, 'L3');
});
test('R12/R3 require readable samples, not an uninspected screenshot reference', () => {
  const body = '超能世界暗改爆率，统计样本1000抽出5个，公示和实际不一致';
  for (const rule of ['R12', 'R3']) {
    assert.equal(decide(body, { claim_type: 'evidence_backed_allegation', hit_rules: [rule], rule_evidence: { [rule]: body }, evidence_types: ['data_sample'] }).level, 'L3');
    assert.equal(decide('超能世界暗改概率未按公示执行，见截图', { hit_rules: [rule], rule_evidence: { [rule]: '暗改概率未按公示执行' }, evidence_types: ['screenshot'] }).level, 'L2');
  }
});
test('R13 accepts supplied readable ticket proof only', () => {
  const body = '超能世界奖励未到账，已经提交投诉，受理凭证如下';
  const extra = { hit_rules: ['R13'], rule_evidence: { R13: body }, evidence_types: ['ticket_proof'], action_intent: ['complaint'] };
  assert.equal(decide(body, extra).level, 'L2');
  assert.equal(decide(body, extra, { evidenceTypes: ['ticket_proof'] }).level, 'L3');
});
test('U3/U4/U5 require verified metadata and cannot upgrade pure emotion', () => {
  for (const rule of ['U3', 'U4', 'U5']) {
    const body = '超能世界活动奖励未到账';
    const extra = { hit_rules: [rule], rule_evidence: { [rule]: body } };
    assert.equal(decide(body, extra).level, 'L2');
    assert.equal(decide(body, extra, { riskMetadata: { [rule]: true } }).level, 'L3');
    assert.equal(decide('超能世界太坑了', { ...extra, claim_type: 'emotion' }, { riskMetadata: { [rule]: true } }).level, 'L1');
  }
});
test('confidence below 0.6 downgrades L2 once, not a verified L3', () => {
  const body = '超能世界活动奖励未到账';
  const n = normalizeAnalysisResult(fixture(body, { confidence: 0.59 }));
  assert.equal(n.severity, 'attention'); assert.equal(normalizeAnalysisResult(n).severity, 'attention');
  const urgent = decide('超能世界账号被盗', { confidence: 0.59, hit_rules: ['R6'], rule_evidence: { R6: '账号被盗' } });
  assert.equal(urgent.level, 'L3'); assert.ok(urgent.downgrade_suggest); assert.match(urgent.reason, /低置信/);
  assert.equal(decide(body, { confidence: 0.6 }).level, 'L2');
});
test('D1 verified misreading creates clarification; model guesses cannot silently downgrade', () => {
  const body = '超能世界奖励未到账';
  assert.equal(decide(body, { hit_rules: ['D1'] }).level, 'L2');
  const d = decide(body, {}, { riskMetadata: { misreadingVerified: true } });
  assert.equal(d.level, 'L1'); assert.equal(d.need_clarification, true);
});
test('L0 normal is retained with the original quote; duplicate guesses are not filtered', () => {
  assert.equal(decide('谢谢攻略', { level: 'L0', claim_type: 'emotion', noise_reason: 'pure_meme' }).level, 'L0');
  assert.equal(decide('这是搬运内容', { level: 'L0', claim_type: 'emotion', noise_reason: 'repost_dup' }).level, 'L1');
});
test('L0 reasons are rebuilt from real text even when the model omits its quote', () => {
  const input = fixture('收到，谢谢', { level: 'L0', claim_type: 'emotion', noise_reason: 'no_subject', claim_evidence: '', reason: '正常回复', issue_summary: null, issue_object: '' });
  input.severity = 'normal';
  const r = normalizeAnalysisResult(input);
  assert.equal(r.severity, 'normal'); assert.match(r.riskDecision.reason, /收到，谢谢/);
  assert.equal(r.analysisReason, '正常回复');
  assert.equal(normalizeAnalysisResult(r).severity, 'normal');
});
test('positive sharing without a problem does not enter the attention queue', () => {
  assert.equal(normalizeAnalysisResult({ ...fixture('这个攻略太有用了', { claim_type: 'emotion', level: 'L1' }), sentiment: 'positive' }).severity, 'normal');
});
test('observable bug and red-dot faults cannot be filtered as generic noise', () => {
  for (const body of ['今天早上云顶出bug了，导致9点多才正常打上', '试炼之地红点消不掉，无法正常使用']) {
    assert.equal(decide(body, { level: 'L0', claim_type: 'emotion', noise_reason: 'no_subject', issue_summary: null, issue_object: '' }).level, 'L2');
  }
});
test('persistence retains verifiable evidence and explicit current body wins over old source', () => {
  const body = '超能世界账号被盗';
  const n = normalizeAnalysisResult(fixture(body, { hit_rules: ['R6'], rule_evidence: { R6: body } }));
  const stored = { severity: n.severity, risk_context: JSON.stringify({ rawAnalysis: n.rawAnalysis }) };
  assert.equal(normalizeAnalysisResult(stored).severity, 'urgent');
  assert.equal(normalizeAnalysisResult(stored, { body: '只是问退款入口' }).severity, 'attention');
});
test('later same-content analysis cannot silently downgrade a verified v8 urgent result', () => {
  const body = '超能世界账号被盗';
  const prior = normalizeAnalysisResult(fixture(body, { hit_rules: ['R6'], rule_evidence: { R6: body } }));
  const previous = { content_fingerprint: 'fp', risk_context: JSON.stringify({ riskPolicyVersion: RISK_POLICY_VERSION, rawAnalysis: prior.rawAnalysis }) };
  const next = normalizeAnalysisResult({ ...fixture(body, { hit_rules: ['G3'] }), contentFingerprint: 'fp' });
  const retained = retainVerifiedUrgent(next, previous, { body });
  assert.equal(retained.severity, 'urgent'); assert.ok(retained.riskDecision.downgrade_suggest);
  assert.equal(retainVerifiedUrgent(next, { ...previous, content_fingerprint: 'old' }, { body }).severity, 'negative');
  assert.equal(retainVerifiedUrgent(next, { ...previous, risk_context: JSON.stringify({ riskPolicyVersion: 'game-impact-evidence-v7', rawAnalysis: prior.rawAnalysis }) }, { body }).severity, 'negative');
});
test('real local HTTP AI response applies serial gates, parses quality and rejects missing risk', async t => {
  let missing = false;
  const server = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    assert.match(JSON.parse(text).messages[0].content, /核心原则|串行决策树/);
    const format = JSON.parse(text).response_format;
    assert.equal(format.json_schema.strict, true);
    assert.equal(format.json_schema.schema.properties.results.minItems, 1);
    const risk = fixture('超能世界十连全蓝', { claim_type: 'emotion', level: 'L1', level_name: '关注级', gate_result: 'GATE1_fail_L1' }).riskDecision;
    const row = { i: 0, s: 'negative', v: 'attention', n: 0.99, c: 0.9, q: 0.3, h: false, p: false, f: false, qr: '纯运气抱怨', ...(missing ? {} : { risk }) };
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ results: [row] }) } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const ai = new AiAnalyzer({ AI_ANALYSIS_ENABLED: 'true', AI_ANALYSIS_URL: `http://127.0.0.1:${server.address().port}`, AI_ANALYSIS_TOKEN: 'isolated-test', AI_ANALYSIS_MODEL: 'mock' });
  const [out] = await ai.analyzeBatch([{ body: '超能世界十连全蓝' }]);
  assert.equal(out.severity, 'attention'); assert.equal(out.qualityScore, 0.3);
  missing = true;
  await assert.rejects(ai.analyzeBatch([{ body: '超能世界纯吐槽' }]), /INVALID_RISK_DECISION/);
});
