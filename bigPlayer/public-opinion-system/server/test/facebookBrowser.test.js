'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeFacebookWebUrl, bindingKey } = require('../../shared/facebookBrowser');
const { FacebookBrowserAccountService } = require('../src/services/facebookBrowserAccount');
const { FacebookBrowserConnector } = require('../src/connectors/facebookBrowserConnector');
const { saveFacebookBrowserAccount } = require('../src/db/facebookBrowserAccount');
const cipher = require('../src/integrations/credentialCipher');
const { createService } = require('../../login-session-service/src/index');
const { FacebookBrowserAutomation } = require('../../login-session-service/src/adapters/facebookBrowser');
const source = { id: 'source-a', game_id: 'game-a', community_id: 'community-a', region_code: 'overseas', platform: 'facebook', config: { collectionMode: 'browser', baseUrl: 'https://www.facebook.com/ExampleGame' } };
const account = { id: 'account-a', source_id: source.id, game_id: source.game_id, community_id: source.community_id, platform: 'facebook', enabled: 1 };
const binding = { sourceId: source.id, accountId: account.id, platform: 'facebook' };

test('Facebook challenge continuation uses credentials from the bound source and never exposes them', async () => {
  const resolved = []; const received = [];
  const service = createService({}, {
    credentialResolver: async input => { resolved.push(input); return { account: 'fixture-user', password: 'fixture-secret', baseUrl: source.config.baseUrl, bindingRevision: 'r1' }; },
    adapters: { facebook: {
      login: async () => ({ kind: 'challenge', challenge: { requiresPolling: true, type: 'external_confirmation', adapterChallengeRef: 'private-ref' } }),
      inspectChallenge: async input => { received.push(input); return { approved: false }; },
      pollChallenge: async input => { received.push(input); return { approved: true }; }
    } }
  });
  service.bindAccount({ ...binding, credentialRef: 'credential:account-a:account_password' });
  const start = await service.startLogin(binding);
  const input = { ...binding, challengeId: start.challenge.id };
  await assert.rejects(service.inspectFacebookChallenge({ ...input, sourceId: 'other' }), { code: 'ACCOUNT_SCOPE_MISMATCH' });
  assert.equal(resolved.length, 1);
  await service.inspectFacebookChallenge({ ...input, action: 'view' });
  const result = await service.pollChallenge(input);
  assert.equal(result.status, 'active');
  assert.equal(received.every(row => row.credentials.password === 'fixture-secret'), true);
  assert.equal(resolved.every(row => row.sourceId === source.id && row.accountId === account.id), true);
  assert.equal(JSON.stringify(result).includes('fixture-secret'), false);
});

test('configured URLs are restricted to Facebook pages and groups and strip every tracking parameter', () => {
  assert.equal(normalizeFacebookWebUrl('https://m.facebook.com/groups/123?utm_a=1&utm_b=2&ref=3'), 'https://www.facebook.com/groups/123');
  for (const url of ['https://facebook.com.evil.test/page', 'http://facebook.com/page', 'https://u:p@facebook.com/page', 'https://facebook.com/login', 'https://facebook.com/%6cogin', 'https://facebook.com/a%2fb', 'https://facebook.com/groups/1/posts/2', 'https://127.0.0.1/page', 'https://facebook.com/profile.php']) assert.throws(() => normalizeFacebookWebUrl(url), { code: 'FACEBOOK_URL_INVALID' });
  assert.notEqual(bindingKey(binding), bindingKey({ ...binding, accountId: 'other' }));
});

function accountService(overrides = {}) {
  return new FacebookBrowserAccountService({ repo: {}, env: { CREDENTIAL_ENC_KEY: 'ab'.repeat(32) }, resolveScope: async ({ communityId }) => ({ communityId, gameId: 'game-a', regionCode: 'overseas' }), requireCommunity: async () => {}, assertCommunityScope: () => {}, ...overrides });
}
test('each overseas community stores its own authenticated ciphertext without exposing credentials', async () => {
  const created = [];
  const repo = { createSourceWithAccount: async input => { created.push(input); return { source: { ...source, id: input.sourceId, community_id: input.communityId } }; }, listAccounts: async ({ sourceId }) => [{ ...account, id: created.find(row => row.sourceId === sourceId).accountId, masked_login_identifier: 'ex***le' }], getAccountCredentialSummary: async () => [{ credential_type: 'account_password', has_secret_cipher: 1 }] };
  const service = accountService({ repo });
  for (const communityId of ['community-a', 'community-b']) {
    const result = await service.create({ displayName: 'Test', baseUrl: source.config.baseUrl, communityId, account: 'example', password: 'fixture-password' }, {});
    assert.equal(result.account.hasAccountPassword, true);
    assert.equal(JSON.stringify(result).includes('fixture-password'), false);
  }
  assert.notEqual(created[0].accountId, created[1].accountId);
  assert.equal(created[1].collectionMode, 'browser');
  assert.equal(created[1].sourceEnabled, false);
  const aad = `${created[0].accountId}:account_password:facebook`;
  assert.equal(JSON.parse(cipher.decrypt(created[0].secretCipher, service.env, { aad })).password, 'fixture-password');
  assert.throws(() => cipher.decrypt(created[0].secretCipher, service.env, { aad: `${created[1].accountId}:account_password:facebook` }));
});
test('disabled, domestic and unauthorized communities cannot create or login', async () => {
  await assert.rejects(accountService().scope({ ...source, region_code: 'domestic' }, {}), { code: 'FACEBOOK_SCOPE_MISMATCH' });
  await assert.rejects(accountService({ requireCommunity: async () => { throw Object.assign(new Error(), { code: 'COMMUNITY_DISABLED' }); } }).scope(source, {}), { code: 'COMMUNITY_DISABLED' });
  await assert.rejects(accountService({ assertCommunityScope: () => { throw Object.assign(new Error(), { code: 'FORBIDDEN' }); } }).scope(source, {}), { code: 'FORBIDDEN' });
});
test('account form rejects inconsistent credentials and unsupported fields', () => {
  const base = { displayName: 'Test', baseUrl: source.config.baseUrl };
  for (const patch of [{ account: 'x' }, { account: 'x', password: 'y', confirmPassword: 'z' }, { cookie: 'x' }, { frequencySeconds: 5 }]) assert.throws(() => accountService().validate({ ...base, ...patch }));
});
test('configuration transaction uses the exact default account and rolls back while a run is active', async () => {
  let rolledBack = false; let written = false;
  const conn = { beginTransaction: async () => {}, rollback: async () => { rolledBack = true; }, release() {}, query: async sql => {
    if (sql.startsWith('SELECT * FROM po_sources')) return [[{ ...source, default_account_id: account.id }]];
    if (sql.startsWith('SELECT * FROM po_accounts')) { assert.match(sql, /ORDER BY \(id=\?\)/); return [[account]]; }
    if (sql.startsWith('SELECT id FROM po_sync_runs')) { assert.match(sql, /pausing.*cancelling/); return [[{ id: 'running' }]]; }
    written = true; return [[]];
  } };
  await assert.rejects(saveFacebookBrowserAccount({ pool: { getConnection: async () => conn } }, source.id, { baseUrl: source.config.baseUrl }), { code: 'SOURCE_RUN_ACTIVE' });
  assert.equal(rolledBack, true); assert.equal(written, false);
});
test('browser connector renews expired sessions once, uses no Graph token and preserves legacy capability checks', async () => {
  let logins = 0; let collection;
  const connector = new FacebookBrowserConnector({}, { loginSessionClient: { configured: () => true, getStatus: async () => ({ status: 'expired' }), bindAccount: async () => {}, startLogin: async () => { logins++; return { status: 'active' }; }, getSessionReference: async () => ({ sessionRef: 'session-a' }), collectFacebook: async payload => { collection = payload; return { items: [], hasMore: false }; } } });
  const results = await Promise.all([connector.accountHealth({ source, account }), connector.accountHealth({ source, account })]);
  assert.equal(results.every(row => row.authorized), true); assert.equal(logins, 1);
  await connector.listPosts({ source, account }); assert.equal(collection.sessionRef, 'session-a'); assert.equal(collection.baseUrl, undefined);
  assert.equal(connector.hasSourceCapability('posts', source), true);
  assert.equal(connector.hasSourceCapability('posts', { ...source, config: {} }), true);
});
test('manual verification never triggers an automatic login retry', async () => {
  const connector = new FacebookBrowserConnector({}, { loginSessionClient: { configured: () => true, getStatus: async () => ({ status: 'manual_verification' }), startLogin: () => { throw Error('must not login'); } } });
  assert.equal((await connector.accountHealth({ source, account })).reason, 'MANUAL_VERIFICATION_REQUIRED');
});
test('internal collection cannot change the configured target URL or borrow another session reference', async () => {
  let collected;
  const service = createService({}, { adapters: { facebook: { login: async () => ({ kind: 'success' }), collect: async input => { collected = input; return { items: [], hasMore: false }; } } }, credentialResolver: async () => ({ account: 'fixture', password: 'fixture', baseUrl: source.config.baseUrl }) });
  service.bindAccount({ ...binding, credentialRef: 'credential:account-a:account_password' }); await service.startLogin(binding);
  const reference = service.getSessionReference(binding);
  await assert.rejects(service.collectFacebook({ ...binding, sessionRef: 'wrong' }), { code: 'SESSION_NOT_ACTIVE' });
  await service.collectFacebook({ ...binding, sessionRef: reference.sessionRef, baseUrl: 'https://evil.test/', scope: 'posts' });
  assert.equal(collected.baseUrl, source.config.baseUrl);
  await assert.rejects(service.collectFacebook({ ...binding, sourceId: 'other', sessionRef: reference.sessionRef }), { code: 'ACCOUNT_SCOPE_MISMATCH' });
});
test('browser limits simultaneous operations and prevents same-community overlap', async () => {
  const automation = new FacebookBrowserAutomation({ maxConcurrent: 1, queueTimeoutMs: 1 }); let finish;
  const pending = automation.locked(binding, () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  await assert.rejects(automation.locked(binding, async () => {}), { code: 'FACEBOOK_ACCOUNT_BUSY' });
  await assert.rejects(automation.locked({ ...binding, accountId: 'other' }, async () => {}), { code: 'FACEBOOK_BROWSER_BUSY' });
  finish(); await pending; assert.equal(automation.busy.size, 0);
});

test('challenge screenshots and approval remain scoped, expire and cannot be replayed', async () => {
  let timestamp = Date.now();
  const service = createService({}, { now: () => timestamp, credentialResolver: async () => ({ account: 'fixture', password: 'fixture' }), adapters: { facebook: { login: async () => ({ kind: 'challenge', challenge: { type: 'external_confirmation', adapterChallengeRef: 'private-ref', requiresPolling: true } }), inspectChallenge: async () => ({ approved: true }) } } });
  service.bindAccount({ ...binding, credentialRef: 'credential:account-a:account_password' });
  const login = await service.startLogin(binding);
  await assert.rejects(service.inspectFacebookChallenge({ ...binding, sourceId: 'other', challengeId: login.challenge.id }), { code: 'ACCOUNT_SCOPE_MISMATCH' });
  const result = await service.inspectFacebookChallenge({ ...binding, challengeId: login.challenge.id });
  assert.equal(result.status, 'active'); assert.equal(JSON.stringify(result).includes('private-ref'), false);
  await assert.rejects(service.inspectFacebookChallenge({ ...binding, challengeId: login.challenge.id }), { code: 'CHALLENGE_ALREADY_USED' });
  const next = await service.startLogin(binding); timestamp += 300001;
  await assert.rejects(service.inspectFacebookChallenge({ ...binding, challengeId: next.challenge.id }), { code: 'CHALLENGE_EXPIRED' });
});

test('a failed browser disposal still revokes the service reference', async () => {
  const service = createService({}, { credentialResolver: async () => ({}), adapters: { facebook: { login: async () => ({ kind: 'success' }), revoke: async () => { throw Error('dispose failed'); } } } });
  service.bindAccount({ ...binding, credentialRef: 'credential:account-a:account_password' }); await service.startLogin(binding);
  await assert.rejects(service.revoke(binding));
  assert.throws(() => service.getSessionReference(binding), { code: 'SESSION_NOT_ACTIVE' });
});

test('many communities queue fairly under the global browser concurrency limit', async () => {
  const automation = new FacebookBrowserAutomation({ maxConcurrent:2 }); let active=0; let peak=0; const started=[];
  await Promise.all(Array.from({ length:16 }, (_,index) => automation.locked({ ...binding, accountId:`community-${index}` }, async () => {
    active++; peak=Math.max(peak,active); started.push(index); await new Promise(resolve=>setImmediate(resolve)); active--;
  })));
  assert.equal(peak,2); assert.deepEqual(started,Array.from({ length:16 },(_,index)=>index)); assert.equal(automation.waiters.length,0); assert.equal(automation.busy.size,0);
});

test('Worker authorization for browser sources never loads an API token and stores a schema-safe manual state', async () => {
  const { checkAuthorization } = require('../../worker/src/worker'); const changes=[];
  const repo = { updateAccount:async (_,patch)=>changes.push(patch), updateSourceAuth:async ()=>{} };
  const connector = { installationHealth:async ()=>({ configured:true, installed:true }), accountHealth:async ()=>({ authorized:true }) };
  const gate = await checkAuthorization(repo,source,connector,{ account, credentialContext:{ load:()=>{ throw Error('must not load Graph credential'); } } }); assert.equal(gate.authorized,true);
  connector.accountHealth=async ()=>({ authorized:false, reason:'MANUAL_VERIFICATION_REQUIRED' });
  assert.equal((await checkAuthorization(repo,source,connector,{ account })).authorized,false); assert.equal(changes.at(-1).authStatus,'manual_verification'); assert.ok(changes.at(-1).authStatus.length<=20);
});

test('verification DNS maps only the fixed hostname at browser startup, with no TLS bypass', async () => {
  let launch;
  const automation = new FacebookBrowserAutomation({ verificationDnsServers:['1.1.1.1'], resolveVerificationHost:async servers => { assert.deepEqual(servers,['1.1.1.1']); return ['157.240.13.14']; }, playwright:{ chromium:{ launch:async options => { launch=options; return {}; } } } });
  await automation.getBrowser();
  assert.deepEqual(launch.args,['--host-resolver-rules=MAP www.fbsbx.com 157.240.13.14']);
  assert.equal('ignoreHTTPSErrors' in launch,false);
  const bad = new FacebookBrowserAutomation({ verificationDnsServers:['1.1.1.1'], resolveVerificationHost:async () => ['127.0.0.1'] });
  await assert.rejects(bad.getBrowser(), { code:'FACEBOOK_VERIFICATION_DNS_FAILED' });
});

test('verification resources allow only reCAPTCHA paths and prohibit Google top-level navigation', async () => {
  let routeHandler; const mainFrame={}; const page={ mainFrame:()=>mainFrame, setDefaultTimeout(){}, setDefaultNavigationTimeout(){} };
  const context={ route:async (_,handler)=>{routeHandler=handler;}, newPage:async ()=>page };
  const automation=new FacebookBrowserAutomation({ playwright:{ chromium:{ launch:async ()=>({ newContext:async ()=>context }) } } });
  await automation.session('fixture');
  for(const [url,navigation,frame,expected] of [['https://www.google.com/recaptcha/enterprise.js',false,mainFrame,'continue'],['https://www.google.com/recaptcha/enterprise/anchor',true,{},'continue'],['https://www.google.com/recaptcha/enterprise/anchor',true,mainFrame,'abort'],['https://www.google.com/search?q=x',false,{},'abort'],['https://evil.test/recaptcha/api.js',false,{},'abort']]) {
    let outcome; await routeHandler({ request:()=>({url:()=>url,isNavigationRequest:()=>navigation,frame:()=>frame}),abort:()=>{outcome='abort';},continue:()=>{outcome='continue';} }); assert.equal(outcome,expected,url);
  }
});
