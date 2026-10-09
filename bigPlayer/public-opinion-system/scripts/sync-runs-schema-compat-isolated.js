'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const { Repository } = require('../server/src/db/repository');

const port = 43321;
const serverId = 20261021;
const bin = 'C:/xampp/mysql/bin';
const database = 'po_sync_run_compat_fixture';
const evidenceRoot = path.resolve(__dirname, '../..', '../.temp/sync-runs-compat-20261009');
const missingColumns = ['community_id', 'board_id', 'board_name', 'run_scope', 'site_url_snapshot', 'last_request_at'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fail = code => Object.assign(new Error(code), { code });
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

async function portFree() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(port, '127.0.0.1', resolve));
  await new Promise(resolve => probe.close(resolve));
}

async function connect(user = 'root', password = '', db) {
  return mysql.createConnection({ host: '127.0.0.1', port, user, password, ...(db ? { database: db } : {}), connectTimeout: 3000, timezone: 'Z', dateStrings: true });
}

async function ownsInstance(control, dataDir, pidFile, childPid) {
  const [[row]] = await control.query('SELECT @@port AS port, @@server_id AS server_id, @@datadir AS datadir, @@pid_file AS pid_file, VERSION() AS version');
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  return Number(row.port) === port && Number(row.server_id) === serverId && samePath(row.datadir, dataDir)
    && samePath(row.pid_file, pidFile) && pid === childPid && /mariadb/i.test(row.version);
}

async function createFixture(control) {
  await control.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
  await control.changeUser({ database });
  const ddl = [
    'CREATE TABLE po_games (id VARCHAR(40) PRIMARY KEY, name VARCHAR(80), region_code VARCHAR(20))',
    'CREATE TABLE po_communities (id VARCHAR(40) PRIMARY KEY, name VARCHAR(80), status VARCHAR(20))',
    'CREATE TABLE po_sources (id VARCHAR(40) PRIMARY KEY, display_name VARCHAR(80))',
    'CREATE TABLE po_accounts (id VARCHAR(40) PRIMARY KEY, source_id VARCHAR(40), game_id VARCHAR(40), community_id VARCHAR(40), platform VARCHAR(40), platform_account_id VARCHAR(40), account_name VARCHAR(80))',
    'CREATE TABLE po_sync_runs (id VARCHAR(40) PRIMARY KEY, account_id VARCHAR(40), parent_run_id VARCHAR(40), site_id VARCHAR(40), trigger_type VARCHAR(40), window_start DATETIME(3), window_end DATETIME(3), status VARCHAR(40), sync_mode VARCHAR(40), requested_at DATETIME(3), created_at DATETIME(3), started_at DATETIME(3), finished_at DATETIME(3), discovered_count INT, stored_count INT, fetched_count INT, inserted_count INT, changed_count INT, unchanged_count INT, comment_count INT, error_code VARCHAR(80), error_message TEXT)',
    'CREATE TABLE po_sync_run_contents (run_id VARCHAR(40), content_id VARCHAR(40), sync_scope VARCHAR(20))'
  ];
  for (const sql of ddl) await control.query(sql);
  await control.query("INSERT INTO po_games VALUES ('game-fixture','Fixture','domestic')");
  await control.query("INSERT INTO po_communities VALUES ('community-fixture','Fixture','enabled')");
  await control.query("INSERT INTO po_sources VALUES ('source-fixture','Fixture')");
  await control.query("INSERT INTO po_accounts VALUES ('account-fixture','source-fixture','game-fixture','community-fixture','bigplayer_h5','fixture','Fixture')");
  const runSql = "INSERT INTO po_sync_runs (id,account_id,parent_run_id,site_id,trigger_type,window_start,window_end,status,sync_mode,requested_at,created_at,started_at,finished_at,discovered_count,stored_count,fetched_count,inserted_count,changed_count,unchanged_count,comment_count) VALUES (?,?,?,?,?,'2026-10-08 00:00:00.000','2026-10-09 00:00:00.000','completed','incremental','2026-10-08 01:00:00.000','2026-10-08 01:00:00.000','2026-10-08 01:00:00.000','2026-10-08 01:05:00.000',1,1,1,1,0,0,0)";
  await control.query(runSql, ['parent-fixture', 'account-fixture', null, null, 'scheduled']);
  await control.query(runSql, ['child-fixture', 'account-fixture', 'parent-fixture', 'site-fixture', 'scheduled_site']);
  const [columns] = await control.query("SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='po_sync_runs'");
  if (columns.some(row => missingColumns.includes(String(row.name).toLowerCase()))) throw fail('FIXTURE_SCHEMA_HAS_NEW_COLUMNS');
  let oldQueryFailed = false;
  try { await control.query('SELECT r.community_id FROM po_sync_runs r LIMIT 1'); }
  catch (error) { oldQueryFailed = error.code === 'ER_BAD_FIELD_ERROR'; }
  if (!oldQueryFailed) throw fail('FIXTURE_OLD_QUERY_DID_NOT_FAIL');
  return { tableCount: ddl.length, runColumnCount: columns.length, oldQueryErrorCode: 'ER_BAD_FIELD_ERROR' };
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--isolated') throw fail('PRODUCTION_EXECUTION_DISABLED');
  await portFree();
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const evidenceDir = fs.mkdtempSync(path.join(evidenceRoot, 'mariadb-'));
  const dataDir = path.join(evidenceDir, 'data');
  const pidFile = path.join(evidenceDir, 'mysqld.pid');
  const resultFile = path.join(evidenceDir, 'result.json');
  const result = { status: 'NO_GO', isolated: true, productionTouched: false, host: '127.0.0.1', database, port, serverId, missingColumns, errorCode: null, serverStopped: false, portReleased: false };
  let server, control, repo, serverClosed, serverExitObserved = false;
  try {
    const init = spawnSync(path.join(bin, 'mysql_install_db.exe'), [`--datadir=${dataDir}`, `--port=${port}`], { timeout: 60000, encoding: 'utf8', windowsHide: true, shell: false, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: `C:/Windows/System32;${bin}` } });
    fs.writeFileSync(path.join(evidenceDir, 'init.stdout'), init.stdout || '');
    fs.writeFileSync(path.join(evidenceDir, 'init.stderr'), init.stderr || '');
    if (init.error || init.status !== 0) throw fail('ISOLATED_INIT_FAILED');
    const log = fs.openSync(path.join(evidenceDir, 'server.log'), 'wx');
    server = spawn(path.join(bin, 'mysqld.exe'), ['--no-defaults', '--basedir=C:/xampp/mysql', `--datadir=${dataDir}`, '--bind-address=127.0.0.1', `--port=${port}`, `--server-id=${serverId}`, `--pid-file=${pidFile}`, '--skip-log-bin', '--event-scheduler=OFF'], { windowsHide: true, shell: false, stdio: ['ignore', log, log] });
    fs.closeSync(log);
    serverClosed = new Promise(resolve => server.once('close', () => { serverExitObserved = true; resolve(); }));
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { control = await connect(); break; }
      catch { if (server.exitCode !== null) throw fail('ISOLATED_START_FAILED'); await sleep(200); }
    }
    if (!control || !await ownsInstance(control, dataDir, pidFile, server.pid)) throw fail('ISOLATED_IDENTITY_MISMATCH');
    result.fixture = await createFixture(control);
    const password = crypto.randomBytes(24).toString('hex');
    await control.query("CREATE USER 'po_sync_fixture_ro'@'127.0.0.1' IDENTIFIED BY ?", [password]);
    await control.query(`GRANT SELECT ON ${database}.* TO 'po_sync_fixture_ro'@'127.0.0.1'`);
    repo = new Repository({ DATABASE_URL: '', DB_HOST: '127.0.0.1', DB_PORT: port, DB_USER: 'po_sync_fixture_ro', DB_PASSWORD: password, DB_NAME: database, DB_POOL_SIZE: 1 });
    const [identity] = await repo.query('SELECT CURRENT_USER() AS identity');
    if (identity.identity !== 'po_sync_fixture_ro@127.0.0.1') throw fail('READONLY_IDENTITY_MISMATCH');
    const grants = await repo.query('SHOW GRANTS');
    const grantTexts = grants.flatMap(row => Object.values(row).map(String));
    result.grantCount = grantTexts.length;
    const isolatedSelect = /^GRANT SELECT ON `?po_sync_run_compat_fixture`?\.\* TO /i;
    const usageOnly = /^GRANT USAGE ON \*\.\* TO /i;
    if (!grantTexts.some(value => isolatedSelect.test(value)) || !grantTexts.every(value => isolatedSelect.test(value) || usageOnly.test(value))) throw fail('READONLY_GRANTS_MISMATCH');
    result.readOnlyIdentityVerified = true;
    const queryStarted = Date.now();
    const detail = await repo.getSyncRun('parent-fixture', { sourceId: 'source-fixture', regionCode: 'domestic', communityId: 'community-fixture' });
    const latest = await repo.getLatestSyncRunForSource('source-fixture');
    const listed = await repo.listSyncRuns({ sourceId: 'source-fixture', page: 1, pageSize: 20 });
    result.queryDurationMs = Date.now() - queryStarted;
    if (!detail || !latest || listed.total !== 2 || listed.items.length !== 2) throw fail('READ_CONTRACT_MISMATCH');
    for (const row of [detail, ...listed.items]) if (row.community_id !== 'community-fixture') throw fail('ACCOUNT_COMMUNITY_MISMATCH');
    for (const row of [detail, latest, ...listed.items]) {
      if (missingColumns.some(column => row[column === 'community_id' ? 'run_community_id' : column] !== null)) throw fail('COMPAT_ALIAS_MISMATCH');
      if (row.siteUrl !== null || row.lastRequestAt !== null || !row.run_role || !row.triggerType) throw fail('COMPAT_ROLE_MISMATCH');
    }
    result.status = 'PASS_ISOLATED_MARIADB_COMPAT';
    result.rows = { detail: 1, latest: 1, listed: listed.items.length, total: listed.total };
  } catch (error) {
    result.errorCode = error.code || 'ISOLATED_UNKNOWN_ERROR';
    throw error;
  } finally {
    if (repo) await repo.pool.end().catch(() => {});
    if (control) {
      try { if (server && await ownsInstance(control, dataDir, pidFile, server.pid)) await control.query('SHUTDOWN'); }
      catch { result.errorCode ||= 'ISOLATED_SHUTDOWN_FAILED'; }
      await control.end().catch(() => {});
    }
    if (server && serverClosed) {
      await Promise.race([serverClosed, sleep(5000)]);
      result.serverStopped = serverExitObserved;
    }
    try { await portFree(); result.portReleased = true; } catch { result.portReleased = false; }
    if (!result.serverStopped || !result.portReleased || result.errorCode) result.status = 'NO_GO';
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2) + '\n');
    process.stdout.write(`${resultFile}\n${result.status}\n`);
  }
}

main().catch(error => { process.stderr.write(`${error.code || 'ISOLATED_UNKNOWN_ERROR'}\n`); process.exitCode = 1; });
