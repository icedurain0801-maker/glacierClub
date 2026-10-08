'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');

const envFile = process.env.PUBLIC_OPINION_ENV_FILE || 'C:/ProgramData/PublicOpinion/config/public-opinion.env';
const auditRoot = 'C:/ProgramData/PublicOpinion/audit';
const expected = { hostname: 'LIUFUYI-2-48', port: 3306, serverId: 1, version: '10.4.14-MariaDB', database: 'public_opinion' };
const allowedTaskPatterns = [/BigPlayer/i, /PublicOpinion/i, /Q1/i, /Overseas/i];
const timeoutMs = 5000;
const outputKeys = Object.freeze([
  'status', 'code', 'productionTouched', 'authorizedScope', 'startedAt', 'finishedAt',
  'actorHash', 'target', 'queries', 'identity', 'effectivePrivileges', 'processes', 'blockers'
]);

function parseEnv(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function runPowerShell(script) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: timeoutMs });
  if (result.error || result.status !== 0) throw new Error('WINDOWS_READONLY_QUERY_FAILED');
  return JSON.parse(result.stdout || '[]');
}
function classifyTasks(tasks) {
  let classified = 0;
  let unknown = 0;
  const states = {};
  for (const task of tasks) {
    const name = `${task.TaskPath || ''}${task.TaskName || ''}`;
    const ok = allowedTaskPatterns.some(pattern => pattern.test(name));
    if (ok) classified++; else unknown++;
    states[task.State || 'Unknown'] = (states[task.State || 'Unknown'] || 0) + 1;
  }
  return { total: tasks.length, classified, unknown, states };
}
function secureEvidenceDir(root = auditRoot, runCommand = spawnSync) {
  fs.mkdirSync(root, { recursive: true });
  const dir = path.join(root, `dba-preflight-${Date.now()}-${process.pid}`);
  const whoResult = runCommand('whoami.exe', [], { encoding: 'utf8' });
  const who = String(whoResult.stdout || '').trim();
  if (whoResult.error || whoResult.status !== 0 || !who) throw new Error('EVIDENCE_ACTOR_FAILED');
  try {
    fs.mkdirSync(dir);
    const acl = runCommand('icacls.exe', [dir, '/inheritance:r', '/grant:r', 'SYSTEM:(OI)(CI)F', 'Administrators:(OI)(CI)F', `${who}:(OI)(CI)F`], { encoding: 'utf8' });
    if (acl.error || acl.status !== 0) throw new Error('EVIDENCE_ACL_FAILED');
    return { dir, who };
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

function assertStaticBoundary(target = expected, keys = outputKeys) {
  if (target.hostname !== expected.hostname || target.port !== expected.port ||
    target.serverId !== expected.serverId || target.version !== expected.version ||
    target.database !== expected.database) throw new Error('STATIC_TARGET_MISMATCH');
  if (!Array.isArray(keys) || keys.length !== outputKeys.length ||
    new Set(keys).size !== outputKeys.length || keys.some(key => !outputKeys.includes(key))) {
    throw new Error('EVIDENCE_OUTPUT_WHITELIST_INVALID');
  }
}

function prepareLocalPreflight({ root = auditRoot, runCommand = spawnSync, target = expected, keys = outputKeys } = {}) {
  assertStaticBoundary(target, keys);
  return secureEvidenceDir(root, runCommand);
}

function writeEvidence(file, evidence) {
  if (Object.keys(evidence).some(key => !outputKeys.includes(key))) throw new Error('EVIDENCE_OUTPUT_NOT_ALLOWED');
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
}

async function main() {
  if (process.argv.length !== 2) throw new Error('PREFLIGHT_ARGUMENTS_REJECTED');
  const { dir, who } = prepareLocalPreflight();
  const env = parseEnv(envFile);
  const startedAt = new Date().toISOString();
  const evidence = { status: 'NO_GO', code: 'NOT_STARTED', productionTouched: false, authorizedScope: 'DBA_READONLY_PREFLIGHT_ONLY', startedAt, actorHash: hash(who), target: { host: env.DB_HOST, port: Number(env.DB_PORT), database: env.DB_NAME }, queries: { timeoutMs, rawSqlSaved: false, businessRowsSaved: false, credentialsSaved: false } };
  let connection;
  const query = async (sql, params = []) => {
    if (!/^(SELECT|SHOW)\b/i.test(sql) || /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|FLUSH|UNLOCK|SET\s+GLOBAL|CALL)\b/i.test(sql)) throw new Error('READONLY_SQL_NOT_ALLOWED');
    return Promise.race([
      connection.query({ sql, timeout: timeoutMs }, params).then(([rows]) => rows),
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('QUERY_TIMEOUT'), { code: 'QUERY_TIMEOUT' })), timeoutMs + 500))
    ]);
  };
  try {
    if (env.DB_HOST !== expected.hostname || Number(env.DB_PORT) !== expected.port || env.DB_NAME !== expected.database) throw new Error('TARGET_CONFIG_MISMATCH');
    connection = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, connectTimeout: timeoutMs, dateStrings: true, timezone: 'Z' });
    const [identity] = await query('SELECT CURRENT_USER() AS currentUser,CURRENT_ROLE() AS currentRole,@@hostname AS hostname,@@port AS port,@@server_id AS serverId,@@datadir AS datadir,VERSION() AS version,DATABASE() AS databaseName,@@read_only AS readOnly,CONNECTION_ID() AS connectionId');
    const grants = await query('SHOW GRANTS');
    const roles = await query('SELECT User,Host,Role,Admin_option FROM mysql.roles_mapping');
    const effective = await query('SELECT GRANTEE,PRIVILEGE_TYPE,IS_GRANTABLE FROM information_schema.USER_PRIVILEGES UNION ALL SELECT GRANTEE,PRIVILEGE_TYPE,IS_GRANTABLE FROM information_schema.SCHEMA_PRIVILEGES WHERE TABLE_SCHEMA=DATABASE() UNION ALL SELECT GRANTEE,PRIVILEGE_TYPE,IS_GRANTABLE FROM information_schema.TABLE_PRIVILEGES WHERE TABLE_SCHEMA=DATABASE()');
    if (identity.hostname !== expected.hostname || Number(identity.port) !== expected.port || Number(identity.serverId) !== expected.serverId || identity.version !== expected.version || identity.databaseName !== expected.database) throw new Error('TARGET_IDENTITY_MISMATCH');
    const processlist = await query('SELECT COALESCE(DB,\'<none>\') AS db,USER,COMMAND,COUNT(*) AS n,MAX(TIME) AS maxAgeSeconds FROM information_schema.PROCESSLIST GROUP BY COALESCE(DB,\'<none>\'),USER,COMMAND');
    const trx = await query('SELECT COUNT(*) AS n,COALESCE(MAX(TIMESTAMPDIFF(SECOND,trx_started,NOW(3))),0) AS maxAgeSeconds,COALESCE(SUM(trx_rows_modified),0) AS rowsModified,COALESCE(SUM(trx_rows_locked),0) AS rowsLocked FROM information_schema.innodb_trx');
    const tables = await query('SELECT COUNT(*) AS n,COALESCE(SUM(data_length+index_length),0) AS bytes FROM information_schema.tables WHERE table_schema=DATABASE()');
    const objects = await query("SELECT 'TRIGGER' AS type,COUNT(*) AS n FROM information_schema.triggers WHERE trigger_schema=DATABASE() UNION ALL SELECT 'ROUTINE',COUNT(*) FROM information_schema.routines WHERE routine_schema=DATABASE() UNION ALL SELECT 'EVENT',COUNT(*) FROM information_schema.events WHERE event_schema=DATABASE()");
    const runs = await query("SELECT status,COUNT(*) AS n FROM po_sync_runs WHERE status IN ('queued','running','pausing','cancelling') GROUP BY status");
    const leases = await query('SELECT (SELECT COUNT(*) FROM po_source_schedule_state WHERE lease_until>UTC_TIMESTAMP(3)) AS scheduleLeases,(SELECT COUNT(*) FROM po_worker_leases WHERE lease_until>UTC_TIMESTAMP(3)) AS workerLeases,(SELECT COUNT(*) FROM po_worker_heartbeats WHERE last_seen_at>UTC_TIMESTAMP(3)-INTERVAL 5 MINUTE) AS recentHeartbeats');
    const eventScheduler = await query("SELECT @@event_scheduler AS eventScheduler");
    const replication = { slave: (await query('SHOW SLAVE STATUS')).length };
    const writes = await query("SELECT VARIABLE_NAME AS name,VARIABLE_VALUE AS value FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME IN ('COM_INSERT','COM_UPDATE','COM_DELETE','COM_REPLACE')");
    const services = runPowerShell("Get-Service | Where-Object {$_.Name -match 'PublicOpinion|BigPlayer|Maria|MySQL'} | Select-Object Name,Status,StartType | ConvertTo-Json -Compress");
    const tasks = runPowerShell("Get-ScheduledTask | Select-Object TaskName,TaskPath,State,Actions,Triggers | ConvertTo-Json -Compress");
    const taskList = Array.isArray(tasks) ? tasks : [tasks];
    const taskSummary = classifyTasks(taskList);
    const unknownConnections = processlist.filter(row => String(row.db).toLowerCase() !== expected.database);
    evidence.status = 'NO_GO'; evidence.code = taskSummary.unknown > 0 ? 'UNCLASSIFIED_WINDOWS_TASK' : 'DBA_READONLY_PREFLIGHT_COMPLETE_NO_GO';
    evidence.identity = { currentUser: identity.currentUser, currentRole: identity.currentRole, hostname: identity.hostname, port: Number(identity.port), serverId: Number(identity.serverId), version: identity.version, database: identity.databaseName, readOnly: identity.readOnly };
    evidence.effectivePrivileges = { grantRows: grants.length, roleRows: roles.length, privilegeRows: effective.length, hasGrantOption: effective.some(row => String(row.IS_GRANTABLE).toUpperCase() === 'YES'), currentUserHash: hash(identity.currentUser), currentRoleHash: hash(identity.currentRole || 'NONE') };
    evidence.processes = { groups: processlist.length, targetDbGroups: processlist.filter(row => String(row.db).toLowerCase() === expected.database).length, nonTargetDbGroups: unknownConnections.length, unknownUserDbGroups: unknownConnections.length, transactions: trx[0], replication, eventScheduler: eventScheduler[0], services: services.map(row => ({ name: row.Name, status: row.Status, startType: row.StartType })), tasks: taskSummary };
    evidence.target = { ...evidence.target, tables: tables[0], objects: Object.fromEntries(objects.map(row => [row.type, Number(row.n)])), runs: Object.fromEntries(runs.map(row => [row.status, Number(row.n)])), leases: leases[0], writes: Object.fromEntries(writes.map(row => [row.name, Number(row.value)])) };
    evidence.blockers = ['PRODUCTION_EXECUTOR_DISABLED','NO_STOP_OR_LOCK_AUTHORIZATION','NO_BACKUP_OR_DDL_AUTHORIZATION','DBA_PRIVILEGED_IDENTITY_NOT_MINIMAL_OBSERVER'];
    if (unknownConnections.length) evidence.blockers.push('NON_TARGET_PROCESS_GROUPS_PRESENT');
    if (Number(trx[0].n) > 0) evidence.blockers.push('ACTIVE_TRANSACTIONS');
    evidence.finishedAt = new Date().toISOString();
    writeEvidence(path.join(dir, 'result.json'), evidence);
    process.stdout.write(JSON.stringify({ status: evidence.status, code: evidence.code, productionTouched: false, evidenceDir: dir }) + '\n');
  } catch (error) {
    evidence.code = error.code || error.message || 'PREFLIGHT_FAILED'; evidence.finishedAt = new Date().toISOString();
    writeEvidence(path.join(dir, 'result.json'), evidence);
    process.stdout.write(JSON.stringify({ status: 'NO_GO', code: evidence.code, productionTouched: false, evidenceDir: dir }) + '\n');
    process.exitCode = 1;
  } finally { if (connection) await connection.end().catch(() => {}); }
}

if (require.main === module) main().catch(() => { process.stdout.write(JSON.stringify({ status: 'NO_GO', code: 'PREFLIGHT_FAILED', productionTouched: false }) + '\n'); process.exitCode = 1; });

module.exports = { secureEvidenceDir, prepareLocalPreflight, assertStaticBoundary, writeEvidence };
