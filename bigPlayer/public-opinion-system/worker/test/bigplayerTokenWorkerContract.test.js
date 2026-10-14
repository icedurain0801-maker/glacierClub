'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runQ1Preflight } = require('../src/q1DailyJob');

test('Q1 preflight maps missing refresh password to explicit unauthorized token failure', async () => {
  const source = { id: 'source-id' };
  const account = { id: 'account-id' };
  await assert.rejects(
    () => runQ1Preflight({
      source,
      account,
      connector: {},
      preflight: async () => {
        const error = new Error('Q1 authorization probe failed');
        error.code = 'UNAUTHORIZED';
        throw error;
      },
      refreshAuth: async () => {
        const error = new Error('account password credential is not configured');
        error.code = 'AUTH_REFRESH_CREDENTIAL_NOT_CONFIGURED';
        throw error;
      }
    }),
    error => error.code === 'UNAUTHORIZED' && /reauthorization is required/.test(error.message)
  );
});
