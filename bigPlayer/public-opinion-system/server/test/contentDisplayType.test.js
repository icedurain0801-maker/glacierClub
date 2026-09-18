const test = require('node:test');
const assert = require('node:assert/strict');
const { contentDisplayType } = require('../src/services/contentDisplayType');

test('BigPlayer display type only uses raw top-level type, never title or nested type', () => {
  const row = { platform: 'bigplayer_h5', content_type: 'post' };
  assert.equal(contentDisplayType({ ...row, title: '', raw_payload: { type: 0 } }), 'post');
  assert.equal(contentDisplayType({ ...row, title: '有标题', raw_payload: { type: 1 } }), 'dynamic');
  assert.equal(contentDisplayType({ ...row, raw_payload: '{"type":"1"}' }), 'dynamic');
  assert.equal(contentDisplayType({ ...row, raw_payload: { content: { type: 1 } } }), 'post');
  assert.equal(contentDisplayType({ ...row, content_type: 'comment', raw_payload: { type: 1 } }), 'comment');
  assert.equal(contentDisplayType({ ...row, platform: 'discord', raw_payload: { type: 1 } }), 'post');
});
