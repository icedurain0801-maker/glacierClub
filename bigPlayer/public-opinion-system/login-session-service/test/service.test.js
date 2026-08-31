'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createService } = require('../src');
const { DouyinLoginAdapter, XiaohongshuLoginAdapter } = require('../src/adapters/productionAdapters');

function binding(accountId = 'account-1', sourceId = 'source-1') {
  return { sourceId, accountId, platform: 'mock' };
}

function setup(options = {}) {
  let current = options.now || Date.UTC(2026, 7, 12, 0, 0, 0);
  const now = () => current;
  const service = createService({ LOGIN_SESSION_TTL_MS: '1000', LOGIN_CHALLENGE_TTL_MS: '100' }, { now });
  return { service, advance(ms) { current += ms; } };
}

async function boundService(accountId = 'account-1', sourceId = 'source-1') {
  const harness = setup();
  harness.service.bindAccount({ ...binding(accountId, sourceId), credentialRef: `cred-${accountId}`, phone: '13800138000' });
  return harness;
}

test('mock adapter deterministically produces success, invalid credentials, expiration and relogin', async () => {
  for (const [scenario, expected] of [
    ['success', 'active'],
    ['invalid_credentials', 'invalid_credentials'],
    ['session_expired', 'session_expired'],
    ['relogin', 'active']
  ]) {
    const { service } = await boundService();
    const result = await service.startLogin({ ...binding(), scenario });
    assert.equal(result.status, expected);
    assert.equal(Boolean(result.sessionRef), scenario === 'success' || scenario === 'relogin');
  }
});

test('mock adapter produces all four supported challenge types', async () => {
  for (const scenario of ['sms_code', 'image_captcha', 'qr_code', 'device_confirmation']) {
    const { service } = await boundService();
    const result = await service.startLogin({ ...binding(), scenario });
    assert.equal(result.status, 'manual_verification');
    assert.equal(result.challenge.type, scenario);
    assert.equal(result.challenge.allowsTextSubmission, ['sms_code', 'image_captcha'].includes(scenario));
    assert.equal(result.challenge.requiresPolling, ['qr_code', 'device_confirmation'].includes(scenario));
  }
});

test('text challenge is one-time and never exposes its expected answer', async () => {
  const { service } = await boundService();
  const started = await service.startLogin({ ...binding(), scenario: 'sms_code' });
  assert.equal(Object.hasOwn(started.challenge, 'expectedAnswer'), false);
  const completed = await service.submitChallenge({ ...binding(), challengeId: started.challenge.id, answer: '123456' });
  assert.equal(completed.status, 'active');
  await assert.rejects(
    () => service.submitChallenge({ ...binding(), challengeId: started.challenge.id, answer: '123456' }),
    error => error.code === 'CHALLENGE_ALREADY_USED'
  );
});

test('poll challenge stays pending until approved then becomes one-time', async () => {
  const { service } = await boundService();
  const started = await service.startLogin({ ...binding(), scenario: 'qr_code' });
  const pending = await service.pollChallenge({ ...binding(), challengeId: started.challenge.id, approved: false });
  assert.equal(pending.status, 'manual_verification');
  const completed = await service.pollChallenge({ ...binding(), challengeId: started.challenge.id, approved: true });
  assert.equal(completed.status, 'active');
  await assert.rejects(
    () => service.pollChallenge({ ...binding(), challengeId: started.challenge.id, approved: true }),
    error => error.code === 'CHALLENGE_ALREADY_USED'
  );
});

test('approved challenge stores authorization result for one-time claim without exposing it publicly', async () => {
  const account = { sourceId: 'source-challenge-result', accountId: 'account-challenge-result', platform: 'challenge-mock' };
  const adapter = {
    async login() {
      return { kind: 'challenge', challenge: { type: 'sms_code', allowsTextSubmission: true, requiresPolling: false, instruction: 'Enter code' } };
    },
    async submitChallenge() {
      return { approved: true, apiToken: 'challenge-api-token', expiresAt: '2026-08-13T00:00:00.000Z' };
    }
  };
  const service = createService({ LOGIN_RESULT_EXCHANGE_TTL_MS: '1000' }, { adapters: { 'challenge-mock': adapter } });
  service.bindAccount({ ...account, credentialRef: 'credential-ref' });
  const started = await service.startLogin(account);
  const completed = await service.submitChallenge({ ...account, challengeId: started.challenge.id, answer: '123456' });

  assert.equal(completed.status, 'active');
  assert.equal(Object.hasOwn(completed, 'apiToken'), false);
  assert.equal(Object.hasOwn(completed.challenge, 'apiToken'), false);
  assert.deepEqual(service.claimAuthResult(account), { apiToken: 'challenge-api-token', expiresAt: '2026-08-13T00:00:00.000Z' });
  assert.throws(() => service.claimAuthResult(account), error => error.code === 'AUTH_RESULT_NOT_FOUND');
});

test('approved polled challenge stores access token for one-time claim', async () => {
  const account = { sourceId: 'source-poll-result', accountId: 'account-poll-result', platform: 'poll-mock' };
  const adapter = {
    async login() {
      return { kind: 'challenge', challenge: { type: 'qr_code', allowsTextSubmission: false, requiresPolling: true, instruction: 'Scan code' } };
    },
    async pollChallenge() {
      return { approved: true, accessToken: 'poll-access-token', expiresAt: '2026-08-14T00:00:00.000Z' };
    }
  };
  const service = createService({ LOGIN_RESULT_EXCHANGE_TTL_MS: '1000' }, { adapters: { 'poll-mock': adapter } });
  service.bindAccount({ ...account, credentialRef: 'credential-ref' });
  const started = await service.startLogin(account);
  const completed = await service.pollChallenge({ ...account, challengeId: started.challenge.id });

  assert.equal(completed.status, 'active');
  assert.equal(Object.hasOwn(completed, 'accessToken'), false);
  assert.deepEqual(service.claimAuthResult(account), { apiToken: 'poll-access-token', expiresAt: '2026-08-14T00:00:00.000Z' });
  assert.throws(() => service.claimAuthResult(account), error => error.code === 'AUTH_RESULT_NOT_FOUND');
});

test('expired challenge cannot be read or submitted', async () => {
  const { service, advance } = setup();
  service.bindAccount({ ...binding(), credentialRef: 'cred-1' });
  const started = await service.startLogin({ ...binding(), scenario: 'image_captcha' });
  advance(101);
  assert.throws(() => service.getChallenge({ ...binding(), challengeId: started.challenge.id }), error => error.code === 'CHALLENGE_EXPIRED');
});

test('challenge and session references are isolated by source and account binding', async () => {
  const { service } = setup();
  service.bindAccount({ ...binding('account-1', 'source-1'), credentialRef: 'cred-1' });
  service.bindAccount({ ...binding('account-2', 'source-2'), credentialRef: 'cred-2' });
  const started = await service.startLogin({ ...binding('account-1', 'source-1'), scenario: 'sms_code' });
  assert.throws(
    () => service.getChallenge({ ...binding('account-2', 'source-2'), challengeId: started.challenge.id }),
    error => error.code === 'ACCOUNT_SCOPE_MISMATCH'
  );
  await service.startLogin({ ...binding('account-2', 'source-2'), scenario: 'success' });
  assert.throws(
    () => service.getSessionReference(binding('account-2', 'source-1')),
    error => error.code === 'ACCOUNT_SCOPE_MISMATCH'
  );
});

test('active session expires without exposing session material beyond opaque reference', async () => {
  const { service, advance } = setup();
  service.bindAccount({ ...binding(), credentialRef: 'cred-1' });
  const active = await service.startLogin({ ...binding(), scenario: 'success' });
  assert.match(active.sessionRef, /^sess_/);
  assert.equal(Object.hasOwn(active, 'cookie'), false);
  advance(1001);
  const status = service.getStatus(binding());
  assert.equal(status.status, 'session_expired');
  assert.equal(status.sessionRef, null);
});

test('production adapter skeletons fail closed', async () => {
  for (const adapter of [new DouyinLoginAdapter(), new XiaohongshuLoginAdapter()]) {
    await assert.rejects(() => adapter.login({}), error => error.code === 'CAPABILITY_UNSUPPORTED');
  }
});

test('bigplayer_h5 adapter uses an injected automation contract and validates its protocol', async () => {
  const { createService } = require('../src');
  const calls = [];
  const service = createService({ LOGIN_SESSION_TTL_MS: '1000' }, {
    automation: {
      bigplayer_h5: {
        async login(input) { calls.push(input); return { kind: 'success', apiToken: 'injected-test-token' }; }
      }
    }
  });
  const account = { sourceId: 'source-1', accountId: 'account-h5', platform: 'bigplayer_h5' };
  service.bindAccount({ ...account, credentialRef: 'credential-ref' });
  const result = await service.startLogin(account);
  assert.equal(result.status, 'active');
  assert.deepEqual(calls, [{ scenario: undefined, credentialRef: 'credential-ref' }]);
  await assert.rejects(() => new (require('../src/adapters/productionAdapters').BigPlayerH5LoginAdapter)({ automation: { async login() { return { kind: 'unknown' }; } } }).login({}), error => error.code === 'ADAPTER_PROTOCOL_UNSUPPORTED');
});

test('H5 authorization result is scoped, short-lived, and claimable only once', async () => {
  let current = Date.UTC(2026, 7, 12, 0, 0, 0);
  const now = () => current;
  const account = { sourceId: 'source-h5', accountId: 'account-h5', platform: 'bigplayer_h5' };
  const service = createService({ LOGIN_RESULT_EXCHANGE_TTL_MS: '100' }, {
    now,
    automation: { bigplayer_h5: { async login() { return { kind: 'success', apiToken: 'short-lived-token', expiresAt: '2026-08-13T00:00:00.000Z' }; } } }
  });
  service.bindAccount({ ...account, credentialRef: 'credential-ref' });
  await service.startLogin(account);
  assert.throws(() => service.claimAuthResult({ ...account, sourceId: 'other-source' }), error => error.code === 'ACCOUNT_SCOPE_MISMATCH');
  assert.deepEqual(service.claimAuthResult(account), { apiToken: 'short-lived-token', expiresAt: '2026-08-13T00:00:00.000Z' });
  assert.throws(() => service.claimAuthResult(account), error => error.code === 'AUTH_RESULT_NOT_FOUND');

  await service.startLogin(account);
  current += 101;
  assert.throws(() => service.claimAuthResult(account), error => error.code === 'AUTH_RESULT_EXPIRED');
});

test('BigPlayer automation opens the H5 login entry and accepts login1.q1.com', async () => {
  const { BigPlayerH5PlaywrightAutomation } = require('../src/adapters/bigPlayerH5Playwright');
  const calls = { fills: [], clicks: [] };
  const frameLocator = selector => ({
    first() { return this; },
    async count() { return selector === 'input[name="account"]' || selector === 'input[name="password"]' || selector === 'button.submit-btn' ? 1 : 0; },
    async fill(value) { calls.fills.push([selector, value]); },
    async click() { calls.clicks.push(selector); },
    async screenshot() { return Buffer.from('unused'); }
  });
  const loginFrame = { url: () => 'https://login1.q1.com/h5/account.html', locator: frameLocator };
  const loginEntry = { first() { return this; }, async count() { return calls.clicks.includes('我的') ? 1 : 0; }, async click() { calls.clicks.push('去登录'); } };
  const profileEntry = { first() { return this; }, async count() { return 1; }, async click() { calls.clicks.push('我的'); } };
  const page = {
    frames: () => calls.clicks.includes('去登录') ? [loginFrame] : [],
    getByText: text => text === '去登录' ? loginEntry : profileEntry,
    async goto() {},
    async waitForTimeout() {},
    async evaluate() { return 'top-level-token'; }
  };
  const context = { async newPage() { return page; }, async close() {} };
  const playwright = { chromium: { async launch() { return { async newContext() { return context; }, async close() {} }; } } };
  const automation = new BigPlayerH5PlaywrightAutomation({
    credentialResolver: async () => ({ baseUrl: 'https://example.test', account: 'private-account', password: 'private-password' }),
    playwright
  });

  const result = await automation.login({ credentialRef: 'credential-ref', sourceId: 'source-h5', accountId: 'account-h5' });
  assert.deepEqual(result, { kind: 'success', apiToken: 'top-level-token' });
  assert.deepEqual(calls.clicks, ['我的', '去登录', 'button.submit-btn']);
  assert.deepEqual(calls.fills, [
    ['input[name="account"]', 'private-account'],
    ['input[name="password"]', 'private-password']
  ]);
});

test('BigPlayer automation ignores a hidden captcha instead of timing out on a screenshot', async () => {
  const { BigPlayerH5PlaywrightAutomation } = require('../src/adapters/bigPlayerH5Playwright');
  let screenshotCount = 0;
  const locator = selector => ({
    first() { return this; },
    async count() { return selector === '#imgageCaptcha' ? 1 : 0; },
    async fill() {},
    async click() {},
    async isVisible() { return false; },
    async screenshot() { screenshotCount += 1; return Buffer.from('hidden-captcha'); }
  });
  const frame = { url: () => 'https://login1.q1.com/h5/account.html', locator };
  const page = {
    frames: () => [frame],
    async goto() {},
    async waitForTimeout() {},
    async evaluate() { return null; }
  };
  let closeCount = 0;
  const context = { async newPage() { return page; }, async close() { closeCount += 1; } };
  const browser = { async newContext() { return context; }, async close() { closeCount += 1; } };
  const playwright = { chromium: { async launch() { return browser; } } };
  const automation = new BigPlayerH5PlaywrightAutomation({
    credentialResolver: async () => ({ baseUrl: 'https://example.test', account: 'private-account', password: 'private-password' }),
    playwright
  });

  const result = await automation.login({ credentialRef: 'credential-ref', sourceId: 'source-h5', accountId: 'account-h5' });
  assert.deepEqual(result, { kind: 'failure', code: 'LOGIN_STATE_UNKNOWN' });
  assert.equal(screenshotCount, 0);
  assert.equal(closeCount, 2);
});

test('BigPlayer automation classifies explicit credential errors', async () => {
  const { BigPlayerH5PlaywrightAutomation } = require('../src/adapters/bigPlayerH5Playwright');
  const locator = selector => ({ first() { return this; }, async count() { return selector === '#imgageCaptcha' ? 0 : 1; }, async innerText() { return '账号或密码错误'; }, async fill() {}, async click() {} });
  const frame = { url: () => 'https://login1.q1.com/h5/account.html', locator };
  const page = { frames: () => [frame], async goto() {}, async waitForTimeout() {}, async evaluate() { return null; } };
  const context = { async newPage() { return page; }, async close() {} };
  const browser = { async newContext() { return context; }, async close() {} };
  const automation = new BigPlayerH5PlaywrightAutomation({
    credentialResolver: async () => ({ baseUrl: 'https://example.test', account: 'private-account', password: 'private-password' }),
    playwright: { chromium: { async launch() { return browser; } } }
  });
  const result = await automation.login({ credentialRef: 'credential-ref', sourceId: 'source-h5', accountId: 'account-h5' });
  assert.deepEqual(result, { kind: 'failure', code: 'INVALID_CREDENTIALS' });
});


test('fake Playwright browser completes captcha and exposes a one-time token claim without leaking secrets', async () => {
  const { BigPlayerH5PlaywrightAutomation } = require('../src/adapters/bigPlayerH5Playwright');
  const { BigPlayerH5LoginAdapter } = require('../src/adapters/productionAdapters');
  const calls = { goto: [], fills: [], closed: 0 };
  const state = { token: null, captcha: true };
  const locator = selector => ({
    first() { return this; },
    async count() { return selector === '#imgageCaptcha' && state.captcha ? 1 : 0; },
    async isVisible() { return selector === '#imgageCaptcha' && state.captcha; },
    async fill(value) { calls.fills.push([selector, value]); },
    async click() { if (selector === 'button' && calls.fills.some(([name, value]) => name === '#verifyImageCode' && value === 'ABCD')) state.token = 'fake-h5-token'; },
    async screenshot() { return Buffer.from('fake-captcha'); }
  });
  const frame = { url: () => 'https://login.q1.com/frame', locator: selector => locator(selector === 'button.submit-btn' ? 'button' : selector) };
  const page = {
    frames: () => [frame],
    async goto(url) { calls.goto.push(url); },
    async waitForTimeout() {},
    async evaluate() { return state.token; }
  };
  const context = { async newPage() { return page; }, async close() { calls.closed += 1; } };
  const browser = { async newContext() { return context; }, async close() { calls.closed += 1; } };
  const playwright = { chromium: { async launch() { return browser; } } };
  const credentialResolver = async input => ({ ...input, baseUrl: 'https://example.test', account: 'private-account', password: 'private-password' });
  const automation = new BigPlayerH5PlaywrightAutomation({ credentialResolver, playwright });
  const adapter = new BigPlayerH5LoginAdapter({ automation });
  const service = createService({ LOGIN_SESSION_TTL_MS: '1000' }, { adapters: { bigplayer_h5: adapter } });
  const binding = { sourceId: 'source-fake-h5', accountId: 'account-fake-h5', platform: 'bigplayer_h5' };
  service.bindAccount({ ...binding, credentialRef: 'credential-ref' });

  const started = await service.startLogin(binding);
  assert.equal(started.status, 'manual_verification');
  assert.equal(started.challenge.type, 'image_captcha');
  assert.match(started.challenge.id, /^chl_/);
  assert.equal(Object.hasOwn(started.challenge, 'adapterChallengeRef'), false);
  assert.doesNotMatch(JSON.stringify(started.challenge), /credential|password|token|private-account|private-password/i);
  assert.deepEqual(calls.goto, ['https://example.test']);
  assert.equal(automation.handles.size, 1);

  const completed = await service.submitChallenge({ ...binding, challengeId: started.challenge.id, answer: 'ABCD' });
  assert.equal(completed.status, 'active');
  assert.equal(completed.challenge.status, 'approved');
  assert.equal(Object.hasOwn(completed, 'apiToken'), false);
  assert.doesNotMatch(JSON.stringify(completed), /adapterChallengeRef|private-account|private-password|fake-h5-token/i);
  assert.equal(automation.handles.size, 0);
  assert.deepEqual(service.claimAuthResult(binding), { apiToken: 'fake-h5-token', expiresAt: null });
  assert.throws(() => service.claimAuthResult(binding), error => error.code === 'AUTH_RESULT_NOT_FOUND');
});

test('relogin clears the previous session before a new challenge', async () => {
  const { service } = await boundService('account-relogin', 'source-relogin');
  const account = { sourceId: 'source-relogin', accountId: 'account-relogin', platform: 'mock' };
  const active = await service.startLogin({ ...account, scenario: 'success' });
  assert.equal(service.getStatus(account).sessionRef, active.sessionRef);
  const pending = await service.startLogin({ ...account, scenario: 'image_captcha' });
  assert.equal(pending.status, 'manual_verification');
  assert.equal(pending.sessionRef, null);
  assert.throws(() => service.getSessionReference(account), error => error.code === 'SESSION_NOT_ACTIVE');
});
test('session reference exchange is short-lived and one-time', async () => {
  const { service, advance } = await boundService();
  await service.startLogin({ ...binding(), scenario: 'success' });
  const exchange = service.issueSessionReferenceExchange(binding());
  assert.match(exchange.exchangeToken, /^xchg_/);
  const reference = service.exchangeSessionReference(exchange);
  assert.match(reference.sessionRef, /^sess_/);
  assert.throws(() => service.exchangeSessionReference(exchange), error => error.code === 'EXCHANGE_INVALID');
  const second = service.issueSessionReferenceExchange(binding());
  advance(30001);
  assert.throws(() => service.exchangeSessionReference(second), error => error.code === 'EXCHANGE_EXPIRED');
});
