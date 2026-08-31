const test = require('node:test');
const assert = require('node:assert/strict');
const { matchRules, higherSeverity } = require('../src/pipeline/ruleEngine');

const rules = [
  { keyword: '崩溃', group_name: '闪退组', severity: 'urgent', threshold_count: 1, trigger_mode: 'immediate', window_seconds: 600 },
  { keyword: '闪退', group_name: '闪退组', severity: 'attention', threshold_count: 3, trigger_mode: 'aggregate', window_seconds: 1800 },
  { keyword: '退款', group_name: '付费组', severity: 'attention', threshold_count: 5, trigger_mode: 'aggregate', window_seconds: 3600 }
];

test('未命中任何关键词则不送 AI', () => {
  const r = matchRules({ title: '今天天气不错', body: '和朋友一起玩得很开心' }, rules);
  assert.equal(r.needAI, false);
  assert.deepEqual(r.matchedKeywords, []);
  assert.equal(r.ruleSeverity, null);
});

test('命中关键词则 needAI 且产出组名', () => {
  const r = matchRules({ title: '游戏一直崩溃', body: '进不去' }, rules);
  assert.equal(r.needAI, true);
  assert.deepEqual(r.matchedKeywords, ['闪退组']);
});

test('同组多关键词命中：取最高严重度，immediate 优先', () => {
  const r = matchRules({ title: '崩溃又闪退', body: '' }, rules);
  const grp = r.hitGroups.find(g => g.groupName === '闪退组');
  assert.equal(grp.severity, 'urgent');       // 崩溃(urgent) > 闪退(attention)
  assert.equal(grp.triggerMode, 'immediate'); // immediate 优先
  assert.equal(grp.thresholdCount, 1);        // 取更低阈值（更敏感）
  assert.deepEqual(grp.keywords.sort(), ['崩溃', '闪退'].sort());
});

test('多组命中：ruleSeverity 取全局最高，triggerModes 去重', () => {
  const r = matchRules({ title: '崩溃且要退款', body: '' }, rules);
  assert.equal(r.matchedKeywords.length, 2);
  assert.equal(r.ruleSeverity, 'urgent');
  assert.ok(r.triggerModes.includes('immediate'));
  assert.ok(r.triggerModes.includes('aggregate'));
});

test('大小写/空白归一化匹配英文关键词', () => {
  const enRules = [{ keyword: 'Crash', group_name: 'bug', severity: 'urgent', threshold_count: 1, trigger_mode: 'immediate', window_seconds: 600 }];
  const r = matchRules({ title: 'the game   CRASH again', body: '' }, enRules);
  assert.equal(r.needAI, true);
  assert.deepEqual(r.matchedKeywords, ['bug']);
});

test('higherSeverity 排序正确', () => {
  assert.equal(higherSeverity('normal', 'attention'), 'attention');
  assert.equal(higherSeverity('urgent', 'attention'), 'urgent');
  assert.equal(higherSeverity('attention', 'attention'), 'attention');
});

test('作者名也纳入匹配范围', () => {
  const r = matchRules({ title: '', body: '正常内容', authorName: '崩溃的玩家' }, rules);
  assert.equal(r.needAI, true);
});
