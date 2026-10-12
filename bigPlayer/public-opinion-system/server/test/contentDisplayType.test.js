const test = require('node:test');
const assert = require('node:assert/strict');
const { contentDisplayType } = require('../src/services/contentDisplayType');

test('BigPlayer uses upstream type 0 for posts and 1 for dynamics regardless of title', () => {
  const row = { platform: 'bigplayer_h5', content_type: 'post' };
  for (const title of ['有标题', '', ' \t\r\n　', null, undefined]) {
    for (const type of [0, '0', 1, '1']) {
      for (const raw_payload of [{ type }, JSON.stringify({ type })]) {
        assert.equal(contentDisplayType({ ...row, title, raw_payload }), Number(type) === 1 ? 'dynamic' : 'post');
      }
    }
  }
});

test('missing or malformed raw payload keeps post fallback and never uses nested unrelated type', () => {
  const row = { platform: 'bigplayer_h5', content_type: 'post', title: '' };
  for (const raw_payload of [null, undefined, '{invalid', { content: { type: 1 } }]) {
    assert.equal(contentDisplayType({ ...row, raw_payload }), 'post');
  }
});

test('comments and other platforms keep their existing display types', () => {
  const row = { platform: 'bigplayer_h5', content_type: 'post', title: '标题' };
  assert.equal(contentDisplayType({ ...row, content_type: 'comment', raw_payload: { type: 1 } }), 'comment');
  assert.equal(contentDisplayType({ ...row, content_type: 'review' }), 'comment');
  assert.equal(contentDisplayType({ ...row, platform: 'discord', raw_payload: { type: 1 } }), 'post');
  assert.equal(contentDisplayType({ ...row, platform: 'discord', title: '' }), 'post');
});
