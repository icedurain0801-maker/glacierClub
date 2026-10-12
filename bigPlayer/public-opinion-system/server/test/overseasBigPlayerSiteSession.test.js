'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createOverseasBigPlayerSiteSession } = require('../src/connectors/overseasBigPlayerSiteSession');
function source(languageId = '2') {
  const url = `https://club-en.q1.com/?env=web&gameId=4000&gameVersion=4000-US-ZS&lang=en-US&languageId=${languageId}`;
  return { id: 'source', platform: 'bigplayer_h5', region_code: 'overseas', game_id: 'game', community_id: 'community',
    account: { id: 'account', source_id: 'source', platform: 'bigplayer_h5', game_id: 'game', community_id: 'community' },
    siteId: `site-${languageId}`, siteUrl: url, config: { baseUrl: url, boardId: '9000', overseasTokenKind: 'sdk' } };
}
const response = (url, token = 'site-token') => ({ ok: true, url: String(url), json: async () => ({ code: 0, data: { token } }) });
test('community api token verifies the authorized board with Bearer and never exchanges login token', async () => {
  const calls = [], evidence = [];
  const s = source(); delete s.config.overseasTokenKind;
  s.__recordHttpRequest = async e => evidence.push(e);
  const session = createOverseasBigPlayerSiteSession({ transport: async (url, options) => {
    calls.push({ url: String(url), authorization: options.headers.authorization });
    return { ok: true, url: String(url), json: async () => ({ code: 0, data: { boards: [{ id: 9000 }] } }) };
  } });
  assert.equal(await session.tokenFor(s, 'community-secret'), 'Bearer community-secret');
  assert.equal(await session.tokenFor(s, 'community-secret'), 'Bearer community-secret');
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, '/api/club/v1/auth/user/context');
  assert.equal(calls[0].authorization, 'Bearer community-secret');
  assert.ok(!JSON.stringify(evidence).includes('community-secret'));
  assert.equal(await session.tokenFor(s, 'Bearer community-secret'), 'Bearer community-secret');
  assert.equal(calls.length, 2);
});
test('community token cannot authorize a missing board, tourist response or rejected credential', async () => {
  const s = source(); delete s.config.overseasTokenKind;
  for (const [payload, code] of [[{ code: 0, data: { boards: [{ id: 1 }] } }, 'BOARD_NOT_ACCESSIBLE'],
    [{ code: 1 }, 'Q1_TOURIST_LOGIN'], [{ code: 0, data: {} }, 'MALFORMED_RESPONSE']]) {
    let calls = 0;
    const session = createOverseasBigPlayerSiteSession({ transport: async url => { calls++; return { ok: true, url: String(url), json: async () => payload }; } });
    await assert.rejects(session.tokenFor(s, 'a'), e => e.code === code);
    await assert.rejects(session.tokenFor(s, 'a'), e => e.code === code);
    assert.equal(calls, 2);
  }
});
test('N arbitrary sites exchange context, deduplicate cache, and redact request evidence', async () => {
  const calls = [], evidence = [];
  const session = createOverseasBigPlayerSiteSession({ transport: async (url, options) => { calls.push([new URL(url), options]); return response(url, url.searchParams.get('languageId')); } });
  for (const id of ['2', '9', '22', '35']) {
    const s = { ...source(id), __recordHttpRequest: async e => evidence.push(e) };
    assert.equal(await session.tokenFor(s, 'fixture-secret'), id);
    assert.equal(await session.tokenFor(s, 'fixture-secret'), id);
  }
  assert.equal(calls.length, 4); assert.ok(!JSON.stringify(evidence).includes('fixture-secret'));
  for (const [url, options] of calls) { assert.equal(url.origin, 'https://club-en.q1.com'); assert.equal(url.pathname, '/api/club/v1/login/token'); assert.equal(url.searchParams.get('gameId'), '4000'); assert.equal(options.redirect, 'manual'); }
  session.invalidate(source(), 'fixture-secret'); await session.tokenFor(source(), 'fixture-secret'); assert.equal(calls.length, 5);
});
test('account, board, source and base token isolate cache', async () => {
  let calls = 0; const session = createOverseasBigPlayerSiteSession({ transport: async url => { calls++; return response(url); } });
  const s = source(); await session.tokenFor(s, 'a');
  await session.tokenFor({ ...s, account: { ...s.account, id: 'other' } }, 'a');
  await session.tokenFor({ ...s, config: { ...s.config, boardId: '9001' } }, 'a');
  await session.tokenFor({ ...s, id: 'other', account: { ...s.account, source_id: 'other' } }, 'a');
  await session.tokenFor(s, 'b'); assert.equal(calls, 5);
});
test('scope and snapshot fail before network; rejected exchange evicts cache without retry', async () => {
  let calls = 0; const session = createOverseasBigPlayerSiteSession({ transport: async url => { calls++; return { ...response(url), ok: false, status: 401 }; } });
  for (const s of [{ ...source(), region_code: 'domestic' }, { ...source(), siteUrl: source('9').siteUrl }, { ...source(), account: { ...source().account, source_id: 'other' } }]) await assert.rejects(session.tokenFor(s, 'a'));
  assert.equal(calls, 0);
  await assert.rejects(session.tokenFor(source(), 'a'), e => e.code === 'UNAUTHORIZED');
  await assert.rejects(session.tokenFor(source(), 'a'), e => e.code === 'UNAUTHORIZED'); assert.equal(calls, 2);
});
test('cross-region redirect and pre-abort are rejected', async () => {
  const session = createOverseasBigPlayerSiteSession({ transport: async () => response('https://club.q1.com/') });
  await assert.rejects(session.tokenFor(source(), 'a'), e => e.code === 'H5_REDIRECT_OUTSIDE_ALLOWED_HOSTS');
  await assert.rejects(session.tokenFor(source(), 'a', AbortSignal.abort()), e => e.code === 'COLLECTION_CANCELLED');
});
