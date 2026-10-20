const test = require('node:test');
const assert = require('node:assert/strict');
const { AiAnalysisDebug } = require('../src/services/aiAnalysisDebug');
const { defaultPolicy } = require('../src/services/aiAnalysisPolicy');
function setup(analyze) { return new AiAnalysisDebug({ ai: { singlePass: true, configured: () => true, analyzeBatch: analyze } }); }
const input = (extra = {}) => ({ owner: 'u1', communityId: 'c1', policy: defaultPolicy(), items: [{ contentType: 'comment', title: '不能继承的标题', body: '普通评论' }], ...extra });
test('debug executes all 25 items with draft policy and produces per-item results', async () => {
  const calls = [], debug = setup(async items => { calls.push(items); return items.map(() => ({ sentiment: 'negative', typeSafeDecision: { final_level: 'L1' }, reason: '一般不满', topics: [] })); });
  const policy = defaultPolicy(); policy.levels.L1.rule = '用户未保存的新规则';
  const job = debug.start(input({ policy, items: Array.from({ length: 25 }, (_, index) => ({ contentType: index % 2 ? 'comment' : 'post', body: `样例${index}`, title: '标题' })) }));
  assert.equal(job.status, 'running'); await debug.jobs.get(job.id).promise;
  const result = debug.get(job.id, 'u1', 'c1');
  assert.equal(result.completed, 25); assert.equal(result.status, 'completed'); assert.equal(calls.length, 5);
  assert(calls.every(items => items.length === 5));
  assert.equal(calls[0][0].analysisPolicy.levels.L1.rule, '用户未保存的新规则');
  assert.equal(calls[0][1].title, ''); assert.equal(result.results[24].index, 25);
  assert.throws(() => debug.get(job.id, 'other', 'c1'), { code: 'NOT_FOUND' });
  assert.throws(() => debug.get(job.id, 'u1', 'other'), { code: 'NOT_FOUND' });
});
test('debug errors remain errors and cannot become normal content', async () => {
  const debug = setup(async () => [{ analysisError: { code: 'TYPESAFE_HTTP_500' } }]);
  const job = debug.start(input()); await debug.jobs.get(job.id).promise;
  const row = debug.get(job.id, 'u1', 'c1').results[0];
  assert.equal(row.error, 'TYPESAFE_HTTP_500'); assert.equal(row.level, undefined);
});
test('debug rejects invalid text count and protects concurrent model budget', async () => {
  let release;
  const debug = setup(() => new Promise(resolve => { release = resolve; }));
  assert.throws(() => debug.start(input({ items: [] })), { code: 'INVALID_INPUT' });
  assert.throws(() => debug.start(input({ items: Array(26).fill({ body: '文本', contentType: 'post' }) })), { code: 'INVALID_INPUT' });
  const job = debug.start(input());
  assert.throws(() => debug.start(input()), { code: 'DEBUG_BUSY' });
  release([{ typeSafeDecision: { final_level: 'L0' }, sentiment: 'neutral' }]); await debug.jobs.get(job.id).promise;
});
