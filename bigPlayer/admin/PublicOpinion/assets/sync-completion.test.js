const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const SyncProgress = require('./source-sync-progress');
const source = fs.readFileSync(require.resolve('./sources.js'), 'utf8');
const context = vm.createContext({ SyncProgress, pick: (obj, ...keys) => keys.map(key => obj?.[key]).find(value => value != null) });
vm.runInContext(source.slice(source.indexOf('function syncProgressState('), source.indexOf('function syncItemValue(')), context);

test('35 known posts do not imply all feeds and comments have completed', () => {
  const result = context.syncProgressState({ status: 'running', run: { fetched_count: 35, discovered_count: 35 } });
  assert.equal(result.indeterminate, true);
  assert.equal(result.label, '同步中');
  assert.match(result.detail, /评论/);
  assert.equal(result.percent, 0);
});
test('queued, paused and terminal runs have distinct truthful labels', () => {
  assert.equal(context.syncProgressState({ status: 'queued' }).label, '等待执行');
  assert.equal(context.syncProgressState({ status: 'paused' }).label, '已暂停');
  assert.equal(context.syncProgressState({ status: 'paused' }).indeterminate, false);
  assert.equal(context.syncProgressState({ status: 'completed_authorized_scope' }).label, '爬取完成');
  assert.equal(context.syncProgressState({ status: 'partial' }).label, '爬取结束（部分完成）');
  assert.equal(context.syncProgressState({ status: 'failed' }).label, '同步失败');
});
test('partial result explains provider ceiling without claiming complete coverage', () => {
  const result = SyncProgress.completionMessage({ error_message: JSON.stringify([{ code: 'COLLECTION_BOUNDARY_INCOMPLETE', message: 'bounded collection segment incomplete: provider_offset_ceiling' }]) });
  assert.match(result, /站点分页上限/);
  assert.match(result, /已保存/);
});
