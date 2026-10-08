'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const evidenceRoot = path.resolve(__dirname, '../../..', '.temp/po-closeout-20261008');
const required = ['PO_READONLY_DB_HOST', 'PO_READONLY_DB_PORT', 'PO_READONLY_DB_NAME', 'PO_READONLY_DB_USER', 'PO_READONLY_DB_PASSWORD'];
const noGo = code => ({ status: 'NO_GO', code, productionTouched: false });

function readConfig(env = process.env, { isolated = false } = {}) {
  if (required.some(key => !env[key]) || !/^po_snapshot_observer_[a-z0-9_]+$/.test(env.PO_READONLY_DB_USER)) return null;
  const port = Number(env.PO_READONLY_DB_PORT);
  if (env.PO_READONLY_DB_HOST !== '127.0.0.1' || (!isolated && port !== 3306) ||
    (isolated && ![43318].includes(port)) || env.PO_READONLY_DB_NAME !== 'public_opinion') return null;
  return { host: env.PO_READONLY_DB_HOST, port, database: env.PO_READONLY_DB_NAME,
    user: env.PO_READONLY_DB_USER, password: env.PO_READONLY_DB_PASSWORD };
}

function grantsAreMinimal(rows, user) {
  let select = false;
  let process = false;
  const account = `'${user}'@'127.0.0.1'`.toUpperCase();
  if (!Array.isArray(rows) || rows.length < 2) return false;
  for (const row of rows) {
    const grant = String(Object.values(row)[0] || '').toUpperCase();
    const match = grant.match(/^GRANT (.+?) ON (.+?) TO ('[^']+'@'[^']+')(.*)$/);
    if (!match || match[3] !== account || grant.includes('WITH GRANT OPTION')) return false;
    const privileges = match[1].split(',').map(value => value.trim());
    const scope = match[2].replace(/`/g, '');
    if (match[4] && !(privileges.length === 1 && privileges[0] === 'USAGE' && scope === '*.*' &&
      /^ IDENTIFIED BY PASSWORD '\*[A-F0-9]+'$/.test(match[4]))) return false;
    for (const privilege of privileges) {
      if (privilege === 'USAGE' && scope === '*.*') continue;
      if (privilege === 'PROCESS' && scope === '*.*') { process = true; continue; }
      if (privilege === 'SELECT' && scope === 'PUBLIC_OPINION.*') { select = true; continue; }
      return false;
    }
  }
  return select && process;
}

async function assessProduction({ env = process.env, connect = mysql.createConnection, intervalMs = 10000,
  isolated = false, expectedIdentity = { hostname: 'LIUFUYI-2-48', port: 3306, serverId: 1, version: '10.4.14-MariaDB' } } = {}) {
  const config = readConfig(env, { isolated });
  if (!config) return noGo('READONLY_CREDENTIALS_MISSING_OR_INVALID');
  let connection;
  let timedOut = false;
  const query = async (sql, params = []) => {
    if (!/^SELECT\b|^SHOW GRANTS\b/.test(sql)) throw new TypeError('read-only SQL required');
    let timer;
    try {
      return await Promise.race([
        connection.query({ sql, timeout: 5000 }, params).then(([rows]) => rows),
        new Promise((_, reject) => { timer = setTimeout(() => {
          timedOut = true;
          connection.destroy();
          reject(new Error('QUERY_TIME_LIMIT'));
        }, 5500); })
      ]);
    } finally { clearTimeout(timer); }
  };
  try {
    connection = await connect({ ...config, connectTimeout: 5000, dateStrings: true, timezone: 'Z' });
    const grants = await query('SHOW GRANTS');
    if (!grantsAreMinimal(grants, config.user)) return noGo('READONLY_GRANTS_NOT_MINIMAL');
    const [session] = await query('SELECT CURRENT_USER() AS authenticatedUser,CURRENT_ROLE() AS activeRole');
    if (session?.authenticatedUser !== `${config.user}@127.0.0.1` ||
      (session.activeRole !== null && session.activeRole !== undefined && session.activeRole !== 'NONE')) {
      return noGo('READONLY_SESSION_IDENTITY_MISMATCH');
    }
    const [identity] = await query('SELECT @@hostname AS hostname,@@port AS port,@@server_id AS serverId,VERSION() AS version,DATABASE() AS db,@@read_only AS readOnly,UTC_TIMESTAMP(3) AS capturedAt');
    if (identity?.hostname !== expectedIdentity.hostname || Number(identity.port) !== expectedIdentity.port ||
      Number(identity.serverId) !== expectedIdentity.serverId || identity.version !== expectedIdentity.version || identity.db !== 'public_opinion') {
      return noGo('PRODUCTION_IDENTITY_MISMATCH');
    }
    const tables = await query('SELECT table_name,table_type,engine,table_rows,data_length,index_length FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY table_name');
    const types = await query(`SELECT 'TRIGGER' AS type,COUNT(*) AS n FROM information_schema.triggers WHERE trigger_schema=DATABASE()
      UNION ALL SELECT 'ROUTINE',COUNT(*) FROM information_schema.routines WHERE routine_schema=DATABASE()
      UNION ALL SELECT 'EVENT',COUNT(*) FROM information_schema.events WHERE event_schema=DATABASE()`);
    const [transactions] = await query('SELECT COUNT(*) AS n,COALESCE(MAX(TIMESTAMPDIFF(SECOND,trx_started,NOW(3))),0) AS maxAgeSeconds,COALESCE(SUM(trx_rows_modified),0) AS rowsModified,COALESCE(SUM(trx_rows_locked),0) AS rowsLocked FROM information_schema.innodb_trx');
    const [connections] = await query('SELECT COUNT(*) AS n,COALESCE(MAX(TIME),0) AS maxAgeSeconds,SUM(DB=DATABASE()) AS targetDbConnections FROM information_schema.processlist');
    const runs = await query("SELECT status,COUNT(*) AS n FROM po_sync_runs WHERE status IN ('queued','running','pausing','cancelling') GROUP BY status");
    const [scheduleLeases] = await query('SELECT COUNT(*) AS n FROM po_source_schedule_state WHERE lease_until>UTC_TIMESTAMP(3)');
    const [workerLeases] = await query('SELECT COUNT(*) AS n FROM po_worker_leases WHERE lease_until>UTC_TIMESTAMP(3)');
    const [heartbeats] = await query('SELECT COUNT(*) AS n FROM po_worker_heartbeats WHERE last_seen_at>UTC_TIMESTAMP(3)-INTERVAL 5 MINUTE');
    const sample = async () => {
      const rows = await query("SELECT VARIABLE_NAME AS name,VARIABLE_VALUE AS value FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME IN ('COM_INSERT','COM_UPDATE','COM_DELETE','COM_REPLACE')");
      const counters = Object.fromEntries(rows.map(row => [String(row.name).toUpperCase(), Number(row.value)]));
      const names = ['COM_INSERT', 'COM_UPDATE', 'COM_DELETE', 'COM_REPLACE'];
      if (rows.length !== names.length || names.some(name => !Number.isSafeInteger(counters[name]) || counters[name] < 0)) {
        throw Object.assign(new Error('counter set incomplete'), { code: 'WRITE_COUNTERS_UNVERIFIABLE' });
      }
      return { at: new Date().toISOString(), counters };
    };
    const first = await sample();
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    const second = await sample();
    if (Object.keys(first.counters).some(name => second.counters[name] < first.counters[name])) {
      throw Object.assign(new Error('counter reset'), { code: 'WRITE_COUNTERS_UNVERIFIABLE' });
    }
    const writeStatements = Object.keys(first.counters).reduce((sum, name) => sum + second.counters[name] - first.counters[name], 0);
    const baseTables = tables.filter(row => row.table_type === 'BASE TABLE');
    const totalBytes = baseTables.reduce((sum, row) => sum + Number(row.data_length || 0) + Number(row.index_length || 0), 0);
    const largest = baseTables.map(row => ({ name: row.table_name, estimatedRows: Number(row.table_rows || 0),
      bytes: Number(row.data_length || 0) + Number(row.index_length || 0), engine: row.engine }))
      .sort((a, b) => b.bytes - a.bytes).slice(0, 10);
    const blockers = [
      'CHECKPOINT_LEASES_NOT_SAMPLED_WITHOUT_INDEX_BUDGET',
      'OS_WRITERS_AND_SCHEDULED_TASKS_REQUIRE_SEPARATE_EVIDENCE',
      'PRODUCTION_LOCK_WINDOW_NOT_APPROVED',
      'PRODUCTION_EXECUTOR_DISABLED'
    ];
    if (baseTables.some(row => row.engine !== 'InnoDB')) blockers.push('NON_INNODB_TABLE_PRESENT');
    if (Number(transactions.n) > 0) blockers.push('ACTIVE_TRANSACTIONS');
    if (writeStatements > 0) blockers.push('WRITE_ACTIVITY_OBSERVED');
    return {
      status: 'NO_GO', code: 'PRODUCTION_WINDOW_NOT_ADMITTED', productionTouched: false,
      identity: { hostname: identity.hostname, port: Number(identity.port), serverId: Number(identity.serverId),
        version: identity.version, database: identity.db, capturedAt: identity.capturedAt },
      tables: { count: baseTables.length, estimatedRows: baseTables.reduce((sum, row) => sum + Number(row.table_rows || 0), 0), totalBytes, largest },
      objects: Object.fromEntries(types.map(row => [row.type, Number(row.n)])),
      transactions: { count: Number(transactions.n), maxAgeSeconds: Number(transactions.maxAgeSeconds),
        rowsModified: Number(transactions.rowsModified), rowsLocked: Number(transactions.rowsLocked) },
      connections: { count: Number(connections.n), maxAgeSeconds: Number(connections.maxAgeSeconds), targetDbConnections: Number(connections.targetDbConnections) },
      runs: Object.fromEntries(runs.map(row => [row.status, Number(row.n)])),
      leases: { schedule: Number(scheduleLeases.n), worker: Number(workerLeases.n), recentHeartbeats: Number(heartbeats.n) },
      writes: { sampleFrom: first.at, sampleTo: second.at, globalStatementDelta: writeStatements, scope: 'whole_server_short_interval_not_peak' },
      blockers
    };
  } catch (error) {
    return noGo(timedOut ? 'READONLY_QUERY_TIMEOUT' : error?.code === 'WRITE_COUNTERS_UNVERIFIABLE' ? error.code : 'READONLY_OBSERVATION_FAILED');
  } finally { if (connection) await connection.end().catch(() => {}); }
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--readonly') {
    process.stdout.write(JSON.stringify(noGo('READONLY_MODE_REQUIRED')) + '\n');
    process.exitCode = 1;
    return;
  }
  const evidence = await assessProduction();
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const filename = path.join(evidenceRoot, `snapshot-production-readonly-${Date.now()}.json`);
  const scriptSha256 = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
  fs.writeFileSync(filename, JSON.stringify({ ...evidence, scriptSha256 }, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ file: filename, status: evidence.status, code: evidence.code, scriptSha256 }) + '\n');
  if (evidence.code !== 'PRODUCTION_WINDOW_NOT_ADMITTED') process.exitCode = 1;
}

if (require.main === module) main().catch(() => {
  process.stdout.write(JSON.stringify(noGo('READONLY_PRECHECK_FAILED')) + '\n');
  process.exitCode = 1;
});

module.exports = { readConfig, grantsAreMinimal, assessProduction };
