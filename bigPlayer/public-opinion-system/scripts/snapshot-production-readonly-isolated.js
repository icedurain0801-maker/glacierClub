'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
const { assessProduction } = require('./snapshot-production-readonly');

const root = path.resolve(__dirname, '..');
const evidenceRoot = path.resolve(root, '../..', '.temp/po-closeout-20261008');
const bin = 'C:/xampp/mysql/bin';
const port = 43318;
const serverId = 20261018;
const user = 'po_snapshot_observer_lifecycle';
const database = 'public_opinion';
const dataDb = 'po_readonly_fixture';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const failure = code => Object.assign(new Error(code), { code });

async function portIsFree() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(port, '127.0.0.1', resolve));
  await new Promise(resolve => probe.close(resolve));
}

async function runInit(dataDir, evidenceDir) {
  const stdout = fs.openSync(path.join(evidenceDir, 'init.stdout'), 'wx');
  const stderr = fs.openSync(path.join(evidenceDir, 'init.stderr'), 'wx');
  try {
    const child = spawn(path.join(bin, 'mysql_install_db.exe'), [`--datadir=${dataDir}`, `--port=${port}`], {
      windowsHide: true, shell: false, stdio: ['ignore', stdout, stderr],
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: `C:/Windows/System32;${bin}` }
    });
    const closed = new Promise(resolve => {
      child.once('error', () => resolve({ type: 'error' }));
      child.once('close', code => resolve({ type: 'close', code }));
    });
    const outcome = await Promise.race([closed, sleep(60000).then(() => ({ type: 'timeout' }))]);
    if (outcome.type === 'timeout') {
      child.kill();
      const stopped = await Promise.race([closed, sleep(5000).then(() => ({ type: 'timeout' }))]);
      if (stopped.type !== 'close') throw failure('INIT_STOP_UNCONFIRMED');
      throw failure('INIT_TIME_LIMIT');
    }
    if (outcome.type !== 'close' || outcome.code !== 0) throw failure('INIT_FAILED');
  } finally { fs.closeSync(stdout); fs.closeSync(stderr); }
}

function connect(options = {}) {
  return mysql.createConnection({ host: '127.0.0.1', port, user: 'root', ...options,
    charset: 'utf8mb4', timezone: 'Z', dateStrings: true, connectTimeout: 5000 });
}

async function main() {
  await portIsFree();
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const evidenceDir = fs.mkdtempSync(path.join(evidenceRoot, 'snapshot-readonly-lifecycle-'));
  const dataDir = path.join(evidenceDir, 'data');
  let server;
  let serverClosed = false;
  let closePromise = Promise.resolve();
  let admin;
  let observer;
  let generatedPassword;
  let phase = 'INIT';
  const result = { status: 'NO_GO', productionTouched: false, port, serverId, user, phases: [] };
  try {
    await runInit(dataDir, evidenceDir);
    phase = 'START_SERVER';
    const logFd = fs.openSync(path.join(evidenceDir, 'server.log'), 'wx');
    server = spawn(path.join(bin, 'mysqld.exe'), [
      '--no-defaults', '--basedir=C:/xampp/mysql', `--datadir=${dataDir}`,
      '--bind-address=127.0.0.1', `--port=${port}`, `--server-id=${serverId}`,
      '--skip-log-bin', '--event-scheduler=OFF'
    ], { windowsHide: true, shell: false, stdio: ['ignore', logFd, logFd] });
    closePromise = new Promise(resolve => server.once('close', () => { serverClosed = true; resolve(); }));
    for (let attempt = 0; attempt < 100; attempt++) {
      try { admin = await connect(); break; } catch { await sleep(200); }
    }
    if (!admin) throw failure('ISOLATED_SERVER_UNAVAILABLE');
    phase = 'CREATE_DATABASES';
    await admin.query(`CREATE DATABASE ${database}`);
    await admin.query(`CREATE DATABASE ${dataDb}`);
    phase = 'CREATE_FIXTURE_TABLES';
    await admin.query(`CREATE TABLE ${database}.po_sync_runs (id INT PRIMARY KEY, status VARCHAR(20))`);
    await admin.query(`CREATE TABLE ${database}.po_source_schedule_state (id INT PRIMARY KEY, lease_until DATETIME(3))`);
    await admin.query(`CREATE TABLE ${database}.po_worker_leases (id INT PRIMARY KEY, lease_until DATETIME(3))`);
    await admin.query(`CREATE TABLE ${database}.po_worker_heartbeats (id INT PRIMARY KEY, last_seen_at DATETIME(3))`);
    phase = 'CREATE_USER';
    await admin.query(`CREATE USER '${user}'@'127.0.0.1' ACCOUNT LOCK`);
    result.phases.push('CREATE_LOCKED_USER');
    try {
      await connect({ user, database });
      throw failure('LOCKED_ACCOUNT_LOGIN_SUCCEEDED');
    } catch (error) {
      if (error.code === 'LOCKED_ACCOUNT_LOGIN_SUCCEEDED') throw error;
      result.phases.push('LOCKED_LOGIN_REJECTED');
    }
    phase = 'SET_PASSWORD';
    generatedPassword = crypto.randomBytes(32).toString('base64url');
    const passwordHash = `*${crypto.createHash('sha1').update(
      crypto.createHash('sha1').update(generatedPassword).digest()
    ).digest('hex').toUpperCase()}`;
    await admin.execute(`SET PASSWORD FOR '${user}'@'127.0.0.1' = ?`, [passwordHash]);
    phase = 'PASSWORD_EXPIRE';
    await admin.query(`ALTER USER '${user}'@'127.0.0.1' PASSWORD EXPIRE INTERVAL 1 DAY`);
    await admin.query(`ALTER USER '${user}'@'127.0.0.1' ACCOUNT UNLOCK`);
    result.phases.push('CREATE_USER');
    const env = {
      PO_READONLY_DB_HOST: '127.0.0.1', PO_READONLY_DB_PORT: String(port),
      PO_READONLY_DB_NAME: database, PO_READONLY_DB_USER: user, PO_READONLY_DB_PASSWORD: generatedPassword
    };
    observer = await connect({ user, password: generatedPassword, database });
    const [[session]] = await observer.query('SELECT CURRENT_USER() AS authenticatedUser,CURRENT_ROLE() AS activeRole');
    if (session.authenticatedUser !== `${user}@127.0.0.1` || session.activeRole !== null) throw failure('SESSION_IDENTITY_MISMATCH');
    phase = 'NEGATIVE_BEFORE_GRANT';
    const beforeGrant = await assessProduction({ env, isolated: true, connect: options => mysql.createConnection(options), intervalMs: 1,
      expectedIdentity: { hostname: 'localhost', port, serverId, version: '10.4.14-MariaDB' } });
    if (beforeGrant.code !== 'READONLY_GRANTS_NOT_MINIMAL') throw failure('NEGATIVE_GRANT_GATE_FAILED');
    result.phases.push('NEGATIVE_BEFORE_GRANT');
    phase = 'GRANT_MINIMAL';
    await admin.query(`GRANT SELECT ON \`${database}\`.* TO '${user}'@'127.0.0.1'`);
    await admin.query(`GRANT PROCESS ON *.* TO '${user}'@'127.0.0.1'`);
    phase = 'OBSERVE';
    const observed = await assessProduction({ env, isolated: true, connect: options => mysql.createConnection(options), intervalMs: 1,
      expectedIdentity: { hostname: 'localhost', port, serverId, version: '10.4.14-MariaDB' } });
    if (observed.code !== 'PRODUCTION_WINDOW_NOT_ADMITTED') throw failure('OBSERVATION_PHASE_FAILED');
    result.phases.push('OBSERVE_MINIMAL_GRANTS');
    phase = 'REVOKE_PROCESS';
    await admin.query(`REVOKE PROCESS ON *.* FROM '${user}'@'127.0.0.1'`);
    const afterRevoke = await assessProduction({ env, isolated: true, connect: options => mysql.createConnection(options), intervalMs: 1,
      expectedIdentity: { hostname: 'localhost', port, serverId, version: '10.4.14-MariaDB' } });
    if (afterRevoke.code !== 'READONLY_GRANTS_NOT_MINIMAL') throw failure('REVOKE_GATE_FAILED');
    result.phases.push('REVOKE_PROCESS');
    phase = 'DROP_USER';
    await admin.query(`DROP USER '${user}'@'127.0.0.1'`);
    result.phases.push('DROP_USER');
    result.status = 'PASS_ISOLATED_READONLY_LIFECYCLE';
  } finally {
    if (observer) await observer.end().catch(() => {});
    if (admin) {
      await admin.query(`DROP USER IF EXISTS '${user}'@'127.0.0.1'`).catch(() => {});
      await admin.query(`DROP DATABASE IF EXISTS ${database}`).catch(() => {});
      await admin.query(`DROP DATABASE IF EXISTS ${dataDb}`).catch(() => {});
      await admin.query('SHUTDOWN').catch(() => {});
      await admin.end().catch(() => {});
    }
    if (server) {
      await Promise.race([closePromise, sleep(3000)]);
      if (!serverClosed) server.kill();
      await Promise.race([closePromise, sleep(3000)]);
    }
    result.phase = phase;
    result.serverStopped = serverClosed;
    result.portReleased = await portIsFree().then(() => true, () => false);
    result.evidenceDir = evidenceDir;
    fs.writeFileSync(path.join(evidenceDir, 'result.json'), JSON.stringify({ ...result, password: undefined }, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify({ ...result, password: undefined }) + '\n');
  }
  if (result.status !== 'PASS_ISOLATED_READONLY_LIFECYCLE') process.exitCode = 1;
}

main().catch(error => {
  const code = error.code === 'ER_PARSE_ERROR' ? 'PASSWORD_INJECTION_UNSUPPORTED' : error.code || 'FAILED';
  process.stdout.write(JSON.stringify({ status: 'NO_GO_ISOLATED_READONLY_LIFECYCLE', code, productionTouched: false }) + '\n');
  process.exitCode = 1;
});
