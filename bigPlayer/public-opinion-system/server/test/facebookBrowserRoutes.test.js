'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

test('browser source routes enforce community permissions, create credentials and login without legacy Graph gates', async () => {
  const app = require('../src/app'); const undo = [];
  const stub = (object, key, value) => { const previous = object[key]; undo.push(() => { object[key] = previous; }); object[key] = value; };
  const previousKey = process.env.CREDENTIAL_ENC_KEY; process.env.CREDENTIAL_ENC_KEY = 'ab'.repeat(32);
  const sources = []; const accounts = [];
  let identity = { id:'fixture-admin', roles:['admin'], permissions:{ read:true, manage:true }, scoped:true, navigation:['sources'], communityIds:['test-titan'] };
  stub(app.baasAccess, 'enabled', true); stub(app.baasAccess, 'authorize', async () => identity);
  stub(app.repo, 'listSources', async () => sources); stub(app.repo, 'listAccounts', async ({ sourceId }) => accounts.filter(account => account.source_id === sourceId));
  stub(app.repo, 'getAccount', async id => accounts.find(account => account.id === id));
  stub(app.repo, 'resolveCommunityCanonical', async input => ({ regionCode:'overseas', communityId:input.communityId, gameId:'test-game' }));
  stub(app.communityDirectory, 'requireEnabled', async () => ({ status:'enabled' }));
  stub(app.repo, 'getAccountCredentialSummary', async () => [{ credential_type:'account_password', has_secret_cipher:1 }]);
  stub(app.repo, 'createSourceWithAccount', async input => {
    assert.equal(input.secretCipher.includes('fixture-password'),false);
    const source = { id:input.sourceId, default_account_id:input.accountId, game_id:input.gameId, community_id:input.communityId, region_code:'overseas', platform:'facebook', enabled:0, config:{ collectionMode:input.collectionMode, baseUrl:input.baseUrl } };
    const account = { id:input.accountId, source_id:input.sourceId, game_id:input.gameId, community_id:input.communityId, platform:'facebook', enabled:1, auth_status:input.authStatus };
    sources.push(source); accounts.push(account); return { source, account };
  });
  stub(app.repo, 'updateAccount', async (id, patch) => { const account = accounts.find(row => row.id === id); account.auth_status=patch.authStatus; return account; });
  stub(app.repo, 'updateSourceAuth', async (id, patch) => { sources.find(row => row.id === id).auth_status=patch.authStatus; });
  stub(app.loginSessionClient, 'bindAccount', async input => { assert.equal(input.accountId, accounts[0].id); });
  stub(app.loginSessionClient, 'startLogin', async () => ({ status:'active' }));
  stub(app.loginSessionClient, 'getStatus', async () => ({ status:'active' }));
  stub(app.loginSessionClient, 'configured', () => true);
  stub(app.connectors.facebook, 'loginClient', app.loginSessionClient);
  const capabilities = [];
  stub(app.repo, 'upsertSourceCapability', async (id, scope, value) => { capabilities.push({ scope, value }); });
  try {
    app.server.listen(0,'127.0.0.1'); await once(app.server,'listening');
    const base = `http://127.0.0.1:${app.server.address().port}/api/public-opinion`;
    const request = (path, method='GET', body) => fetch(base+path, { method, headers:{ 'content-type':'application/json' }, ...(body ? { body:JSON.stringify(body) } : {}) });
    const payload = { platform:'facebook', collectionMode:'browser', communityId:'test-titan', displayName:'Titan Facebook', baseUrl:'https://www.facebook.com/ExampleGame', account:'fixture', password:'fixture-password' };
    const denied = await request('/sources','POST',{ ...payload, communityId:'other-community' }); assert.equal(denied.status,403); assert.equal(sources.length,0);
    const response = await request('/sources','POST',payload); const created = await response.json(); assert.equal(response.status,201,JSON.stringify(created)); assert.equal(created.data.community_id,'test-titan'); assert.equal(JSON.stringify(created).includes('fixture-password'),false);
    const id = created.data.id;
    const login = await request(`/sources/${id}/browser/login`,'POST',{}); assert.equal(login.status,200); assert.equal((await login.json()).data.status,'active'); assert.equal(accounts[0].auth_status,'authorized');
    const detected = await request(`/sources/${id}/check-capabilities`,'POST',{}); const detail = await detected.json(); assert.equal(detected.status,200,JSON.stringify(detail)); assert.equal(detail.data.authorized,true); assert.deepEqual(capabilities.map(row=>row.scope),['posts','comments','replies']); assert.equal(capabilities.every(row=>row.value.status==='authorized_scope'),true);
    identity = { ...identity, permissions:{ read:true, manage:false } };
    assert.equal((await request(`/sources/${id}/browser`)).status,403);
    assert.equal((await request('/sources','POST',payload)).status,403);
  } finally {
    await new Promise(resolve => app.server.close(resolve)); while(undo.length) undo.pop()();
    if (previousKey === undefined) delete process.env.CREDENTIAL_ENC_KEY; else process.env.CREDENTIAL_ENC_KEY=previousKey;
    await app.repo.pool.end();
  }
});
