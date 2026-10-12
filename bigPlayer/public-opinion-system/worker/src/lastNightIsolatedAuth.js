'use strict';

const { CredentialContext } = require('../../server/src/services/credentialContext');
const { BigPlayerH5Connector } = require('../../server/src/connectors/bigPlayerH5Connector');
const { SOURCE_ID, BOARD_ID } = require('./lastNightOverseasDailyJob');
const { boardIdOf } = require('../../shared/bigPlayerBoard');

function fail(code) { const error = new Error(code); error.code = code; throw error; }

async function prepareLastNightToken({ snapshot, cipher, cipherEnv, now } = {}) {
  const { source, account, credentials } = snapshot || {};
  if (source?.id !== SOURCE_ID || String(boardIdOf(source)) !== BOARD_ID ||
    account?.source_id !== SOURCE_ID || !account?.id || !Array.isArray(credentials) ||
    credentials.some(row => row.source_id !== SOURCE_ID || row.account_id !== account.id)) {
    fail('LAST_NIGHT_AUTH_SCOPE_MISMATCH');
  }
  if (credentials.some(row => row.credential_type === 'account_password')) {
    fail('LAST_NIGHT_PASSWORD_LOGIN_UNAVAILABLE');
  }
  const tokenRow = credentials.find(row => row.credential_type === 'api_token');
  if (!tokenRow) fail('LAST_NIGHT_TOKEN_MISSING');
  const repo = {
    async getCredentialByAccount(id, type) {
      if (id !== account.id || type !== 'api_token') fail('LAST_NIGHT_AUTH_SCOPE_MISMATCH');
      return tokenRow;
    },
    async getAccount(id) {
      if (id !== account.id) fail('LAST_NIGHT_AUTH_SCOPE_MISMATCH');
      return account;
    }
  };
  const context = new CredentialContext({ repo, cipher, env: cipherEnv,
    now, allowLegacySourceFallback: false });
  const token = await context.loadApiToken(account, 'api_token');
  if (!token) fail('LAST_NIGHT_TOKEN_MISSING');
  return Object.freeze({ loadApiToken: async subject => {
    if ((subject?.id || subject?.accountId) !== account.id) fail('LAST_NIGHT_AUTH_SCOPE_MISMATCH');
    return token;
  } });
}

function createLastNightConnector({ credentialContext, fetchImpl } = {}) {
  if (!credentialContext?.loadApiToken || typeof credentialContext.load === 'function' ||
    typeof fetchImpl !== 'function') fail('LAST_NIGHT_CONNECTOR_CONFIG_INVALID');
  return new BigPlayerH5Connector({ BIGPLAYER_H5_ENABLED: 'true',
    BIGPLAYER_H5_ALLOWED_HOSTS: 'club-en.q1.com', BIGPLAYER_H5_TIMEOUT_MS: '15000' },
  { credentialContext, fetchImpl, loginSessionClient: null, authRefreshCoordinator: null });
}

module.exports = { prepareLastNightToken, createLastNightConnector };
