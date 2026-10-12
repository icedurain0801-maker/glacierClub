'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const { secureEvidenceDir } = require('./snapshot-production-dba-preflight');
const { SOURCE_ID } = require('../worker/src/lastNightOverseasDailyJob');

const envPath = 'C:/ProgramData/PublicOpinion/config/public-opinion.env';
const auditRoot = 'C:/ProgramData/PublicOpinion/audit';
const oncePath = 'C:/ProgramData/PublicOpinion/audit/lastnight-reader-audit-20261008.once';
const target = Object.freeze({ hostname: 'LIUFUYI-2-48', port: 3306, serverId: 1,
  datadirHash: '41c80186c8f3e3e677308d5a4e427afac2bb32d4ffe158561389aaf62a63ba4a',
  version: '10.4.14-MariaDB', database: 'public_opinion' });
const timeoutMs = 3000;
const identitySql = `SELECT @@hostname AS hostname,@@port AS port,@@server_id AS serverId,
  @@datadir AS datadir,VERSION() AS version,DATABASE() AS db,
  CURRENT_USER() AS dbUser,CURRENT_ROLE() AS dbRole`;
const readerSql = "SELECT Host FROM mysql.user WHERE User='po_lastnight_reader' ORDER BY Host LIMIT 10";
const accountSql = 'SELECT id FROM po_accounts WHERE source_id=? ORDER BY id LIMIT 3';
const credentialsSql = `SELECT credential_type,COUNT(*) AS rowsCount,
  MAX(secret_cipher IS NOT NULL AND OCTET_LENGTH(secret_cipher)>0) AS hasCipher,
  MAX(secret_ref IS NOT NULL AND secret_ref<>'') AS hasRef,
  MAX(CASE WHEN secret_cipher IS NULL THEN 0 WHEN JSON_VALID(secret_cipher)=0 THEN -1
    WHEN JSON_EXTRACT(secret_cipher,'$.v')=2 THEN 2 ELSE 1 END) AS cipherVersion
  FROM po_credentials WHERE source_id=? AND account_id=?
  AND credential_type IN ('account_password','api_token') GROUP BY credential_type`;
const allowedSql = new Set([identitySql, readerSql, accountSql, credentialsSql,
  "SHOW GRANTS FOR 'po_lastnight_reader'@'127.0.0.1'",
  "SHOW GRANTS FOR 'po_lastnight_reader'@'localhost'"]);

const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
function dirHash(value) {
  if (!/^[A-Za-z]:[\\/]/.test(String(value))) return null;
  return hash(path.win32.normalize(value).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase());
}
function parseEnv(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}
function aclSafe(file, command = spawnSync) {
  if (fs.lstatSync(file).isSymbolicLink()) return false;
  const whoResult = command('whoami.exe', [], { encoding: 'utf8', timeout: timeoutMs });
  const who = String(whoResult.stdout || '').trim().toUpperCase();
  if (whoResult.error || whoResult.status !== 0 || !who) return false;
  const result = command('icacls.exe', [file], { encoding: 'utf8', timeout: timeoutMs });
  if (result.error || result.status !== 0) return false;
  const allowed = new Map([
    ['NT AUTHORITY\\SYSTEM', new Set(['(F)', '(OI)(CI)(F)'])],
    ['BUILTIN\\ADMINISTRATORS', new Set(['(F)', '(OI)(CI)(F)'])],
    [who, file === envPath ? new Set(['(RX)']) : new Set(['(F)', '(OI)(CI)(F)'])]
  ]);
  if (file === envPath) allowed.set('NT AUTHORITY\\LOCAL SERVICE', new Set(['(RX)']));
  const lines = String(result.stdout || '').split(/\r?\n/).filter(line => line.includes(':('));
  const entries = lines.map(line => {
    const match = /:((?:\([^)]*\))+)$/.exec(line.trim());
    const prefix = match ? line.slice(0, line.lastIndexOf(':')).trim().toUpperCase() : '';
    const principal = [...allowed.keys()].find(name => prefix.endsWith(name));
    return match && principal && { principal, access: match[1].toUpperCase() };
  });
  return entries.length === allowed.size && entries.every(entry =>
    entry && allowed.get(entry.principal)?.has(entry.access) && allowed.delete(entry.principal));
}
function claimOnce(dir, file = oncePath, checkAcl = aclSafe) {
  if (!checkAcl(dir)) throw new Error('AUDIT_ACL_UNSAFE');
  fs.renameSync(dir, file);
  return file;
}
function actorMatches(actor, expectedUser) {
  const match = /^([^@]+)@(localhost|127\.0\.0\.1)$/.exec(String(actor?.dbUser || ''));
  return Boolean(match && match[1] === expectedUser &&
    (actor.dbRole == null || actor.dbRole === 'NONE'));
}
function grantSummary(rows, host) {
  const expected = new Set(['po_sources', 'po_games', 'po_communities',
    'po_source_sites', 'po_accounts', 'po_credentials']);
  const seen = new Set();
  let extra = false;
  for (const row of rows) {
    const grant = String(Object.values(row)[0] || '').toUpperCase();
    const match = /^GRANT (.+?) ON (.+?) TO ((?:'[^']+'@'[^']+')|(?:`[^`]+`@`[^`]+`))(.*)$/.exec(grant);
    if (!match || match[3].replace(/['`]/g, '') !== `PO_LASTNIGHT_READER@${host.toUpperCase()}` ||
      !/^(?:| IDENTIFIED BY PASSWORD '\*[0-9A-F]+')$/.test(match[4])) { extra = true; continue; }
    const scope = match[2].replace(/['`]/g, '');
    if (scope === '*.*' && match[1] === 'USAGE') continue;
    const prefix = 'PUBLIC_OPINION.';
    const table = scope.startsWith(prefix) ? scope.slice(prefix.length).toLowerCase() : '';
    if (match[1] !== 'SELECT' || !expected.has(table) || seen.has(table)) extra = true;
    else seen.add(table);
  }
  return { sixTableSelect: seen.size === expected.size, extraPrivilege: extra,
    grantRows: rows.length };
}

async function runAudit({ connect = mysql.createConnection, readEnv = parseEnv,
  makeEvidenceDir = secureEvidenceDir, checkAcl = aclSafe,
  takeOnce = claimOnce } = {}) {
  let { dir } = makeEvidenceDir(auditRoot);
  const evidence = { status: 'NO_GO', code: 'NOT_STARTED', privilegedAudit: true,
    productionDbMutated: false, productionReadAttempted: false, connectionAttempts: 0,
    queryAttempts: 0, target: { host: '127.0.0.1', port: 3306, database: 'public_opinion' },
    reader: { exists: false, sixTableSelect: false, extraPrivilege: false },
    credentialShapes: [], startedAt: new Date().toISOString() };
  let conn;
  let evidenceWritable = false;
  const query = async (sql, params = []) => {
    if (!allowedSql.has(sql)) throw new Error('AUDIT_SQL_NOT_ALLOWED');
    evidence.queryAttempts += 1;
    const [rows] = await conn.query({ sql, timeout: timeoutMs }, params);
    return rows;
  };
  try {
    evidenceWritable = checkAcl(dir);
    if (!evidenceWritable || !checkAcl(envPath)) throw new Error('AUDIT_ACL_UNSAFE');
    dir = takeOnce(dir, oncePath, checkAcl);
    evidence.auditMarkerCreated = true;
    const env = readEnv(envPath);
    if (!['127.0.0.1', 'localhost'].includes(env.DB_HOST) ||
      env.DB_PORT !== '3306' || env.DB_NAME !== 'public_opinion' ||
      env.DB_USER !== 'root' || !env.DB_PASSWORD) {
      throw new Error('AUDIT_TARGET_CONFIG_MISMATCH');
    }
    evidence.productionReadAttempted = true;
    evidence.connectionAttempts = 1;
    conn = await connect({ host: '127.0.0.1', port: 3306, database: 'public_opinion',
      user: env.DB_USER, password: env.DB_PASSWORD, connectTimeout: timeoutMs,
      dateStrings: true, timezone: 'Z' });
    const [identity] = await query(identitySql);
    if (identity?.hostname !== target.hostname || Number(identity?.port) !== target.port ||
      Number(identity?.serverId) !== target.serverId || dirHash(identity?.datadir) !== target.datadirHash ||
      identity?.version !== target.version || identity?.db !== target.database ||
      !actorMatches(identity, env.DB_USER)) {
      throw new Error('AUDIT_IDENTITY_MISMATCH');
    }
    evidence.identityMatches = true;
    evidence.actor = { userHash: hash(identity.dbUser), roleHash: hash(identity.dbRole || 'NONE'),
      configuredUserHash: hash(env.DB_USER) };
    const readers = await query(readerSql);
    evidence.reader.exists = readers.length > 0;
    evidence.reader.accountCount = readers.length;
    if (readers.length === 1 && ['127.0.0.1', 'localhost'].includes(readers[0].Host)) {
      const grants = await query(`SHOW GRANTS FOR 'po_lastnight_reader'@'${readers[0].Host}'`);
      Object.assign(evidence.reader, grantSummary(grants, readers[0].Host));
    } else if (readers.length) evidence.reader.extraPrivilege = true;
    const accounts = await query(accountSql, [SOURCE_ID]);
    evidence.targetAccountCount = accounts.length;
    if (accounts.length === 1) {
      evidence.accountHash = hash(accounts[0].id);
      const credentials = await query(credentialsSql, [SOURCE_ID, accounts[0].id]);
      evidence.credentialShapes = credentials.map(row => ({ type: row.credential_type,
        rows: Number(row.rowsCount), hasCipher: Number(row.hasCipher) === 1,
        cipherVersion: Number(row.cipherVersion), hasRef: Number(row.hasRef) === 1 }));
    }
    evidence.code = !evidence.reader.exists ? 'READER_MISSING' :
      evidence.reader.extraPrivilege || !evidence.reader.sixTableSelect ? 'READER_GRANTS_UNSAFE' :
        accounts.length !== 1 ? 'ACCOUNT_AMBIGUOUS' : 'SHAPE_INSPECTED_PRODUCTION_NO_GO';
  } catch (error) {
    const known = new Set(['AUDIT_ACL_UNSAFE', 'AUDIT_TARGET_CONFIG_MISMATCH',
      'AUDIT_IDENTITY_MISMATCH', 'AUDIT_SQL_NOT_ALLOWED']);
    evidence.code = known.has(error.message) ? error.message :
      !evidence.auditMarkerCreated ? 'AUDIT_ONCE_CLAIM_FAILED' :
        !conn ? 'AUDIT_CONNECT_FAILED' : 'AUDIT_QUERY_FAILED';
  } finally {
    if (conn) await conn.end().catch(() => {});
    evidence.finishedAt = new Date().toISOString();
    if (evidenceWritable) {
      evidence.evidenceWritten = true;
      fs.writeFileSync(path.join(dir, 'result.json'),
        JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
    }
  }
  return { evidence, dir };
}

if (require.main === module) {
  if (process.argv.length !== 2) {
    process.stdout.write(JSON.stringify({ status: 'NO_GO', code: 'AUDIT_ARGUMENTS_REJECTED' }) + '\n');
    process.exitCode = 1;
  } else runAudit().then(({ evidence, dir }) => {
    process.stdout.write(JSON.stringify({ status: evidence.status, code: evidence.code,
      connectionAttempts: evidence.connectionAttempts, queryAttempts: evidence.queryAttempts,
      evidenceDir: dir }) + '\n');
    if (evidence.code !== 'SHAPE_INSPECTED_PRODUCTION_NO_GO') process.exitCode = 1;
  }).catch(() => {
    process.stdout.write(JSON.stringify({ status: 'NO_GO', code: 'AUDIT_LOCAL_PRECHECK_FAILED',
      connectionAttempts: 0 }) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { runAudit, grantSummary, aclSafe, claimOnce, dirHash, identitySql,
  actorMatches, readerSql, accountSql, credentialsSql };
