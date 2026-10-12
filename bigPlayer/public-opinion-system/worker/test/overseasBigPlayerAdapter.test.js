'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { createOverseasBigPlayerAdapter } = require('../src/overseasBigPlayerAdapter');
test('adapter fails cross-platform requests before transport and never activates missing schema', async () => {
  let calls = 0;
  const adapter = createOverseasBigPlayerAdapter({ repo: { query: async () => [] }, transport: async () => { calls++; } });
  assert.throws(() => adapter.connector.listComments({ source: { platform: 'discord' }, account: {} }));
  const schema = await adapter.inspectRuntimeSchema(); assert.equal(schema.ready, false); assert.equal(schema.missing.length, 5);
  assert.equal(schema.productionActivationAllowed, false); assert.equal(calls, 0); adapter.close();
});
test('optional page store requires explicit contract verifier and does not replace shared repository', () => {
  const repo = { pool: { getConnection: async () => { throw Error('no runtime connection'); } }, _upsertContentPageAttempt() {} };
  const adapter = createOverseasBigPlayerAdapter({ repo, transport: async () => {}, verifyRunContract: async () => false });
  assert.equal(adapter.repo, repo); assert.equal(typeof adapter.pageStore.upsertContentPage, 'function'); adapter.close();
});
