'use strict';

const { BigPlayerH5LoginAdapter, DouyinLoginAdapter, XiaohongshuLoginAdapter } = require('./adapters/productionAdapters');
const { MockSocialLoginAdapter } = require('./adapters/mockSocialLoginAdapter');
const { createHttpServer } = require('./httpServer');
const { LoginSessionService } = require('./loginSessionService');
const { MemoryChallengeStore, MemoryExchangeStore, MemorySessionStore } = require('./store');
const { loadLocalEnvironment } = require('./env');
const { createCredentialResolver } = require('./credentials');
const { BigPlayerH5PlaywrightAutomation } = require('./adapters/bigPlayerH5Playwright');

function createAdapters(env = process.env, options = {}) {
  const mockEnabled = ['1', 'true'].includes(String(env.LOGIN_SESSION_MOCK_ENABLED || '').toLowerCase());
  const mockAdapter = new MockSocialLoginAdapter();
  const credentialResolver = options.credentialResolver || null;
  let bigplayerAutomation = options.automation?.bigplayer_h5 || null;
  if (!bigplayerAutomation && credentialResolver) {
    try { bigplayerAutomation = new BigPlayerH5PlaywrightAutomation({ credentialResolver, playwright: options.playwright, headless: String(env.LOGIN_SESSION_HEADLESS || 'true') !== 'false', timeoutMs: Number(env.LOGIN_AUTOMATION_TIMEOUT_MS || 30000), challengeTtlMs: Number(env.LOGIN_CHALLENGE_TTL_MS || 300000) }); }
    catch (error) { bigplayerAutomation = { readiness: () => ({ available: false, code: error.code || 'AUTOMATION_NOT_CONFIGURED', message: 'BigPlayer login automation is not available' }) }; }
  }
  return options.adapters || {
    mock: mockAdapter,
    douyin: mockEnabled ? mockAdapter : new DouyinLoginAdapter({ automation: options.automation?.douyin }),
    xiaohongshu: mockEnabled ? mockAdapter : new XiaohongshuLoginAdapter({ automation: options.automation?.xiaohongshu }),
    bigplayer_h5: new BigPlayerH5LoginAdapter({ automation: bigplayerAutomation })
  };
}

function createService(env = process.env, options = {}) {
  const now = options.now || (() => Date.now());
  const credentialResolver = options.credentialResolver || createCredentialResolver({
    baseUrl: env.PUBLIC_OPINION_SERVER_URL || env.LOGIN_SESSION_SERVER_URL,
    internalToken: env.LOGIN_SESSION_INTERNAL_TOKEN,
    fetchImpl: options.fetchImpl,
    timeoutMs: Number(env.LOGIN_SESSION_REQUEST_TIMEOUT_MS || 5000)
  });
  const adapters = createAdapters(env, { ...options, credentialResolver });
  return new LoginSessionService({
    sessionStore: options.sessionStore || new MemorySessionStore({ now }),
    challengeStore: options.challengeStore || new MemoryChallengeStore({ now, ttlMs: Number(env.LOGIN_CHALLENGE_TTL_MS || 300000) }),
    exchangeStore: options.exchangeStore || new MemoryExchangeStore({ now, ttlMs: Number(env.LOGIN_RESULT_EXCHANGE_TTL_MS || 30000) }),
    adapters,
    sessionTtlMs: Number(env.LOGIN_SESSION_TTL_MS || 3600000),
    now,
    credentialResolver
  });
}

function createReadiness(env, service) {
  return () => {
    const internalAuth = { configured: Boolean(env.LOGIN_SESSION_INTERNAL_TOKEN) };
    const adapter = service.adapters?.bigplayer_h5;
    const bigplayer = typeof adapter?.readiness === 'function'
      ? adapter.readiness()
      : { available: false, code: 'ADAPTER_READINESS_UNAVAILABLE', message: 'bigplayer_h5 adapter readiness is unavailable' };
    const resolver = { configured: typeof service.credentialResolver === 'function' };
    return { ready: internalAuth.configured && resolver.configured && bigplayer.available, internalAuth, resolver, adapters: { bigplayer_h5: bigplayer } };
  };
}

function createApp(env = process.env, options = {}) {
  const service = options.service || createService(env, options);
  return createHttpServer({ service, internalToken: env.LOGIN_SESSION_INTERNAL_TOKEN || '', readiness: options.readiness || createReadiness(env, service) });
}

if (require.main === module) {
  loadLocalEnvironment();
  const host = process.env.LOGIN_SESSION_HOST || '127.0.0.1';
  const port = Number(process.env.LOGIN_SESSION_PORT || 4310);
  createApp().listen(port, host, () => process.stdout.write(`login-session-service listening on http://${host}:${port}\n`));
}

module.exports = { createAdapters, createApp, createReadiness, createService, loadLocalEnvironment };
