'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { SOURCE_ID, BOARD_ID } = require('../src/lastNightOverseasDailyJob');
const { LastNightIsolatedReadModel, IDENTITY_SQL, CONTENTS_SQL, ANALYSIS_SQL } =
  require('../src/lastNightIsolatedReadModel');

const id = '00000000-0000-0000-0000-000000000001';
const sites = ['site-a', 'site-b', 'site-c'];
const identity = { host: '127.0.0.1', port: 43319, serverId: 43319,
  datadir: path.resolve('C:/isolated/lastnight'), database: 'ln_last_night',
  version: '10.4.14-MariaDB', user: 'po_lastnight_reader_fixture@127.0.0.1' };
const grants = [
  "GRANT USAGE ON *.* TO 'po_lastnight_reader_fixture'@'127.0.0.1'",
  ...['ln_contents', 'ln_analysis_results'].map(table =>
    `GRANT SELECT ON \`ln_last_night\`.\`${table}\` TO 'po_lastnight_reader_fixture'@'127.0.0.1'`)
].map(grant => ({ grant }));

function fixture({ actualIdentity = identity, actualGrants = grants,
  contents = [], analysis = [], rejectUtc = false } = {}) {
  const calls = [];
  let releases = 0;
  const conn = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql === IDENTITY_SQL) return [[{ port: actualIdentity.port,
      serverId: actualIdentity.serverId, datadir: actualIdentity.datadir,
      version: actualIdentity.version, db: actualIdentity.database,
      dbUser: actualIdentity.user }]];
    if (sql === 'SHOW GRANTS') return [actualGrants];
    if (sql === "SET SESSION time_zone='+00:00'") {
      if (rejectUtc) throw new Error('UTC_SESSION_UNAVAILABLE');
      return [[]];
    }
    if (sql === CONTENTS_SQL) return [contents.filter(row =>
      params[5] == null || row.id < params[8]).slice(0, params[9])];
    if (sql === ANALYSIS_SQL) return [analysis];
    throw new Error(`UNEXPECTED_SQL: ${sql}`);
  }, release() { releases += 1; } };
  return { calls, get releases() { return releases; },
    model: new LastNightIsolatedReadModel({ pool: { async getConnection() { return conn; } },
      identity, siteIds: sites }) };
}

test('bounded list returns keyset cursor and binds fixed source, board and site', async () => {
  const publishedAt = '2026-10-08T01:00:00.000000Z';
  const ids = [3, 2, 1].map(n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`);
  const f = fixture({ contents: ids.map(id => ({ id, published_at: publishedAt })) });
  const result = await f.model.listContents({ siteId: sites[0],
    publishedFrom: '2026-10-08T00:00:00Z', publishedTo: '2026-10-09T00:00:00Z', limit: 2 });
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.nextCursor, { publishedAt, id: ids[1] });
  const second = await f.model.listContents({ siteId: sites[0],
    publishedFrom: '2026-10-08T00:00:00Z', publishedTo: '2026-10-09T00:00:00Z',
    limit: 2, cursor: result.nextCursor });
  assert.deepEqual([...result.items, ...second.items].map(row => row.id), ids);
  assert.equal(second.nextCursor, null);
  const params = f.calls.find(call => call.sql === CONTENTS_SQL).params;
  assert.deepEqual(params.slice(0, 3), [SOURCE_ID, BOARD_ID, sites[0]]);
  assert.equal(params.at(-1), 3);
  assert.deepEqual(f.calls.slice(0, 3).map(call => call.sql),
    [IDENTITY_SQL, 'SHOW GRANTS', "SET SESSION time_zone='+00:00'"]);
  assert.equal(f.releases, 2);
});

test('analysis joins current fingerprint and projects only allowed fields', async () => {
  const f = fixture({ analysis: [{ profile: 'light', version: 'v1',
    result_json: JSON.stringify({ sentiment: 'neutral', summary: 'ok',
      providerRaw: 'must-not-leak', topics: ['one'] }) }] });
  const result = await f.model.getAnalysis(id, sites[0]);
  assert.deepEqual(result.result, { sentiment: 'neutral', summary: 'ok', topics: ['one'] });
  assert.equal('result_json' in result, false);
  assert.deepEqual(f.calls.find(call => call.sql === ANALYSIS_SQL).params,
    [id, 'light', SOURCE_ID, BOARD_ID, sites[0]]);
  assert.match(ANALYSIS_SQL, /c\.fingerprint=r\.content_fingerprint/);
  assert.equal(f.releases, 1);
});

test('offset window is converted to UTC before the half-open SQL query', async () => {
  const f = fixture();
  await f.model.listContents({ siteId: sites[0],
    publishedFrom: '2026-10-08T08:00:00+08:00',
    publishedTo: '2026-10-08T09:00:00+08:00' });
  const params = f.calls.find(call => call.sql === CONTENTS_SQL).params;
  assert.deepEqual(params.slice(3, 5), ['2026-10-08 00:00:00.000',
    '2026-10-08 01:00:00.000']);
  assert.ok(f.calls.findIndex(call => call.sql === "SET SESSION time_zone='+00:00'") <
    f.calls.findIndex(call => call.sql === CONTENTS_SQL));
});

test('identity drift, excessive grants and unauthorized sites stop before content reads', async () => {
  for (const [options, code] of [
    [{ actualIdentity: { ...identity, port: 3306 } }, 'LAST_NIGHT_READ_MODEL_IDENTITY_MISMATCH'],
    [{ actualGrants: [...grants, { grant: "GRANT UPDATE ON *.* TO 'po_lastnight_reader_fixture'@'127.0.0.1'" }] },
      'LAST_NIGHT_READ_MODEL_GRANTS_UNSAFE']
  ]) {
    const f = fixture(options);
    await assert.rejects(f.model.listContents({ siteId: sites[0],
      publishedFrom: '2026-10-08T00:00:00Z', publishedTo: '2026-10-09T00:00:00Z' }), { code });
    assert.equal(f.calls.some(call => call.sql === CONTENTS_SQL), false);
  }
  const f = fixture();
  await assert.rejects(f.model.getAnalysis(id, 'other-site'),
    { code: 'LAST_NIGHT_READ_MODEL_QUERY_INVALID' });
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.model.listContents({ siteId: sites[0],
    publishedFrom: '2026-10-08 00:00:00', publishedTo: '2026-10-09T00:00:00Z' }),
  { code: 'LAST_NIGHT_READ_MODEL_QUERY_INVALID' });
  assert.equal(f.calls.length, 0);
  const utc = fixture({ rejectUtc: true });
  await assert.rejects(utc.model.getAnalysis(id, sites[0]), /UTC_SESSION_UNAVAILABLE/);
  assert.equal(utc.calls.some(call => call.sql === ANALYSIS_SQL), false);
  assert.equal(utc.releases, 1);
});
