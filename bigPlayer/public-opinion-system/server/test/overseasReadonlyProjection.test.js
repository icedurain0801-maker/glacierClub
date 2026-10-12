'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { safeSource, safeUrl, canonical } = require('../../scripts/overseas-d1-d2-d7-readonly');
const baseUrl = 'https://club-en.q1.com/?env=web&gameId=2177&gameVersion=2177-US-ZS&lang=en-US&languageId=2';
const row = (version = 1, url = baseUrl) => ({ id: 'fixture-source', game_id: 'fixture-game', community_id: 'fixture-community', default_account_id: 'fixture-account', schedule_version: version, config: JSON.stringify({ baseUrl: url, boardId: '100017', siteUrls: [{ siteId: 'fixture-site', url, enabled: true, authStatus: 'unknown' }] }) });
test('schedule-only version change changes config digest', () => {
  assert.notEqual(safeSource(row(1)).configProjectionSha256, safeSource(row(2)).configProjectionSha256);
  const output = safeSource(row());
  assert.deepEqual(output.bindingFields, Object.keys(output.configProjection).sort());
  assert.equal(output.configProjectionSha256, require('node:crypto').createHash('sha256').update(canonical(output.configProjection)).digest('hex'));
});
test('secret and unknown URL values cannot affect output or digest', () => {
  const first = safeSource(row(1, `${baseUrl}&token=secret-one&unknown=hidden-one`));
  const second = safeSource(row(1, `${baseUrl}&token=secret-two&unknown=hidden-two`));
  assert.deepEqual(first, second);
  assert.deepEqual(first, safeSource(row()));
  assert.ok(!JSON.stringify(first).includes('secret-one'));
});
test('public parameter change changes digest; parameter order does not', () => {
  assert.notEqual(safeSource(row()).configProjectionSha256, safeSource(row(1, baseUrl.replace('languageId=2', 'languageId=9'))).configProjectionSha256);
  const reverse = new URL(baseUrl); reverse.search = [...reverse.searchParams].reverse().map(([key, value]) => `${key}=${value}`).join('&');
  assert.deepEqual(safeUrl(baseUrl), safeUrl(reverse.toString()));
});
test('invalid URL, userinfo, fragment and duplicate parameters have no raw digest', () => {
  for (const url of ['secret-one', 'secret-two', 'https://user:password@club-en.q1.com/', `${baseUrl}#secret`, `${baseUrl}&languageId=9`]) assert.deepEqual(safeUrl(url), { invalid: true });
});
