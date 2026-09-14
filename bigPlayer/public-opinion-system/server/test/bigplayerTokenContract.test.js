'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BigPlayerH5Connector } = require('../src/connectors/bigPlayerH5Connector');

test('Q1 rejected token without password credential remains an explicit unauthorized failure', async () => {
  const source = { id: 'source-id', account: { id: 'account-id', platform: 'bigplayer_h5' }, config: { baseUrl: 'https://club.q1.com?env=web&gameId=game&gameVersion=1' } };
  let refreshCalls = 0;
  const connector = new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true' }, {
    credentialContext: { async loadApiToken() { return 'saved-token'; } },
    authRefreshCoordinator: {
      async refresh() {
        refreshCalls += 1;
        const error = new Error('account password credential is not configured');
        error.code = 'AUTH_REFRESH_CREDENTIAL_NOT_CONFIGURED';
        throw error;
      }
    },
    fetchImpl: async url => ({ ok: false, status: 401, url: String(url) })
  });

  await assert.rejects(
    () => connector.requestQ1('/api/club/v1/auth/user/context', source, 'saved-token'),
    error => error.code === 'CONNECTOR_PAGE_FAILED'
      && error.cause?.code === 'UNAUTHORIZED'
      && /reauthorization is required/.test(error.cause.message)
  );
  assert.equal(refreshCalls, 1);
});
