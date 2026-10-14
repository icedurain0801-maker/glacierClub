const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.RISK_GRADIENT_ROOT || path.resolve(__dirname, '../../..');
const { normalizeAnalysisResult } = require(path.join(root, 'server/src/services/riskSeverityNormalizer'));
const { evaluateRiskDecision } = require(path.join(root, 'server/src/services/riskDecisionTree'));
const { productIssueEvidence, isPlannedMaintenance } = require(path.join(root, 'server/src/services/productIssueEvidence'));
const samples = [
  ['什么意思？', 'attention'],
  ['没有出货', 'attention'],
  ['刷不出红', 'attention'],
  ['又没有红抽了', 'attention'],
  ['是的，今天戛然而止，非常不适应', 'attention'],
  ['为什么显示加两次1500积分，我的积分没有变，卡bug了吗', 'negative'],
  ['看到这个抽奖我就气，存了30个，今天活动结束了，不应该周四晚上才结束嘛', 'negative'],
  ['真理大招居然是9段主动技能！一个大招可以直接让两个人50能量的人满能量！这种小bug也压根没人反馈了，对面后排总是1回合开大', 'negative']
];
for (const [body, severity] of samples) test(`legacy gradient: ${body.slice(0, 22)}`, () => {
  const result = normalizeAnalysisResult({ sentiment: 'negative', severity: 'urgent', confidence: 0.9, negative_score: 0.9 }, { body });
  assert.equal(result.severity, severity);
  assert.equal(normalizeAnalysisResult(result, { body }).severity, severity);
});
for (const [body] of samples.filter(row => row[1] === 'negative')) test(`repair incomplete AI claim: ${body.slice(0, 20)}`, () => {
  const risk = evaluateRiskDecision({ body, sentiment: 'negative', riskDecision: { level: 'L1', claim_type: 'emotion', confidence: 0.9 } });
  assert.equal(risk.level, 'L2');
  assert.ok(body.includes(risk.issue_object));
  assert.ok(body.includes(risk.claim_evidence));
  assert.deepEqual(risk.hit_rules, ['G3']);
});
test('guides, scarcity, resolved faults and hypothetical complaints are not concrete issues', () => {
  for (const body of ['技能大招9段，50能量，攻略推荐阵容', '活动奖励太少了', '如果活动提前结束怎么办', '积分显示增加但未到账，已经修复', '没有出货，垃圾游戏', '魔塔没箱子']) {
    assert.equal(productIssueEvidence({ body }), null, body);
  }
});
test('planned maintenance is excluded but actual late recovery remains actionable', () => {
  const body = '维护更新公告：预计10月14日05:00-07:00进行停服维护，维护期间您将无法登录游戏';
  assert.equal(isPlannedMaintenance({ body }), true);
  assert.equal(normalizeAnalysisResult({ sentiment: 'neutral', severity: 'normal' }, { body }).severity, 'normal');
  assert.equal(isPlannedMaintenance({ body: body + '，超过维护结束时间仍然无法登录' }), false);
});
test('real account theft remains urgent; negative score never creates urgency', () => {
  assert.equal(normalizeAnalysisResult({ sentiment: 'negative', severity: 'urgent' }, { body: '我的账号被盗，装备丢失' }).severity, 'urgent');
  assert.equal(normalizeAnalysisResult({ sentiment: 'negative', severity: 'urgent', negative_score: 1 }, { body: '奖励少得离谱' }).severity, 'attention');
});
