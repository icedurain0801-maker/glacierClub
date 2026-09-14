const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSourceAllowlist, requireSourceAllowlist } = require('../src/worker');

test('source allowlist parses unique ids and fails closed when absent', () => {
  assert.deepEqual(parseSourceAllowlist(' bigplayer , discord,bigplayer '), ['bigplayer', 'discord']);
  assert.throws(() => requireSourceAllowlist({ UNIFIED_SOURCE_SCHEDULER_MODE: 'enabled' }), error => error.code === 'UNIFIED_SCHEDULER_SOURCE_ALLOWLIST_REQUIRED');
  assert.deepEqual(requireSourceAllowlist({ UNIFIED_SOURCE_SCHEDULER_MODE: 'enabled', UNIFIED_SOURCE_SCHEDULER_SOURCE_ALLOWLIST: 'bigplayer,discord' }), ['bigplayer', 'discord']);
});
