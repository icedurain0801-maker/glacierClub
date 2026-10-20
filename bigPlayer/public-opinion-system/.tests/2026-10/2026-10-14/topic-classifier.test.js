const test = require('node:test');
const assert = require('node:assert/strict');
const { inferTopics, topicsForRow } = require('../../../server/src/services/topicClassifier');
test('infers low-cost topics from content text when TypeSafe topics are empty', () => {
  assert.deepEqual(inferTopics('充值648扣款成功但是没到账'), ['充值付费']);
  assert.deepEqual(topicsForRow({ topics: [], title: '登录后一直闪退', body: '' }), ['稳定性']);
});
test('preserves existing AI topics before fallback', () => {
  assert.deepEqual(topicsForRow({ topics: ['自定义议题'], title: '充值未到账' }), ['自定义议题']);
});
