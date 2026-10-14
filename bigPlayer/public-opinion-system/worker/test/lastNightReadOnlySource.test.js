'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID } = require('../src/lastNightOverseasDailyJob');
const { LastNightReadOnlySource, TABLE_COLUMNS, IDENTITY_SQL, COLUMNS_SQL,
  SOURCE_SQL, ACCOUNT_SQL, SITES_SQL, CREDENTIALS_SQL } = require('../src/lastNightReadOnlySource');

const accountId = '00000000-0000-0000-0000-000000000001';
const datadir = path.resolve('C:/xampp/mysql/data');
const user = 'po_lastnight_reader@127.0.0.1';
const expectedIdentity = { host: '127.0.0.1', port: 3306, database: 'public_opinion',
  hostname: 'LIUFUYI-2-48', serverId: 1, version: '10.4.14-MariaDB', user,
  datadirSha256: crypto.createHash('sha256').update(datadir.replace(/\\/g, '/').toLowerCase()).digest('hex') };
const identity = { hostname: expectedIdentity.hostname, port: 3306, serverId: 1,
  datadir, version: expectedIdentity.version, db: 'public_opinion', dbUser: user };
const grants = ["GRANT USAGE ON *.* TO `po_lastnight_reader`@`127.0.0.1` IDENTIFIED BY PASSWORD '*ABCD1234'",
  ...Object.keys(TABLE_COLUMNS).map(table => `GRANT SELECT ON \`public_opinion\`.\`${table}\` TO \`po_lastnight_reader\`@\`127.0.0.1\``)]
  .map((grant, index) => ({ [`Grant ${index}`]: grant }));
const columns = Object.entries(TABLE_COLUMNS).flatMap(([table_name, names]) =>
  names.map(column_name => ({ table_name, column_name })));
const source = { id: SOURCE_ID, game_id: GAME_ID, community_id: COMMUNITY_ID,
  platform: 'bigplayer_h5', enabled: 1, config: JSON.stringify({ boardId: BOARD_ID }),
  region_code: 'overseas', community_status: 'enabled' };
const account = { id: accountId, source_id: SOURCE_ID, platform: 'bigplayer_h5', enabled: 1 };

function fixture({ overrideIdentity = identity, overrideGrants = grants,
  overrideColumns = columns } = {}) {
  const calls = [];
  let releases = 0;
  const connection = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql === IDENTITY_SQL) return [[overrideIdentity]];
    if (sql === 'SHOW GRANTS') return [overrideGrants];
    if (sql === COLUMNS_SQL) return [overrideColumns];
    if (sql === SOURCE_SQL) return [[source]];
    if (sql === ACCOUNT_SQL) return [[account]];
    if (sql === SITES_SQL) return [[{ site_id: 'legacy', url: 'https://club-en.q1.com/', enabled: 1 }]];
    if (sql === CREDENTIALS_SQL) return [[{ id: 'credential-1', source_id: SOURCE_ID,
      account_id: accountId, credential_type: 'api_token', status: 'active',
      secret_cipher: 'encrypted' }]];
    if (sql === 'START TRANSACTION READ ONLY' || sql === 'ROLLBACK') return [[]];
    throw new Error(`UNEXPECTED_SQL: ${sql}`);
  }, release() { releases += 1; } };
  return { pool: { async getConnection() { return connection; } }, calls,
    get releases() { return releases; } };
}

test('fixed source reader validates identity, grants and schema before bounded SELECTs', async () => {
  const f = fixture();
  const reader = new LastNightReadOnlySource({ pool: f.pool, expectedIdentity, accountId });
  const snapshot = await reader.loadSnapshot();
  assert.equal(snapshot.source.id, SOURCE_ID);
  assert.equal(snapshot.account.id, accountId);
  assert.equal(snapshot.credentials.length, 1);
  assert.deepEqual(f.calls.map(call => call.sql), [IDENTITY_SQL, 'SHOW GRANTS', COLUMNS_SQL,
    'START TRANSACTION READ ONLY', SOURCE_SQL, ACCOUNT_SQL, SITES_SQL,
    CREDENTIALS_SQL, 'ROLLBACK']);
  assert.deepEqual(f.calls.find(call => call.sql === CREDENTIALS_SQL).params, [SOURCE_ID, accountId]);
  assert.equal(f.releases, 1);
});

test('identity, grant and column drift stop before source SELECT', async () => {
  for (const [options, code, lastSql] of [
    [{ overrideIdentity: { ...identity, port: 43319 } }, 'LAST_NIGHT_READ_IDENTITY_MISMATCH', IDENTITY_SQL],
    [{ overrideGrants: [...grants, { bad: "GRANT UPDATE ON *.* TO `po_lastnight_reader`@`127.0.0.1`" }] },
      'LAST_NIGHT_READ_GRANTS_UNSAFE', 'SHOW GRANTS'],
    [{ overrideColumns: columns.filter(row => row.column_name !== 'secret_cipher') },
      'LAST_NIGHT_READ_SCHEMA_MISMATCH', COLUMNS_SQL]
  ]) {
    const f = fixture(options);
    await assert.rejects(new LastNightReadOnlySource({ pool: f.pool,
      expectedIdentity, accountId }).loadSnapshot(), { code });
    assert.equal(f.calls.at(-1).sql, lastSql);
    assert.equal(f.releases, 1);
  }
});
