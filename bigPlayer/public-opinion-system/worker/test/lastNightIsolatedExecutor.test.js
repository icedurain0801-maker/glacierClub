'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { executeIsolatedFixture } = require('../src/lastNightIsolatedExecutor');

test('production and injected shared stores fail before any IO', async () => {
  let calls = 0;
  const store = { identity: { port: 43319 }, isolatedTest: true,
    async freezeSites() { calls += 1; } };
  for (const mode of [undefined, 'production', 'isolated-test']) {
    await assert.rejects(executeIsolatedFixture({ mode, store }),
      { code: 'PRODUCTION_EXECUTION_DISABLED' });
  }
  assert.equal(calls, 0);
});
