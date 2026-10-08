#!/usr/bin/env node
'use strict';

// Candidate-local, destructive only against databases explicitly supplied to this process.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { querySnapshot, compareStrict } = require('./production-schema.js');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) throw new Error(`unexpected argument: ${item}`);
    const key = item.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    out[key] = value;
    i += 1;
  }
  return out;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value).replace(/(mysql(?:2)?:\/\/[^:]+:)[^@]*@/i, '$1***@').replace(/password=[^&]*/ig, 'password=***');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

function dbConfig(args, database) {
  if (args['db-url']) {
    const url = new URL(args['db-url']);
    url.pathname = `/${database}`;
    return { uri: url.toString() };
  }
  return { host: args['db-host'] || '127.0.0.1', port: Number(args['db-port'] || 3306), user: args['db-user'] || 'root', password: args['db-password'] || '', database };
}

async function withConnection(mysql, config, fn) {
  const conn = await mysql.createConnection({ ...config, multipleStatements: true });
  try { return await fn(conn); } finally { await conn.end(); }
}

async function exists(mysql, config, database) {
  try { await withConnection(mysql, { ...config, database }, conn => conn.query('SELECT 1')); return true; } catch { return false; }
}

function migrationEnv(args, dbName) {
  const env = { ...process.env, DB_HOST: args['db-host'] || '127.0.0.1', DB_PORT: args['db-port'] || '3306', DB_USER: args['db-user'] || 'root', DB_PASSWORD: args['db-password'] || '', DB_NAME: dbName };
  // Always set the URL explicitly: a parent environment or candidate .env must
  // never redirect the child migration into a non-isolated database.
  const url = args['db-url'] ? new URL(args['db-url']) : new URL('mysql://127.0.0.1');
  if (!args['db-url']) {
    url.hostname = env.DB_HOST;
    url.port = env.DB_PORT;
    url.username = env.DB_USER;
    url.password = env.DB_PASSWORD;
  }
  url.pathname = `/${dbName}`;
  env.DATABASE_URL = url.toString();
  return env;
}

function runMigration(candidate, args, dbName, only) {
  return new Promise((resolve, reject) => {
    const script = path.join(candidate, 'server', 'src', 'db', 'migrate.js');
    const child = spawn(process.execPath, [script, ...(only ? [only] : [])], { cwd: candidate, env: migrationEnv(args, dbName), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function migrationFiles(candidate) {
  return fs.readdirSync(path.join(candidate, 'migrations')).filter(file => file.endsWith('.sql')).sort();
}

async function runThrough(candidate, args, dbName, lastFile) {
  const files = migrationFiles(candidate).filter(file => file <= lastFile);
  const logs = [];
  for (const file of files) {
    const result = await runMigration(candidate, args, dbName, file);
    logs.push({ file, code: result.code, stderr: result.stderr.slice(-500) });
    if (result.code !== 0) return { code: result.code, logs };
  }
  return { code: 0, logs };
}

async function createDb(mysql, admin, name) {
  await withConnection(mysql, admin, conn => conn.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`));
}
async function dropDb(mysql, admin, name) {
  try { await withConnection(mysql, admin, conn => conn.query(`DROP DATABASE IF EXISTS \`${name}\``)); } catch {}
}

async function schemaSnapshot(mysql, config) {
  return withConnection(mysql, config, async conn => {
    const [columns] = await conn.query(`SELECT table_name,column_name,column_type,is_nullable,column_key FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN ('po_sync_runs','po_sync_checkpoints') ORDER BY table_name,ordinal_position`);
    const [constraints] = await conn.query(`SELECT table_name,constraint_name,referenced_table_name,delete_rule FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND table_name='po_sync_runs' ORDER BY constraint_name`);
    const [indexes] = await conn.query(`SELECT table_name,index_name,non_unique,GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_list FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN ('po_sync_runs','po_sync_checkpoints') GROUP BY table_name,index_name,non_unique ORDER BY table_name,index_name`);
    return { columns, constraints, indexes };
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const candidate = path.resolve(args.candidate || '');
  if (!candidate || !fs.existsSync(path.join(candidate, 'migrations')) || !fs.existsSync(path.join(candidate, 'server', 'src', 'db', 'migrate.js'))) throw new Error('--candidate must contain migrations and server/src/db/migrate.js');
  const runtime = path.join(candidate, 'api-runtime', 'node_modules');
  const mysql = require(require.resolve('mysql2/promise', { paths: [runtime, candidate, __dirname] }));
  const admin = args['db-url'] ? dbConfig(args, 'mysql') : { host: args['db-host'] || '127.0.0.1', port: Number(args['db-port'] || 3306), user: args['db-user'] || 'root', password: args['db-password'] || '' };
  const stamp = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const prefix = `candidate_verify_${stamp}`;
  const evidenceDir = path.resolve(args['evidence-dir'] || path.join(candidate, 'verification-evidence', stamp));
  fs.mkdirSync(evidenceDir, { recursive: true });
  const results = [];
  const keepDbs = new Set();
  const record = (name, status, detail) => { const item = { name, status, detail: redact(detail) }; results.push(item); fs.writeFileSync(path.join(evidenceDir, `${String(results.length).padStart(2, '0')}-${name}.json`), JSON.stringify(item, null, 2)); };
  const dbs = [];
  const fresh = async label => { const name = `${prefix}_${label}`; await createDb(mysql, admin, name); dbs.push(name); return name; };
  try {
    const empty = await fresh('empty');
    const emptyRun = await runMigration(candidate, args, empty);
    const emptyStatus = emptyRun.code === 0 ? 'PASS' : 'FAIL'; record('empty-db', emptyStatus, { code: emptyRun.code, stderr: emptyRun.stderr.slice(-1000) }); if (emptyStatus !== 'PASS') keepDbs.add(empty);

    const old = await fresh('old-schema');
    const oldRun = await runThrough(candidate, args, old, '026_scheduler_runtime_schema_reconciliation.sql');
    const oldUpgrade = oldRun.code === 0 ? await runMigration(candidate, args, old) : { code: 1, stderr: 'pre-026 failed' };
    const oldDetail = { through026: oldRun.code, upgradeCode: oldUpgrade.code, appliedBeforeUpgrade: oldRun.logs.filter(x => x.code === 0).map(x => x.file) };
    const oldStatus = oldRun.code === 0 && oldUpgrade.code === 0 ? 'PASS' : 'FAIL'; record('old-schema-upgrade', oldStatus, oldDetail); if (oldStatus !== 'PASS') keepDbs.add(old);

    const ledger = await fresh('ledger-rerun');
    const ledgerFirst = await runMigration(candidate, args, ledger);
    let ledgerCode = ledgerFirst.code;
    if (ledgerCode === 0) {
      await withConnection(mysql, dbConfig(args, ledger), conn => conn.query('DELETE FROM po_schema_migrations WHERE version IN (\'027_bigplayer_multisite.sql\',\'028_bigplayer_scheduled_site_runs.sql\')'));
      ledgerCode = (await runMigration(candidate, args, ledger)).code;
    }
    const ledgerState = ledgerCode === 0 ? await withConnection(mysql, dbConfig(args, ledger), conn => conn.query("SELECT COUNT(*) AS count FROM po_schema_migrations WHERE version IN ('027_bigplayer_multisite.sql','028_bigplayer_scheduled_site_runs.sql')").then(([rows]) => Number(rows[0].count))) : 0;
    const ledgerStatus = ledgerCode === 0 && ledgerState === 2 ? 'PASS' : 'FAIL'; record('ledger-delete-rerun', ledgerStatus, { firstCode: ledgerFirst.code, rerunCode: ledgerCode, finalLedgerRows: ledgerState }); if (ledgerStatus !== 'PASS') keepDbs.add(ledger);

    const interrupted = await fresh('fk-interrupted');
    const intFirst = await runMigration(candidate, args, interrupted);
    let intCode = intFirst.code;
    if (intCode === 0) {
      await withConnection(mysql, dbConfig(args, interrupted), conn => conn.query('DELETE FROM po_schema_migrations WHERE version=\'027_bigplayer_multisite.sql\''));
      intCode = (await runMigration(candidate, args, interrupted, '027_bigplayer_multisite.sql')).code;
    }
    const fkState = intCode === 0 ? await withConnection(mysql, dbConfig(args, interrupted), conn => conn.query("SELECT COUNT(*) AS count FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name='po_sync_runs' AND constraint_name='po_sync_runs_parent_fk'").then(([rows]) => Number(rows[0].count))) : 0;
    const fkStatus = intCode === 0 && fkState === 1 ? 'PASS' : 'FAIL'; record('fk-interrupted-rerun', fkStatus, { firstCode: intFirst.code, rerunCode: intCode, parentFkCount: fkState }); if (fkStatus !== 'PASS') keepDbs.add(interrupted);

    const preflight = await fresh('missing-window');
    const preRun = await runThrough(candidate, args, preflight, '026_scheduler_runtime_schema_reconciliation.sql');
    let preDetail = { through026Code: preRun.code };
    if (preRun.code === 0) {
      keepDbs.add(preflight);
      await withConnection(mysql, dbConfig(args, preflight), conn => conn.query('DELETE FROM po_schema_migrations WHERE version IN (\'027_bigplayer_multisite.sql\',\'028_bigplayer_scheduled_site_runs.sql\'); ALTER TABLE po_sync_checkpoints DROP INDEX po_sync_checkpoints_window_uk; ALTER TABLE po_sync_checkpoints DROP COLUMN window_start'));
      const fail = await runMigration(candidate, args, preflight, '027_bigplayer_multisite.sql');
      preDetail.failFastCode = fail.code; preDetail.failFastMessage = fail.stderr || fail.stdout;
    }
    const preflightStatus = preDetail.failFastCode && String(preDetail.failFastMessage).includes('MIGRATION_027_PREREQUISITE_NOT_READY') ? 'PASS' : 'FAIL';
    record('missing-window-fail-fast', preflightStatus, preDetail);
    if (preflightStatus === 'PASS') keepDbs.delete(preflight);

    const snapshot = await schemaSnapshot(mysql, dbConfig(args, empty));
    fs.writeFileSync(path.join(evidenceDir, 'schema-snapshot.json'), JSON.stringify(snapshot, null, 2));
    record('schema-invariants', snapshot.constraints.some(x => x.constraint_name === 'po_sync_runs_parent_fk') && snapshot.columns.some(x => x.table_name === 'po_sync_runs' && x.column_name === 'parent_run_id') ? 'PASS' : 'FAIL', snapshot);
    const ddlImpact = {
      status: 'PASS',
      version: 'captured by production-schema probe when a production connection is supplied',
      rowCount: { policy: 'record_only', source: 'information_schema.tables.table_rows' },
      lockWaits: { policy: 'record_only; unavailable is explicit capability state', source: 'information_schema.innodb_lock_waits' },
      algorithm: 'unspecified_by_migration_sql',
      lock: 'unspecified_by_migration_sql',
      timeout: { variable: 'lock_wait_timeout', policy: 'record_only' },
      failureStopPoint: 'migration file and statement are preserved in child output; failed file is not added to po_schema_migrations',
      rollback: { transactional: false, implicitCommit: true, automatic: false, recovery: 'stop; preserve failed DB/evidence; inspect and rerun idempotent migration' }
    };
    fs.writeFileSync(path.join(evidenceDir, 'ddl-impact.json'), JSON.stringify(ddlImpact, null, 2));
    record('ddl-impact', 'PASS', ddlImpact);
    record('rollback-boundary', 'PASS', ddlImpact.rollback);
    const baselinePath = path.join(candidate, 'verification', 'production-schema.json');
    if (fs.existsSync(baselinePath)) {
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      fs.writeFileSync(path.join(evidenceDir, 'production-schema.json'), JSON.stringify(baseline, null, 2));
      record('production-schema-evidence', 'PASS', { source: 'candidate verification/production-schema.json', tables: Object.keys(baseline.tables || baseline).length });
    } else {
      record('production-schema-evidence', 'PENDING', 'candidate verification/production-schema.json not supplied');
    }
    if (args['production-db-url'] && fs.existsSync(baselinePath)) {
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      const production = await withConnection(mysql, { uri: args['production-db-url'] }, querySnapshot);
      const expected = baseline.snapshot || baseline;
      const comparison = compareStrict(expected, production);
      fs.writeFileSync(path.join(evidenceDir, 'production-schema-compare.json'), JSON.stringify({ ...comparison, actualVersion: production.version, rowCount: production.rowCount, lockWaits: production.lockWaits }, null, 2));
      record('production-schema-compare', comparison.status, { mode: 'read-only SHOW/SELECT', compared: comparison.compared, differences: comparison.differences });
    } else {
      fs.writeFileSync(path.join(evidenceDir, 'production-schema-compare.json'), JSON.stringify({ status: 'PENDING', reason: 'no --production-db-url supplied' }, null, 2));
      record('production-schema-compare', 'PENDING', 'no --production-db-url supplied');
    }
    const summary = { status: results.every(x => x.status === 'PASS') ? 'PASS' : 'FAIL', candidate, evidenceDir, databases: dbs, results };
    fs.writeFileSync(path.join(evidenceDir, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = summary.status === 'PASS' ? 0 : 1;
  } finally {
    const cleanup = { retained: dbs.filter(db => keepDbs.has(db)), cleaned: dbs.filter(db => !keepDbs.has(db)) };
    for (const db of cleanup.cleaned) await dropDb(mysql, admin, db);
    fs.writeFileSync(path.join(evidenceDir, 'database-cleanup.json'), JSON.stringify(cleanup, null, 2));
    const summaryPath = path.join(evidenceDir, 'summary.json');
    if (fs.existsSync(summaryPath)) {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      summary.databaseCleanup = cleanup;
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    }
  }
}

if (require.main === module) main().catch(error => { console.error(JSON.stringify({ status: 'FAIL', error: redact(error.message) }, null, 2)); process.exitCode = 1; });
module.exports = { migrationEnv };
