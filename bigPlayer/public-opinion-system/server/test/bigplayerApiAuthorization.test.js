'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BigPlayerH5Connector } = require('../src/connectors/bigPlayerH5Connector');

function source() { return { id: 'source-1', platform: 'bigplayer_h5', config: { baseUrl: 'https://club.q1.com?env=web&gameId=g1&gameVersion=1' } }; }

test('AUTH-01 uses LoginSessionClient when account password exists', async () => {
  const calls = [];
  const connector = new BigPlayerH5Connector({}, { credentialContext: {
    async load(subject, type) { calls.push(['load', type]); if (type === 'account_password') return { secretObject: { account: 'qa', password: 'redacted' } }; },
    async loadApiToken() { calls.push(['token']); return 'old-token'; }
  }, loginSessionClient: {
    async bindAccount(payload) { calls.push(['bindAccount', payload.credentialRef]); },
    async startLogin(payload) { calls.push(['startLogin', payload.credential.secretObject.account]); return { status: 'started' }; },
    async getStatus() { calls.push(['getStatus']); return { status: 'active' }; },
    async claimAuthResult() { calls.push(['claimAuthResult']); return { accessToken: 'new-token' }; }
  } });
  assert.equal(await connector.loadApiToken(source(), connector.credentialContext, { id: 'account-1' }), 'new-token');
  assert.deepEqual(calls.map(([name, value]) => [name, value]), [['load', 'account_password'], ['bindAccount', 'credential:account-1:account_password'], ['startLogin', 'qa'], ['getStatus', undefined], ['claimAuthResult', undefined]]);
});

test('AUTH-02 login failure is terminal and does not fall back to token', async () => {
  let tokenCalls = 0;
  const connector = new BigPlayerH5Connector({}, { credentialContext: {
    async load(_subject, type) { if (type === 'account_password') return { secretObject: { account: 'qa', password: 'redacted' } }; },
    async loadApiToken() { tokenCalls += 1; return 'old-token'; }
  }, loginSessionClient: { async startLogin() { const error = new Error('failed'); error.code = 'LOGIN_FAILED'; throw error; }, async claimAuthResult() { throw new Error('must not claim'); } } });
  await assert.rejects(() => connector.loadApiToken(source(), connector.credentialContext, { id: 'account-1' }), error => error.code === 'AUTHORIZATION_FAILED');
  assert.equal(tokenCalls, 0);
});

test('AUTH-02 claimAuthResult failure is terminal and does not fall back to token', async () => {
  let tokenCalls = 0;
  const connector = new BigPlayerH5Connector({}, { credentialContext: {
    async load(_subject, type) { if (type === 'account_password') return { secretObject: { account: 'qa', password: 'redacted' } }; },
    async loadApiToken() { tokenCalls += 1; return 'old-token'; }
  }, loginSessionClient: {
    async startLogin() { return { status: 'started' }; },
    async claimAuthResult() { const error = new Error('claim failed'); error.code = 'AUTH_RESULT_UNAVAILABLE'; throw error; }
  } });
  await assert.rejects(() => connector.loadApiToken(source(), connector.credentialContext, { id: 'account-1' }), error => error.code === 'AUTHORIZATION_FAILED');
  assert.equal(tokenCalls, 0);
});

test('AUTH-03 uses configured token only when password is absent', async () => {
  let loginCalls = 0;
  const connector = new BigPlayerH5Connector({}, { credentialContext: {
    async load() { const error = new Error('missing'); error.code = 'CREDENTIAL_NOT_FOUND'; throw error; },
    async loadApiToken() { return 'configured-token'; }
  }, loginSessionClient: { async login() { loginCalls += 1; return { accessToken: 'unexpected' }; } } });
  assert.equal(await connector.loadApiToken(source(), connector.credentialContext, { id: 'account-1' }), 'configured-token');
  assert.equal(loginCalls, 0);
});

test('AUTH-04 reports authorization_missing when neither password nor token exists', async () => {
  const connector = new BigPlayerH5Connector({}, { credentialContext: {
    async load() { const error = new Error('missing'); error.code = 'CREDENTIAL_NOT_FOUND'; throw error; },
    async loadApiToken() { return ''; }
  } });
  await assert.rejects(() => connector.loadApiToken(source(), connector.credentialContext, { id: 'account-1' }), error => error.code === 'AUTHORIZATION_MISSING');
});

test('HOST-01/02 use club.q1.com only and fail before network for unsafe Q1 origins', async () => {
  let requests = 0;
  const connector = new BigPlayerH5Connector({}, { fetchImpl: async () => { requests += 1; return { ok: true, status: 200, url: 'https://club.q1.com/api', json: async () => ({ code: 0, data: {} }) }; } });
  await connector.requestQ1('/api/club/v1/auth/user/context', source(), 'token');
  await assert.rejects(() => connector.requestQ1('https://club-en.q1.com/api', source(), 'token'), error => error.code === 'H5_URL_OUTSIDE_ALLOWED_HOSTS');
  assert.equal(requests, 1);
});
