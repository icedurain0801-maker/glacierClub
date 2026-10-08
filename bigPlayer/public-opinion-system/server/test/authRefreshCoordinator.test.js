'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AuthRefreshCoordinator } = require('../src/services/authRefreshCoordinator');

function setup(started, result = { apiToken: 'token-value' }, bindError = null) {
  const updates = [];
  const repo = {
    async acquireAdvisoryLock() { return true; },
    async releaseAdvisoryLock() {},
    async getCredentialByAccount() { return { status: 'active' }; },
    async upsertAccountCredential(...args) { updates.push(['credential', args]); },
    async updateAccount(...args) { updates.push(['account', args]); },
    async updateSourceAuth(...args) { updates.push(['source', args]); }
  };
  const loginSessionClient = {
    configured() { return true; },
    async bindAccount() { if (bindError) throw Object.assign(new Error(bindError), { code: bindError }); },
    async startLogin() { return started; },
    async claimAuthResult() { return result; }
  };
  return { coordinator: new AuthRefreshCoordinator({ repo, loginSessionClient, env: {} }), updates };
}

const source = { id: 'source-1', platform: 'bigplayer_h5' };
const account = { id: 'account-1', platform: 'bigplayer_h5' };

test('auth refresh preserves stable login failure code', async () => {
  const { coordinator } = setup({ status: 'invalid', failureCode: 'INVALID_CREDENTIALS' });
  await assert.rejects(
    () => coordinator.refresh({ source, account }),
    error => error.code === 'INVALID_CREDENTIALS'
  );
});

test('auth refresh rejects an empty API token', async () => {
  const { coordinator } = setup({ status: 'active' }, { apiToken: '   ' });
  await assert.rejects(
    () => coordinator.refresh({ source, account }),
    error => error.code === 'AUTH_REFRESH_FAILED'
  );
});

for (const code of ['ACCOUNT_BINDING_CONFLICT', 'ACCOUNT_SCOPE_MISMATCH']) {
  test(`auth refresh preserves ${code} from login session binding`, async () => {
    const { coordinator } = setup({ status: 'active' }, undefined, code);
    await assert.rejects(
      () => coordinator.refresh({ source, account }),
      error => error.code === code
    );
  });
}

for (const code of ['CREDENTIAL_RESOLVE_INVALID', 'CREDENTIAL_RESOLVE_FAILED', 'AUTOMATION_NOT_CONFIGURED']) {
  test(`auth refresh preserves ${code} from login session setup`, async () => {
    const { coordinator } = setup({ status: 'active' }, undefined, code);
    await assert.rejects(
      () => coordinator.refresh({ source, account }),
      error => error.code === code
    );
  });
}
