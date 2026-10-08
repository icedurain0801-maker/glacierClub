'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
const { runSnapshotExecutor } = require('../server/src/db/snapshotExecutor');
const { snapshotManifest } = require('../server/src/db/snapshotManifest');

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.resolve(projectRoot, '../..', '.temp/po-closeout-20261008');
const bin = 'C:/xampp/mysql/bin';
const port = 43317;
const serverId = 20261017;
const sourceDb = 'po_executor_source';
const restoreDb = 'po_executor_restore';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const failure = code => Object.assign(new Error(code), { code });
const expectedInventory = Object.freeze({
  tables: ['empty_items', 'items', 'pairs'],
  objects: [
    { type: 'SCHEMA', name: '__database__' },
    { type: 'TABLE', name: 'empty_items' },
    { type: 'TABLE', name: 'items' },
    { type: 'TABLE', name: 'pairs' },
    { type: 'VIEW', name: 'v_items' },
    { type: 'TRIGGER', name: 'trg_items_before' },
    { type: 'PROCEDURE', name: 'p_count_items' },
    { type: 'FUNCTION', name: 'f_one' },
    { type: 'EVENT', name: 'ev_noop' }
  ]
});

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function portIsFree() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(port, '127.0.0.1', resolve));
  await new Promise(resolve => probe.close(resolve));
}
async function runInit(dataDir, evidenceDir) {
  const output = fs.openSync(path.join(evidenceDir, 'init.stdout'), 'wx');
  const error = fs.openSync(path.join(evidenceDir, 'init.stderr'), 'wx');
  try {
    const child = spawn(path.join(bin, 'mysql_install_db.exe'), [`--datadir=${dataDir}`, `--port=${port}`], {
      windowsHide: true, shell: false, stdio: ['ignore', output, error],
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: `C:/Windows/System32;${bin}` }
    });
    let timer;
    const closed = new Promise(resolve => {
      child.once('error', () => resolve({ type: 'start_failed' }));
      child.once('close', code => resolve({ type: 'closed', code }));
    });
    const outcome = await Promise.race([
      closed,
      new Promise(resolve => { timer = setTimeout(() => resolve({ type: 'timeout' }), 60000); })
    ]).finally(() => clearTimeout(timer));
    if (outcome.type === 'start_failed') throw failure('INIT_START_FAILED');
    if (outcome.type === 'timeout') {
      child.kill();
      let stopTimer;
      const stopped = await Promise.race([
        closed,
        new Promise(resolve => { stopTimer = setTimeout(() => resolve({ type: 'stop_unconfirmed' }), 5000); })
      ]).finally(() => clearTimeout(stopTimer));
      if (stopped.type !== 'closed') throw failure('INIT_STOP_UNCONFIRMED');
      throw failure('INIT_TIME_LIMIT');
    }
    if (outcome.code !== 0) throw failure('INIT_FAILED');
  } finally { fs.closeSync(output); fs.closeSync(error); }
}
async function connect(database) {
  return mysql.createConnection({
    host: '127.0.0.1', port, user: 'root', ...(database ? { database } : {}),
    charset: 'utf8mb4', timezone: 'Z', dateStrings: true,
    supportBigNumbers: true, bigNumberStrings: true, connectTimeout: 5000
  });
}
async function createFixture(connection) {
  for (const database of [sourceDb, restoreDb]) {
    await connection.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
  }
  await connection.changeUser({ database: sourceDb });
  await connection.query('CREATE TABLE items (id INT PRIMARY KEY, body VARCHAR(100) NOT NULL, payload VARBINARY(8) NOT NULL, occurred_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
  await connection.query('CREATE TABLE pairs (group_id INT NOT NULL, item_id VARCHAR(12) NOT NULL, PRIMARY KEY (group_id,item_id)) ENGINE=InnoDB');
  await connection.query('CREATE TABLE empty_items (id INT AUTO_INCREMENT PRIMARY KEY, payload BLOB) ENGINE=InnoDB');
  await connection.query('ALTER TABLE empty_items AUTO_INCREMENT=100');
  await connection.query("CREATE TRIGGER trg_items_before BEFORE INSERT ON items FOR EACH ROW SET NEW.body = COALESCE(NEW.body, '')");
  await connection.query('CREATE VIEW v_items AS SELECT id, body FROM items');
  await connection.query('CREATE PROCEDURE p_count_items() SELECT COUNT(*) FROM items');
  await connection.query('CREATE FUNCTION f_one() RETURNS INT DETERMINISTIC RETURN 1');
  await connection.query('CREATE EVENT ev_noop ON SCHEDULE EVERY 1 DAY DISABLE DO SET @po_executor_e2e = 1');
  await connection.query('INSERT INTO items VALUES (?,?,?,?)', [1, '冰川 Unicode Ω', Buffer.from([0, 255, 1]), '2026-10-08 00:00:00.001']);
  await connection.query('INSERT INTO pairs VALUES (1,?),(1,?)', ['a', 'b']);
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--isolated') throw failure('PRODUCTION_EXECUTION_DISABLED');
  await portIsFree();
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const space = fs.statfsSync(evidenceRoot);
  if (space.bavail * space.bsize < 8 * 1024 * 1024 * 1024) throw failure('ISOLATED_SPACE_PRECHECK_FAILED');
  const evidenceDir = fs.mkdtempSync(path.join(evidenceRoot, 'snapshot-executor-isolated-'));
  const dataDir = path.join(evidenceDir, 'data');
  let server, serverClosed = false, serverClosePromise = Promise.resolve();
  let logFd, control, identityVerified = false;
  let outcome = { status: 'NO_GO', code: 'NOT_STARTED' };
  try {
    await runInit(dataDir, evidenceDir);
    logFd = fs.openSync(path.join(evidenceDir, 'server.log'), 'wx');
    server = spawn(path.join(bin, 'mysqld.exe'), [
      '--no-defaults', '--basedir=C:/xampp/mysql', `--datadir=${dataDir}`,
      '--bind-address=127.0.0.1', `--port=${port}`, `--server-id=${serverId}`,
      '--skip-log-bin', '--event-scheduler=OFF', '--max-allowed-packet=64M'
    ], { windowsHide: true, shell: false, stdio: ['ignore', logFd, logFd] });
    let serverSpawnError = false;
    server.once('error', () => { serverSpawnError = true; });
    serverClosePromise = new Promise(resolve => server.once('close', () => { serverClosed = true; resolve(); }));
    for (let attempt = 0; attempt < 100; attempt++) {
      try { control = await connect(); break; }
      catch {
        if (serverSpawnError || server.exitCode !== null) throw failure('ISOLATED_SERVER_START_FAILED');
        await sleep(200);
      }
    }
    if (!control) throw failure('ISOLATED_SERVER_UNAVAILABLE');
    const [[identity]] = await control.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,VERSION() AS version');
    if (Number(identity.port) !== port || Number(identity.serverId) !== serverId ||
      path.resolve(identity.datadir).toLowerCase() !== path.resolve(dataDir).toLowerCase() ||
      identity.version !== '10.4.14-MariaDB') throw failure('ISOLATED_IDENTITY_MISMATCH');
    identityVerified = true;
    await createFixture(control);
    const result = await runSnapshotExecutor({
      mode: 'isolated', target: { host: '127.0.0.1', port, serverId, datadir: dataDir, version: identity.version },
      sourceDb, restoreDb, expectedInventory, evidenceDir, connect,
      tools: { dumpExecutable: path.join(bin, 'mysqldump.exe'), restoreExecutable: path.join(bin, 'mysql.exe') },
      chunkSize: 2, minFreeBytes: 4 * 1024 * 1024 * 1024,
      maxLockMs: 60000, maxRestoreMs: 60000
    });
    if (result.status !== 'RESTORE_VERIFIED') throw failure(result.code);
    const source = await connect(sourceDb);
    const restored = await connect(restoreDb);
    let dataDiffRejected, objectDiffRejected;
    try {
      const baseline = await snapshotManifest(source, source.connection, { chunkSize: 2 });
      await restored.query("UPDATE items SET body='changed' WHERE id=1");
      const dataChanged = await snapshotManifest(restored, restored.connection, { chunkSize: 2 });
      dataDiffRejected = JSON.stringify(baseline.tables) !== JSON.stringify(dataChanged.tables);
      await restored.query("UPDATE items SET body='冰川 Unicode Ω' WHERE id=1");
      await restored.query('ALTER TABLE pairs ADD INDEX idx_item (item_id)');
      const objectChanged = await snapshotManifest(restored, restored.connection, { chunkSize: 2 });
      objectDiffRejected = JSON.stringify(baseline.objects) !== JSON.stringify(objectChanged.objects);
    } finally { await source.end(); await restored.end(); }
    if (!dataDiffRejected || !objectDiffRejected) throw failure('MUTATION_NOT_DETECTED');
    outcome = {
      status: 'PASS_ISOLATED_EXECUTOR_E2E', code: 'MATCH_AND_MUTATIONS_REJECTED',
      productionTouched: false, targetPort: port, serverId,
      tableCount: expectedInventory.tables.length, objectCount: expectedInventory.objects.length,
      lockHeldMs: result.lockHeldMs, dumpBytes: result.dumpBytes, dumpSha256: result.dumpSha256,
      dataDiffRejected, objectDiffRejected, cleanupConfirmed: result.cleanupConfirmed,
      scriptSha256: await hashFile(__filename),
      executorSha256: await hashFile(path.join(projectRoot, 'server/src/db/snapshotExecutor.js')),
      gateSha256: await hashFile(path.join(projectRoot, 'server/src/db/snapshotGate.js')),
      manifestSha256: await hashFile(path.join(projectRoot, 'server/src/db/snapshotManifest.js'))
    };
  } catch (error) {
    outcome = { status: 'NO_GO_ISOLATED_EXECUTOR', code: /^[A-Z][A-Z0-9_]+$/.test(String(error?.code || '')) ? error.code : 'ISOLATED_EXECUTOR_FAILED', productionTouched: false };
  } finally {
    if (control) {
      if (identityVerified) { try { await control.query('SHUTDOWN'); } catch {} }
      await control.end().catch(() => {});
    }
    if (server) {
      await Promise.race([serverClosePromise, sleep(3000)]);
      if (!serverClosed) server.kill();
      await Promise.race([serverClosePromise, sleep(3000)]);
    }
    if (logFd !== undefined) fs.closeSync(logFd);
    const portReleased = await portIsFree().then(() => true, () => false);
    outcome.serverStopped = serverClosed;
    outcome.portReleased = portReleased;
    outcome.evidenceDir = evidenceDir;
    if (!serverClosed || !portReleased) { outcome.status = 'NO_GO_ISOLATED_EXECUTOR'; outcome.code = 'ISOLATED_CLEANUP_UNCONFIRMED'; }
    fs.writeFileSync(path.join(evidenceDir, 'result.json'), JSON.stringify(outcome, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify(outcome) + '\n');
  }
  if (outcome.status !== 'PASS_ISOLATED_EXECUTOR_E2E') process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ status: 'NO_GO_ISOLATED_EXECUTOR', code: /^[A-Z][A-Z0-9_]+$/.test(String(error?.code || '')) ? error.code : 'PREFLIGHT_FAILED', productionTouched: false }) + '\n');
  process.exitCode = 1;
});
