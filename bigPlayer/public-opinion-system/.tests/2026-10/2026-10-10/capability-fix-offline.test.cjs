'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), vm = require('node:vm');
const { EventEmitter } = require('node:events');
const root = path.resolve(__dirname, '../../../../../.temp/capability-timeout-fix-20261010/api-release/server/src');
const { BigPlayerH5Connector } = require(path.join(root, 'connectors/bigPlayerH5Connector'));
const source = { id: 's1', platform: 'bigplayer_h5', config: { baseUrl: 'https://club.q1.com/?env=web&gameId=g1&gameVersion=1', boardId: '9' } };
const account = { id: 'a1' };
function fixture({ empty = false, failLogin = false, expireOnce = false } = {}) {
  let logins = 0; const requests = [];
  const c = new BigPlayerH5Connector({}, {
    credentialContext: { load: async () => ({ secretObject: { account: 'synthetic', password: 'synthetic-only' } }) },
    loginSessionClient: { startLogin: async () => { logins++; if (failLogin) { const e = new Error('redacted'); e.code = 'INVALID_CREDENTIALS'; throw e; } return { status: 'active' }; }, claimAuthResult: async () => ({ apiToken: 'synthetic-token-' + logins }) },
    fetchImpl: async (url, options) => {
      const p = new URL(String(url)).pathname; requests.push({ path: p, auth: options.headers.authorization });
      if (expireOnce && requests.length === 1) return { ok: false, status: 401, url: String(url) };
      let data;
      if (p.endsWith('/user/context')) data = { boards: [{ id: 9 }] };
      else if (p.endsWith('/auth/board')) data = { groups: [{ id: 1, type: 0, sections: [{ id: 101, name: '合成栏目' }] }] };
      else if (p.includes('/comment/')) data = [];
      else if (p.endsWith('/auth/post/')) data = { id: 7, content: 'synthetic body' };
      else data = { items: empty ? [] : [{ id: 7, content: 'synthetic body', createdAt: '2026-10-10T00:00:00Z' }], total: empty ? 0 : 1, hasMore: false };
      return { ok: true, status: 200, url: String(url), json: async () => ({ code: 0, data, ...(p.includes('/comment/') ? { total: 0 } : {}) }) };
    }
  });
  let refreshes = 0;
  c.authRefreshCoordinator = { refresh: async () => { refreshes++; } };
  return { c, requests, logins: () => logins, refreshes: () => refreshes };
}
test('401 refresh replaces the probe token and later requests retain the replacement', async () => {
  const f = fixture({ expireOnce: true }); const result = await f.c.detectCapabilities({ source, account });
  assert.equal(result.posts.status, 'available'); assert.equal(result.comments.status, 'available');
  assert.equal(f.logins(), 2); assert.equal(f.refreshes(), 1);
  assert(f.requests[0].auth.includes('synthetic-token-1'));
  assert(f.requests.slice(1).every(r => r.auth.includes('synthetic-token-2')));
});
test('real Q1 probe logs in once, fetches one post page and probes comments on its sample', async () => {
  const f = fixture(); const result = await f.c.detectCapabilities({ source, account });
  assert.equal(result.posts.status, 'available'); assert.equal(result.comments.status, 'available');
  assert.equal(f.logins(), 1); assert.equal(f.requests.filter(r => r.path.endsWith('/merged-list')).length, 1);
  assert(f.requests.some(r => r.path.includes('/comment/7'))); assert.equal(new Set(f.requests.map(r => r.auth)).size, 1);
});
test('empty post list does not falsely authorize untested comments', async () => {
  const f = fixture({ empty: true }); const result = await f.c.detectCapabilities({ source, account });
  assert.equal(result.posts.status, 'available'); assert.equal(result.comments.status, 'configured'); assert.equal(result.comments.untested, true);
  assert.equal(f.logins(), 1); assert(!f.requests.some(r => r.path.includes('/comment/')));
});
test('a failed login is not retried for the sample; safe cause is preserved', async () => {
  const f = fixture({ failLogin: true }); const result = await f.c.detectCapabilities({ source, account });
  assert.equal(f.logins(), 1); assert.equal(result.posts.errorCode, 'INVALID_CREDENTIALS'); assert.notEqual(result.posts.status, 'available');
  assert.equal(f.requests.length, 0);
});
test('sequential and concurrent probes never share a token cache', async () => {
  const f = fixture(); await f.c.detectCapabilities({ source, account }); await f.c.detectCapabilities({ source, account });
  assert.equal(f.logins(), 2);
  await Promise.all([f.c.detectCapabilities({ source, account }), f.c.detectCapabilities({ source: { ...source, id: 's2' }, account: { id: 'a2' } })]);
  assert.equal(f.logins(), 4);
  await f.c.loadApiToken(source, f.c.credentialContext, account); assert.equal(f.logins(), 5);
});
require(path.join(root, 'runtimeEnv')).loadRuntimeEnv = () => false;
const app = require(path.join(root, 'app'));
app.repo.listSources = async () => [source]; app.repo.listAccounts = async () => [account];
app.repo.listSourceCapabilities = async () => []; app.repo.getSyncStatus = async () => [];
app.repo.getAccountCredentialSummary = async () => [{ credential_type: 'account_password', has_secret_cipher: true }];
let healthCalls = 0, detectedCalls = 0; const stored = [];
app.repo.upsertSourceCapability = async (_id, scope, value) => stored.push({ scope, ...value });
app.connectors.bigplayer_h5.accountHealth = async () => { healthCalls++; throw Error('Duplicate health probe'); };
app.connectors.bigplayer_h5.installationHealth = async () => ({ installed: true });
app.connectors.bigplayer_h5.hasSourceCapability = () => true;
app.connectors.bigplayer_h5.detectCapabilities = async () => { detectedCalls++; return { posts: { status: 'available' }, comments: { status: 'configured', untested: true } }; };
test('actual API route runs one detector and never calls duplicate accountHealth', async () => {
  let status, body;
  const req = { method: 'POST', url: '/api/public-opinion/sources/s1/check-capabilities', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  await app.handler(req, { writeHead(s) { status = s; }, end(b) { body = JSON.parse(b); } });
  assert.equal(status, 200); assert.equal(healthCalls, 0); assert.equal(detectedCalls, 1); assert.equal(body.data.authorized, true);
  assert.equal(body.data.capabilities.posts, 'authorized_scope'); assert.equal(body.data.capabilities.comments, 'configured'); assert.equal(stored.length, 2);
});
function proxyFixture() {
  let handler, proxy; const file = path.resolve(__dirname, '../../../../../.temp/capability-timeout-fix-20261010/frontend-release/frontend3001-server.js');
  const fakeHttp = { createServer(fn) { handler = fn; return { listen() {}, close(fn) { fn(); } }; }, request() { proxy = new EventEmitter(); proxy.destroy = error => proxy.emit('error', error); return proxy; } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require: name => name === 'node:http' ? fakeHttp : name === 'node:fs' ? { lstatSync: () => ({ isFile: () => true, isSymbolicLink: () => false }), readFileSync: () => JSON.stringify({ listenPort: 3001, upstreamOrigin: 'http://127.0.0.1:4320' }) } : require(name), process: { env: { FRONTEND3001_CONFIG_FILE: 'C:/fixture/config.json' }, stdout: { write() {} }, once() {} }, __dirname: path.dirname(file), URL, setTimeout: () => ({ unref() {} }) });
  const req = new EventEmitter(); req.method = 'POST'; req.url = '/api/public-opinion/sources/s1/check-capabilities'; req.headers = {}; req.pipe = () => {};
  const result = {}; const res = { headersSent: false, writeHead(status, headers) { this.headersSent = true; result.status = status; result.headers = headers; }, end(body) { result.body = JSON.parse(body); }, destroy() { result.destroyed = true; } };
  handler(req, res); return { proxy, result, res };
}
test('proxy timeout returns structured JSON 504 without sleeping or sockets', () => {
  const f = proxyFixture(); f.proxy.emit('timeout'); assert.equal(f.result.status, 504); assert.equal(f.result.body.error.code, 'UPSTREAM_TIMEOUT'); assert(f.result.headers['content-type'].includes('application/json'));
});
test('proxy connection failure returns JSON 502 and never appends JSON to a started response', () => {
  const f = proxyFixture(); f.proxy.emit('error', Error('offline')); assert.equal(f.result.status, 502); assert.equal(f.result.body.error.code, 'UPSTREAM_UNAVAILABLE');
  const partial = proxyFixture(); partial.res.headersSent = true; partial.proxy.emit('error', Error('offline')); assert.equal(partial.result.destroyed, true); assert.equal(partial.result.body, undefined);
});
