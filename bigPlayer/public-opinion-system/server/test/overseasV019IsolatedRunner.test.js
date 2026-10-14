'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { run, constants, safeRequest } = require('../../scripts/overseas-v019-isolated-runner');
const source = { id: 'SRC-A', boardId: '100017', sites: [2, 9, 16].map(languageId => ({ languageId, origin: 'https://club-en.q1.com', gameId: '2177', gameVersion: '2177-US-ZS', lang: 'en-US', authStatus: 'authorized' })) };
const account = { sourceId: 'SRC-A' };
test('bounded three-site execution is serial, exactly 24 requests, no secret or raw ids in log', async () => {
  const result = await run({ mode: 'isolated', source, account, token: 'root-secret' });
  assert.equal(result.report.status, 'ISOLATED_SYNTHETIC_PASS');
  assert.equal(result.report.exchangeCount, 3);
  assert.equal(result.report.requests.length, constants.MAX_TOTAL);
  assert.ok(result.redactedLog.every(row => !JSON.stringify(row).includes('root-secret')));
  assert.ok(result.redactedLog.every(row => !JSON.stringify(row).includes('post-')));
  assert.deepEqual(result.report.sites.map(site => site.requestCount), [8, 8, 8]);
});
test('unknown auth allows only controlled probe and blocks feeds', async () => {
  const result = await run({ mode: 'isolated', source: { ...source, allowAuthProbe: true, sites: source.sites.map(site => ({ ...site, authStatus: 'unknown' })) }, account, token: 'x' });
  assert.equal(result.report.status, 'ISOLATED_SYNTHETIC_PASS');
  assert.ok(result.report.sites.every(site => site.status === 'AUTH_PROBE_ONLY'));
  assert.equal(result.report.feedCount, 0);
  await assert.rejects(run({ mode: 'isolated', source: { ...source, sites: source.sites.map(site => ({ ...site, authStatus: 'unknown' })) }, account, token: 'x' }), { code: 'AUTH_UNKNOWN_HOLD' });
});
test('redirect stops the site and never retries', async () => {
  const result = await run({ mode: 'isolated', source, account, token: 'x', fixture: { redirect: true } });
  assert.equal(result.report.status, 'NO_GO');
  assert.equal(result.report.errorCode, 'REDIRECT_REJECTED');
});
test('hung request is bounded and does not start another site', async () => {
  const start = Date.now();
  const result = await run({ mode: 'isolated', source, account, token: 'x', requestTimeoutMs: 15, totalTimeoutMs: 50, fixture: { hang: true } });
  assert.equal(result.report.status, 'NO_GO');
  assert.ok(Date.now() - start < 500);
  assert.ok(['REQUEST_TIMEOUT', 'TOTAL_TIMEOUT'].includes(result.report.errorCode));
  assert.equal(result.report.sites.length, 0);
});
test('response json is bounded and caller cannot enlarge hard limits', async () => {
  const result = await run({ mode: 'isolated', source, account, token: 'x', requestTimeoutMs: 15, totalTimeoutMs: 999999, fixture: { jsonHang: true } });
  assert.equal(result.report.status, 'NO_GO');
  assert.equal(result.report.errorCode, 'REQUEST_TIMEOUT');
  assert.equal(result.report.requestTimeoutMs, 15);
  assert.equal(result.report.totalTimeoutMs, constants.TOTAL_TIMEOUT_MS);
});
test('caller callbacks and fixture accessors are rejected without execution', async () => {
  let called = 0;
  await assert.rejects(run({ mode: 'isolated', source, account, token: 'x', transport: () => { called++; } }), { code: 'SYNTHETIC_TRANSPORT_REQUIRED' });
  await assert.rejects(run({ mode: 'isolated', source, account, token: 'x', fixture: { json: () => { called++; } } }), { code: 'INPUT_DATA_REQUIRED' });
  await assert.rejects(run({ mode: 'isolated', source, account, token: 'x', fixture: { get hang() { called++; return true; } } }), { code: 'INPUT_ACCESSOR_REJECTED' });
  assert.equal(called, 0);
});
test('all top-level accessors are rejected before execution', async () => {
  let called = 0;
  for (const key of ['transport', 'mode', 'source', 'account', 'token', 'fixture', 'requestTimeoutMs', 'totalTimeoutMs', 'unknown']) {
    const input = { mode: 'isolated', source, account, token: 'x' };
    Object.defineProperty(input, key, { get() { called++; throw Error('must not execute'); } });
    await assert.rejects(run(input), { code: 'INPUT_ACCESSOR_REJECTED' });
  }
  assert.equal(called, 0);
});
test('nested identity accessors are rejected before execution', async () => {
  let called = 0;
  const badSource = { ...source, get boardId() { called++; return '100017'; } };
  await assert.rejects(run({ mode: 'isolated', source: badSource, account, token: 'x' }), { code: 'INPUT_ACCESSOR_REJECTED' });
  assert.equal(called, 0);
});
test('nested symbol keys and accessors are rejected without execution', async () => {
  let called = 0;
  for (const target of ['account', 'source', 'site', 'sites', 'fixture', 'nested']) {
    for (const accessor of [false, true]) {
      for (const enumerable of [false, true]) {
        const input = { mode: 'isolated', source: { ...source, sites: source.sites.map(site => ({ ...site })) }, account: { ...account }, token: 'x', fixture: {} };
        if (target === 'nested') input.account.metadata = { deeper: {} };
        const value = target === 'site' ? input.source.sites[0] : target === 'sites' ? input.source.sites : target === 'nested' ? input.account.metadata.deeper : input[target];
        Object.defineProperty(value, Symbol('hidden'), accessor
          ? { enumerable, get() { called++; throw Error('must not execute'); } }
          : { enumerable, value: 1 });
        await assert.rejects(run(input), { code: accessor ? 'INPUT_ACCESSOR_REJECTED' : 'INPUT_KEY_REJECTED' });
      }
    }
  }
  assert.equal(called, 0);
});
test('fixed caller clock cannot extend total wall clock', async () => {
  await assert.rejects(run({ mode: 'isolated', source, account, token: 'x', now: () => 0 }), { code: 'INPUT_KEY_REJECTED' });
  const result = await run({ mode: 'isolated', source, account, token: 'x', totalTimeoutMs: 10, fixture: { transportDelayMs: 15 } });
  assert.equal(result.report.status, 'NO_GO');
  assert.equal(result.report.requests.length, 1);
});
test('symbol keys and inherited input fields are rejected', async () => {
  await assert.rejects(run({ mode: 'isolated', source, account, token: 'x', [Symbol('extra')]: 1 }), { code: 'INPUT_KEY_REJECTED' });
  await assert.rejects(run(Object.create({ mode: 'isolated', source, account, token: 'x' })), { code: 'INPUT_DATA_REQUIRED' });
});
test('transport and JSON share one absolute request deadline', async () => {
  const start = performance.now();
  const result = await run({ mode: 'isolated', source, account, token: 'x', requestTimeoutMs: 40, fixture: { transportDelayMs: 25, jsonDelayMs: 25 } });
  assert.equal(result.report.status, 'NO_GO');
  assert.equal(result.report.requests.length, 1);
  assert.ok(performance.now() - start < 75);
});
test('disabled and unauthorized sites are rejected before probes', async () => {
  for (const change of [{ enabled: false }, { authStatus: 'unauthorized' }]) await assert.rejects(run({ mode: 'isolated', source: { ...source, sites: source.sites.map(site => ({ ...site, ...change })) }, account, token: 'x' }), { code: 'AUTH_STATE_REJECTED' });
});
test('comment path and query allowlist are exact', () => {
  assert.equal(safeRequest('https://club-en.q1.com/api/club/v1/auth/comment/1579706?postId=1579706&offsetId=0&pageSize=1&sortType=0').path, '/api/club/v1/auth/comment/[ID]');
  assert.throws(() => safeRequest('https://club-en.q1.com/api/club/v1/auth/comment/1579706/replies?postId=1579706'), { code: 'REQUEST_SCOPE_REJECTED' });
  assert.throws(() => safeRequest('https://club-en.q1.com/api/club/v1/auth/post/list?boardId=100017&unknown=x'), { code: 'REQUEST_SCOPE_REJECTED' });
});
