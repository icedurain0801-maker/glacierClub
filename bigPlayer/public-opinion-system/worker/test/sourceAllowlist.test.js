const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSourceAllowlist } = require('../src/worker');

test('source allowlist parses unique ids and fails closed when absent', () => {
  assert.deepEqual(parseSourceAllowlist(' bigplayer , discord,bigplayer '), ['bigplayer', 'discord']);
});
