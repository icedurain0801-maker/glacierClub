const test = require('node:test');
const assert = require('node:assert/strict');
const { AlertEngine, buildExcerpt } = require('../src/pipeline/alertEngine');

// 假 repo：记录调用，可编排 countWindowHits / findOpenAlert 返回值。
function fakeRepo(overrides = {}) {
  const calls = { insertAlert: [], linkAlertContent: [], updateDingStatus: [], countWindowHits: [], findOpenAlert: [] };
  return {
    calls,
    async countWindowHits(a) { calls.countWindowHits.push(a); return overrides.windowHits ?? 0; },
    async findOpenAlert(a) { calls.findOpenAlert.push(a); return overrides.openAlert ?? null; },
    async insertAlert(a) { calls.insertAlert.push(a); return { id: 'alert-1', ...a }; },
    async linkAlertContent(id, cid) { calls.linkAlertContent.push([id, cid]); },
    async updateDingStatus(id, s) { calls.updateDingStatus.push([id, s]); }
  };
}
function fakeDing(sent = true) {
  const calls = [];
  return { enabled: true, webhook: 'https://d', calls, async notify(a) { calls.push(a); if (!sent) throw new Error('DINGTALK_HTTP_500'); } };
}
const game = { id: 'g1', name: '冰川游戏' };
const content = { id: 'c1', title: '游戏崩溃了', body: '进不去', source_url: 'https://x/1' };

test('immediate 口径达 urgent 单条直报并推钉钉', async () => {
  const repo = fakeRepo(); const ding = fakeDing();
  const engine = new AlertEngine(repo, ding, {});
  const hit = { hitGroups: [{ groupName: '闪退组', severity: 'urgent', triggerMode: 'immediate', windowSeconds: 600, thresholdCount: 1, keywords: ['崩溃'] }] };
  const out = await engine.process({ game, content, hit, analysis: { sentiment: 'negative', severity: 'urgent' } });
  assert.equal(out.length, 1);
  assert.equal(out[0].reused, false);
  assert.equal(repo.calls.insertAlert.length, 1);
  assert.equal(repo.calls.insertAlert[0].alertType, 'immediate');
  assert.equal(ding.calls.length, 1);
  assert.deepEqual(repo.calls.updateDingStatus[0], ['alert-1', 'sent']);
});

test('immediate 但未达 urgent 不报', async () => {
  const repo = fakeRepo(); const engine = new AlertEngine(repo, fakeDing(), {});
  const hit = { hitGroups: [{ groupName: '闪退组', severity: 'attention', triggerMode: 'immediate', windowSeconds: 600, thresholdCount: 1, keywords: ['卡顿'] }] };
  const out = await engine.process({ game, content, hit, analysis: { sentiment: 'negative', severity: 'attention' } });
  assert.equal(out.length, 0);
  assert.equal(repo.calls.insertAlert.length, 0);
});

test('AI 严重度可将规则 attention 升级为 urgent 触发 immediate', async () => {
  const repo = fakeRepo(); const engine = new AlertEngine(repo, fakeDing(), {});
  const hit = { hitGroups: [{ groupName: 'x', severity: 'attention', triggerMode: 'immediate', windowSeconds: 600, thresholdCount: 1, keywords: ['a'] }] };
  const out = await engine.process({ game, content, hit, analysis: { sentiment: 'negative', severity: 'urgent' } });
  assert.equal(out.length, 1);
  assert.equal(repo.calls.insertAlert[0].severity, 'urgent');
});

test('aggregate 达阈值才报', async () => {
  const belowRepo = fakeRepo({ windowHits: 2 });
  const engine1 = new AlertEngine(belowRepo, fakeDing(), {});
  const hit = { hitGroups: [{ groupName: '差评组', severity: 'attention', triggerMode: 'aggregate', windowSeconds: 1800, thresholdCount: 3, keywords: ['差评'] }] };
  assert.equal((await engine1.process({ game, content, hit, analysis: { severity: 'attention' } })).length, 0);

  const okRepo = fakeRepo({ windowHits: 3 });
  const engine2 = new AlertEngine(okRepo, fakeDing(), {});
  const out = await engine2.process({ game, content, hit, analysis: { severity: 'attention' } });
  assert.equal(out.length, 1);
  assert.equal(okRepo.calls.insertAlert[0].alertType, 'aggregate');
});

test('冷却期内复用已存在告警，只追加内容不新建', async () => {
  const repo = fakeRepo({ openAlert: { id: 'old-1', ding_talk_status: 'sent' } });
  const ding = fakeDing();
  const engine = new AlertEngine(repo, ding, {});
  const hit = { hitGroups: [{ groupName: '闪退组', severity: 'urgent', triggerMode: 'immediate', windowSeconds: 600, thresholdCount: 1, keywords: ['崩溃'] }] };
  const out = await engine.process({ game, content, hit, analysis: { severity: 'urgent' } });
  assert.equal(out[0].reused, true);
  assert.equal(repo.calls.insertAlert.length, 0);
  assert.deepEqual(repo.calls.linkAlertContent[0], ['old-1', 'c1']);
  assert.equal(ding.calls.length, 0); // 不重复推
});

test('钉钉推送失败回写 failed 但仍落库', async () => {
  const repo = fakeRepo(); const ding = fakeDing(false);
  const engine = new AlertEngine(repo, ding, {});
  const hit = { hitGroups: [{ groupName: 'x', severity: 'urgent', triggerMode: 'immediate', windowSeconds: 600, thresholdCount: 1, keywords: ['a'] }] };
  const out = await engine.process({ game, content, hit, analysis: { severity: 'urgent' } });
  assert.equal(out[0].dingStatus, 'failed');
  assert.equal(repo.calls.insertAlert.length, 1);
  assert.deepEqual(repo.calls.updateDingStatus[0], ['alert-1', 'failed']);
});

test('钉钉未配置回写 not_sent', async () => {
  const repo = fakeRepo();
  const engine = new AlertEngine(repo, { enabled: false, webhook: '' }, {});
  const hit = { hitGroups: [{ groupName: 'x', severity: 'urgent', triggerMode: 'immediate', windowSeconds: 600, thresholdCount: 1, keywords: ['a'] }] };
  await engine.process({ game, content, hit, analysis: { severity: 'urgent' } });
  assert.deepEqual(repo.calls.updateDingStatus[0], ['alert-1', 'not_sent']);
});

test('buildExcerpt 截断', () => {
  assert.equal(buildExcerpt({ title: 'abc' }), 'abc');
  assert.equal(buildExcerpt({ body: 'x'.repeat(100) }, 10), `${'x'.repeat(10)}…`);
});
