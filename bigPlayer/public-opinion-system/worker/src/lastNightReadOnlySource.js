'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { SOURCE_ID, GAME_ID, COMMUNITY_ID, BOARD_ID } = require('./lastNightOverseasDailyJob');
const { boardIdOf } = require('../../shared/bigPlayerBoard');

const TABLE_COLUMNS = Object.freeze({
  po_sources: ['id', 'game_id', 'community_id', 'platform', 'enabled', 'config'],
  po_games: ['id', 'region_code'],
  po_communities: ['id', 'status'],
  po_source_sites: ['source_id', 'site_id', 'url', 'enabled'],
  po_accounts: ['id', 'source_id', 'platform', 'enabled', 'auth_status'],
  po_credentials: ['id', 'source_id', 'account_id', 'credential_type', 'status',
    'expire_at', 'secret_ref', 'secret_cipher']
});
const TABLES = Object.keys(TABLE_COLUMNS);
const IDENTITY_SQL = `SELECT @@hostname AS hostname,@@port AS port,@@server_id AS serverId,
  @@datadir AS datadir,VERSION() AS version,DATABASE() AS db,CURRENT_USER() AS dbUser`;
const COLUMNS_SQL = `SELECT table_name,column_name FROM information_schema.columns
  WHERE table_schema=? AND table_name IN (?,?,?,?,?,?)`;
const SOURCE_SQL = `SELECT s.id,s.game_id,s.community_id,s.platform,s.enabled,s.config,
  g.region_code,c.status AS community_status FROM po_sources s
  JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id
  WHERE s.id=? LIMIT 2`;
const ACCOUNT_SQL = `SELECT id,source_id,platform,enabled,auth_status FROM po_accounts
  WHERE id=? AND source_id=? LIMIT 2`;
const SITES_SQL = `SELECT site_id,url,enabled FROM po_source_sites WHERE source_id=? ORDER BY site_id LIMIT 10`;
const CREDENTIALS_SQL = `SELECT id,source_id,account_id,credential_type,status,expire_at,
  secret_ref,secret_cipher FROM po_credentials WHERE source_id=? AND account_id=?
  AND credential_type IN ('account_password','api_token') ORDER BY credential_type LIMIT 3`;

function fail(code) { const error = new Error(code); error.code = code; throw error; }
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const normalizedDir = value => path.resolve(String(value || '')).replace(/\\/g, '/').toLowerCase();

function grantsAreReadOnly(rows, user) {
  if (!Array.isArray(rows) || !rows.length) return false;
  const seen = new Set();
  for (const row of rows) {
    const grant = String(Object.values(row)[0] || '').toUpperCase();
    const match = /^GRANT (.+?) ON (.+?) TO ((?:'[^']+'@'[^']+')|(?:`[^`]+`@`[^`]+`))(.*)$/.exec(grant);
    if (!match || match[3].replace(/['`]/g, '') !== user.toUpperCase() ||
      !/^(?:| IDENTIFIED BY PASSWORD '\*[0-9A-F]+')$/.test(match[4])) return false;
    const scope = match[2].replace(/[`']/g, '');
    if (scope === '*.*' && match[1] === 'USAGE') continue;
    if (match[1] !== 'SELECT' || !scope.startsWith('PUBLIC_OPINION.')) return false;
    const table = scope.slice('PUBLIC_OPINION.'.length).toLowerCase();
    if (!TABLES.includes(table) || seen.has(table)) return false;
    seen.add(table);
  }
  return seen.size === TABLES.length;
}

function assertColumns(rows) {
  const present = new Set(rows.map(row => `${row.table_name}.${row.column_name}`));
  for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
    for (const column of columns) if (!present.has(`${table}.${column}`)) fail('LAST_NIGHT_READ_SCHEMA_MISMATCH');
  }
}

class LastNightReadOnlySource {
  constructor({ pool, expectedIdentity, accountId } = {}) {
    if (!pool?.getConnection || !expectedIdentity || expectedIdentity.host !== '127.0.0.1' ||
      expectedIdentity.port !== 3306 || expectedIdentity.database !== 'public_opinion' ||
      !expectedIdentity.hostname || !Number.isInteger(expectedIdentity.serverId) ||
      !/^[a-f0-9]{64}$/i.test(expectedIdentity.datadirSha256 || '') ||
      !expectedIdentity.version || !/^po_lastnight_reader@(127\.0\.0\.1|localhost)$/.test(expectedIdentity.user || '') ||
      !/^[a-f0-9-]{36}$/i.test(accountId || '')) fail('LAST_NIGHT_READ_CONFIG_INVALID');
    this.pool = pool;
    this.expectedIdentity = expectedIdentity;
    this.accountId = accountId;
  }

  async loadSnapshot() {
    const conn = await this.pool.getConnection();
    try {
      const [[identity]] = await conn.query(IDENTITY_SQL);
      const expected = this.expectedIdentity;
      if (identity?.hostname !== expected.hostname || Number(identity?.port) !== 3306 ||
        Number(identity?.serverId) !== expected.serverId || identity?.version !== expected.version ||
        identity?.db !== expected.database || identity?.dbUser !== expected.user ||
        sha(normalizedDir(identity?.datadir)) !== expected.datadirSha256.toLowerCase()) {
        fail('LAST_NIGHT_READ_IDENTITY_MISMATCH');
      }
      const [grants] = await conn.query('SHOW GRANTS');
      if (!grantsAreReadOnly(grants, expected.user)) fail('LAST_NIGHT_READ_GRANTS_UNSAFE');
      const [columns] = await conn.query(COLUMNS_SQL, [expected.database, ...TABLES]);
      assertColumns(columns);
      await conn.query('START TRANSACTION READ ONLY');
      try {
        const [sources] = await conn.query(SOURCE_SQL, [SOURCE_ID]);
        const [accounts] = await conn.query(ACCOUNT_SQL, [this.accountId, SOURCE_ID]);
        const [registry] = await conn.query(SITES_SQL, [SOURCE_ID]);
        const [credentials] = await conn.query(CREDENTIALS_SQL, [SOURCE_ID, this.accountId]);
        if (sources.length !== 1 || accounts.length !== 1 || credentials.length > 2 ||
          new Set(credentials.map(row => row.credential_type)).size !== credentials.length) {
          fail('LAST_NIGHT_READ_ROWS_INVALID');
        }
        const source = sources[0], account = accounts[0];
        if (source.id !== SOURCE_ID || source.game_id !== GAME_ID ||
          source.community_id !== COMMUNITY_ID || source.platform !== 'bigplayer_h5' ||
          source.region_code !== 'overseas' || source.community_status !== 'enabled' ||
          Number(source.enabled) !== 1 || String(boardIdOf(source)) !== BOARD_ID ||
          account.id !== this.accountId || account.source_id !== SOURCE_ID ||
          account.platform !== 'bigplayer_h5' || Number(account.enabled) !== 1 ||
          credentials.some(row => row.account_id !== this.accountId || row.source_id !== SOURCE_ID)) {
          fail('LAST_NIGHT_READ_SCOPE_MISMATCH');
        }
        return { source, account, registry, credentials };
      } finally { await conn.query('ROLLBACK'); }
    } finally { conn.release(); }
  }
}

module.exports = { LastNightReadOnlySource, grantsAreReadOnly, TABLE_COLUMNS,
  IDENTITY_SQL, COLUMNS_SQL, SOURCE_SQL, ACCOUNT_SQL, SITES_SQL, CREDENTIALS_SQL };
