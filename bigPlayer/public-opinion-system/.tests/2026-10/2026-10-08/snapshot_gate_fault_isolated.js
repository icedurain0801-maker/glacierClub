'use strict';

// Failure-only rehearsal: independent local MariaDB instance for every case.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
const { runSnapshotGate } = require('../../../server/src/db/snapshotGate');
const { snapshotManifest } = require('../../../server/src/db/snapshotManifest');

const projectRoot = path.resolve(__dirname, '../../..');
const evidenceRoot = path.resolve(projectRoot, '../..', '.temp/po-closeout-20261008');
const bin = 'C:/xampp/mysql/bin';
const port = 43316;
const serverId = 20261016;
const sourceDb = 'po_gate_source';
const restoreDb = 'po_gate_restore';
const sha = 'a'.repeat(64);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const expectedInventory = Object.freeze({
  tables: ['gate_items'],
  objects: [{ type: 'SCHEMA', name: '__database__' }, { type: 'TABLE', name: 'gate_items' }]
});

function failure(code) { const error = new Error(code); error.code = code; return error; }
async function portIsFree() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(port, '127.0.0.1', resolve));
  await new Promise(resolve => probe.close(resolve));
}
async function fileSha256(file) {
  const hash = require('node:crypto').createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function runTool(executable, args, outputPath, errorPath) {
  const output = fs.openSync(outputPath, 'wx');
  const error = fs.openSync(errorPath, 'wx');
  try {
    const child = spawn(path.join(bin, executable), args, {
      windowsHide: true,
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: `C:/Windows/System32;${bin}` },
      stdio: ['ignore', output, error]
    });
    return await new Promise((resolve, reject) => {
      let settled = false;
      let stopTimer;
      const finish = (code, exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(stopTimer);
        if (code) reject(failure(code)); else resolve(exitCode);
      };
      const timer = setTimeout(() => {
        child.kill();
        stopTimer = setTimeout(() => finish('INIT_STOP_FAILED'), 5000);
      }, 60000);
      child.once('error', () => finish('INIT_START_FAILED'));
      child.once('close', exitCode => finish(null, exitCode));
    });
  } finally { fs.closeSync(output); fs.closeSync(error); }
}
async function connect(database) {
  return mysql.createConnection({
    host: '127.0.0.1', port, user: 'root', database,
    charset: 'utf8mb4', dateStrings: true, supportBigNumbers: true,
    bigNumberStrings: true, timezone: 'Z'
  });
}
async function independentInventory(connection) {
  const [tables] = await connection.query('SELECT table_name,table_type FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY table_name');
  const [triggers] = await connection.query('SELECT trigger_name AS name FROM information_schema.triggers WHERE trigger_schema=DATABASE() ORDER BY trigger_name');
  const [routines] = await connection.query('SELECT routine_name AS name,routine_type AS type FROM information_schema.routines WHERE routine_schema=DATABASE() ORDER BY routine_type,routine_name');
  const [events] = await connection.query('SELECT event_name AS name FROM information_schema.events WHERE event_schema=DATABASE() ORDER BY event_name');
  const objects = [{ type: 'SCHEMA', name: '__database__' }];
  for (const item of tables) objects.push({ type: item.table_type === 'VIEW' ? 'VIEW' : 'TABLE', name: item.table_name });
  for (const item of triggers) objects.push({ type: 'TRIGGER', name: item.name });
  for (const item of routines) objects.push({ type: item.type, name: item.name });
  for (const item of events) objects.push({ type: 'EVENT', name: item.name });
  return { tables: tables.filter(item => item.table_type === 'BASE TABLE').map(item => item.table_name), objects };
}

async function runCase(caseName) {
  await portIsFree();
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const evidenceDir = fs.mkdtempSync(path.join(evidenceRoot, `snapshot-gate-fault-${caseName}-`));
  const dataDir = path.join(evidenceDir, 'data');
  let stage = 'INIT';
  let server, serverLogFd, control, ownerConnection, watcherConnection, measure, recovered, blocker;
  let serverSpawnError = false;
  let serverClosed = false;
  let serverClosePromise = Promise.resolve();
  let identityVerified = false;
  let helper, helperClosed = true, helperClosePromise = Promise.resolve();
  let lockSqlErrno = null;
  let blockerConnectionId = null;
  let blockerQuery, blockerQueryRunning = false, blockerQueryRunningAtGateResult = false;
  let result = { status: 'NO_GO', code: 'NOT_STARTED' };
  let scenarioVerified = false;
  try {
    const initExit = await runTool('mysql_install_db.exe', [`--datadir=${dataDir}`, `--port=${port}`],
      path.join(evidenceDir, 'init.stdout'), path.join(evidenceDir, 'init.stderr'));
    if (initExit !== 0) throw failure('INIT_FAILED');
    stage = 'START';
    serverLogFd = fs.openSync(path.join(evidenceDir, 'server.log'), 'wx');
    server = spawn(path.join(bin, 'mysqld.exe'), [
      '--no-defaults', '--basedir=C:/xampp/mysql', `--datadir=${dataDir}`,
      '--bind-address=127.0.0.1', `--port=${port}`, `--server-id=${serverId}`,
      '--skip-log-bin', '--event-scheduler=OFF'
    ], { windowsHide: true, stdio: ['ignore', serverLogFd, serverLogFd] });
    server.once('error', () => { serverSpawnError = true; });
    serverClosePromise = new Promise(resolve => server.once('close', () => { serverClosed = true; resolve(); }));
    for (let attempt = 0; attempt < 100; attempt++) {
      try { control = await connect(); break; }
      catch {
        if (serverSpawnError) throw failure('SERVER_START_FAILED');
        if (server.exitCode !== null) throw failure('SERVER_EXITED');
        await sleep(200);
      }
    }
    if (!control) throw failure('SERVER_UNAVAILABLE');
    const [[identity]] = await control.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,VERSION() AS version');
    if (Number(identity.port) !== port || Number(identity.serverId) !== serverId ||
      path.resolve(identity.datadir).toLowerCase() !== path.resolve(dataDir).toLowerCase() ||
      identity.version !== '10.4.14-MariaDB') throw failure('IDENTITY_MISMATCH');
    identityVerified = true;
    stage = 'FIXTURE';
    await control.query(`CREATE DATABASE ${sourceDb} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await control.query(`CREATE DATABASE ${restoreDb} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await control.query(`CREATE TABLE ${sourceDb}.gate_items (id INT PRIMARY KEY, body VARCHAR(32) NOT NULL) ENGINE=InnoDB`);
    await control.query(`CREATE TABLE ${restoreDb}.gate_items (id INT PRIMARY KEY, body VARCHAR(32) NOT NULL) ENGINE=InnoDB`);
    await control.query(`INSERT INTO ${sourceDb}.gate_items VALUES (1,'synthetic')`);
    await control.query(`INSERT INTO ${restoreDb}.gate_items VALUES (1,?)`, [caseName === 'restore_mismatch' ? 'changed' : 'synthetic']);
    ownerConnection = await connect(sourceDb);
    watcherConnection = await connect();
    measure = await connect(sourceDb);
    recovered = await connect(restoreDb);
    if (caseName === 'lock_contention') {
      blocker = await connect(sourceDb);
      await blocker.query('LOCK TABLES gate_items WRITE');
    } else if (caseName === 'long_transaction_contention') {
      blocker = await connect(sourceDb);
      const [[identity]] = await blocker.query('SELECT CONNECTION_ID() AS connectionId');
      blockerConnectionId = identity.connectionId;
      await blocker.beginTransaction();
      blockerQuery = blocker.query('UPDATE gate_items SET body=CONCAT(body, SLEEP(6)) WHERE id=1');
      for (let attempt = 0; attempt < 50; attempt++) {
        const [rows] = await control.query('SELECT INFO FROM information_schema.PROCESSLIST WHERE ID=?', [blockerConnectionId]);
        if (rows[0]?.INFO?.includes('UPDATE gate_items SET body=CONCAT(body, SLEEP(6))')) { blockerQueryRunning = true; break; }
        await sleep(20);
      }
      if (!blockerQueryRunning) throw failure('LONG_TRANSACTION_NOT_RUNNING');
    }
    const owner = {
      query: async (...args) => {
        try { return await ownerConnection.query(...args); }
        catch (error) {
          if (args[0] === 'FLUSH TABLES WITH READ LOCK' && Number.isInteger(error?.errno)) lockSqlErrno = error.errno;
          throw error;
        }
      },
      destroy: () => ownerConnection.connection.destroy()
    };
    let spaceChecks = 0;
    const callbacks = {
      owner,
      watcher: watcherConnection,
      expectedInventory,
      inventory: async () => independentInventory(measure),
      sourceManifest: async () => {
        const manifest = await snapshotManifest(measure, measure.connection, { chunkSize: 2 });
        if (caseName === 'owner_disconnect') {
          owner.destroy();
          await sleep(50);
        }
        return manifest;
      },
      dump: async ({ signal }) => {
        if (caseName === 'lock_contention' || caseName === 'long_transaction_contention' || caseName === 'dump_nonzero') return { exitCode: 1, artifactId: 'synthetic-artifact', bytes: 100, sha256: sha, warnings: false };
        if (caseName === 'interrupt_cleanup') {
          helperClosed = false;
          helper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
          helper.once('error', () => { helperClosed = true; });
          helperClosePromise = new Promise(resolve => helper.once('close', () => { helperClosed = true; resolve(); }));
          await new Promise((_, reject) => {
            if (signal.aborted) { helper.kill(); reject(failure('HELPER_ABORTED')); return; }
            signal.addEventListener('abort', () => { helper.kill(); reject(failure('HELPER_ABORTED')); }, { once: true });
          });
        }
        return { exitCode: 0, artifactId: 'synthetic-artifact', bytes: 100, sha256: sha, warnings: false };
      },
      verifyArtifact: async () => ({ bytes: 100, sha256: sha }),
      restore: async () => ({ exitCode: 0, errors: false }),
      restoredManifest: async () => snapshotManifest(recovered, recovered.connection, { chunkSize: 2 }),
      checkSpace: async () => {
        spaceChecks++;
        return caseName !== 'space_threshold' || spaceChecks !== 2;
      },
      cleanup: async () => {
        if (helper) {
          if (!helperClosed) helper.kill();
          await Promise.race([helperClosePromise, sleep(3000)]);
        }
        return { processesExited: helperClosed };
      },
      lockWaitSeconds: 1,
      maxLockMs: caseName === 'interrupt_cleanup' ? 300 : 5000,
      maxRestoreMs: 5000,
      maxCleanupMs: 5000,
      watchdogIntervalMs: 25,
      watchdogQueryMs: 500
    };
    stage = 'GATE';
    result = await runSnapshotGate(callbacks);
    if (caseName === 'long_transaction_contention') {
      const [rows] = await control.query('SELECT INFO FROM information_schema.PROCESSLIST WHERE ID=?', [blockerConnectionId]);
      blockerQueryRunningAtGateResult = Boolean(rows[0]?.INFO?.includes('UPDATE gate_items SET body=CONCAT(body, SLEEP(6))'));
      scenarioVerified = result.status === 'NO_GO' && blockerQueryRunningAtGateResult &&
        (result.code === 'LOCK_ACQUIRE_TIMEOUT' || (result.code === 'LOCK_ACQUIRE_FAILED' && lockSqlErrno === 1205));
    } else if (caseName === 'lock_contention') {
      scenarioVerified = result.status === 'NO_GO' &&
        (result.code === 'LOCK_ACQUIRE_TIMEOUT' || (result.code === 'LOCK_ACQUIRE_FAILED' && lockSqlErrno === 1205));
    } else {
      const expectedCode = {
        owner_disconnect: 'LOCK_OWNER_LOST', dump_nonzero: 'DUMP_INVALID',
        space_threshold: 'SPACE_THRESHOLD', restore_mismatch: 'RESTORE_MISMATCH',
        interrupt_cleanup: 'LOCK_TIME_LIMIT'
      }[caseName];
      scenarioVerified = result.status === 'NO_GO' && result.code === expectedCode &&
        (caseName !== 'interrupt_cleanup' || helperClosed);
    }
  } catch (error) {
    result = { status: 'NO_GO', code: /^[A-Z][A-Z0-9_]+$/.test(String(error?.code || '')) ? error.code : 'SCENARIO_FAILED' };
  } finally {
    if (helper && !helperClosed) {
      helper.kill();
      await Promise.race([helperClosePromise, sleep(3000)]);
    }
    if (blocker) {
      if (blockerQuery) await blockerQuery.catch(() => {});
      if (caseName === 'lock_contention') await blocker.query('UNLOCK TABLES').catch(() => {});
      if (caseName === 'long_transaction_contention') await blocker.rollback().catch(() => {});
      await blocker.end().catch(() => {});
    }
    for (const connection of [recovered, measure, watcherConnection, ownerConnection]) {
      if (connection) await connection.end().catch(() => {});
    }
    if (control) {
      if (identityVerified) { try { await control.query('SHUTDOWN'); } catch {} }
      await control.end().catch(() => {});
    }
    if (server) {
      await Promise.race([serverClosePromise, sleep(3000)]);
      if (!serverClosed && !serverSpawnError) server.kill();
      await Promise.race([serverClosePromise, sleep(3000)]);
    }
    if (serverLogFd !== undefined) fs.closeSync(serverLogFd);
  }
  const portReleased = await portIsFree().then(() => true, () => false);
  const summary = {
    case: caseName,
    status: result.status,
    code: result.code,
    verified: scenarioVerified && serverClosed && portReleased && helperClosed,
    serverStopped: serverClosed,
    portReleased,
    helperExited: helperClosed,
    contentionMechanism: caseName === 'lock_contention' ? 'explicit_table_write_lock' :
      caseName === 'long_transaction_contention' ? 'active_write_in_open_transaction' : null,
    blockerConnectionId,
    blockerQueryRunning,
    blockerQueryRunningAtGateResult,
    lockSqlErrno,
    stage,
    evidenceDir,
    scriptSha256: await fileSha256(__filename),
    snapshotGateSha256: await fileSha256(path.join(projectRoot, 'server/src/db/snapshotGate.js')),
    snapshotManifestSha256: await fileSha256(path.join(projectRoot, 'server/src/db/snapshotManifest.js'))
  };
  fs.writeFileSync(path.join(evidenceDir, 'result.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
  return summary;
}

async function main() {
  const cases = ['lock_contention', 'long_transaction_contention', 'owner_disconnect', 'dump_nonzero', 'space_threshold', 'restore_mismatch', 'interrupt_cleanup'];
  const results = [];
  for (const name of cases) results.push(await runCase(name));
  const incomplete = results.filter(item => !item.verified);
  const summary = {
    status: incomplete.length ? 'NO_GO_ISOLATED_FAULTS_INCOMPLETE' : 'PASS_ISOLATED_FAULTS',
    productionTouched: false,
    longTransactionBlocking: results.find(item => item.case === 'long_transaction_contention')?.verified ? 'VERIFIED_ISOLATED' : 'NOT_VERIFIED',
    targetPort: port,
    serverId,
    scenarios: results,
    scriptSha256: await fileSha256(__filename),
    snapshotGateSha256: await fileSha256(path.join(projectRoot, 'server/src/db/snapshotGate.js')),
    snapshotManifestSha256: await fileSha256(path.join(projectRoot, 'server/src/db/snapshotManifest.js'))
  };
  process.stdout.write(JSON.stringify(summary) + '\n');
  if (incomplete.length) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ status: 'NO_GO_ISOLATED_FAULTS', code: /^[A-Z][A-Z0-9_]+$/.test(String(error?.code || '')) ? error.code : 'FAULT_REHEARSAL_FAILED', productionTouched: false }) + '\n');
  process.exitCode = 1;
});
