'use strict';

// Artificial-data-only rehearsal. Never point this script at an existing server.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const mysql = require('mysql2/promise');
const { snapshotManifest } = require('../../../server/src/db/snapshotManifest');

const projectRoot = path.resolve(__dirname, '../../..');
const evidenceRoot = path.resolve(projectRoot, '../..', '.temp/po-closeout-20261008');
const bin = 'C:/xampp/mysql/bin';
const port = 43314;
const serverId = 20261015;
const sourceDb = 'po_manifest_source';
const restoreDb = 'po_manifest_restore';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const LOAD_ROWS = 1000000;
const LOAD_BATCH_SIZE = 1000;
const LOAD_PREFLIGHT_FREE_BYTES = 8 * 1024 * 1024 * 1024;
const LOAD_MIN_FREE_BYTES = 4 * 1024 * 1024 * 1024;
const LOAD_MAX_LOCK_MS = 180000;
const LOAD_MAX_INSERT_MS = 240000;
const RSS_BUDGET_BYTES = 512 * 1024 * 1024;
const HEAP_BUDGET_BYTES = 256 * 1024 * 1024;
const MAX_PACKET_BYTES = 64 * 1024 * 1024;
const LOAD_BLOB_BYTES = 1024 * 1024;

function availableBytes() {
  const space = fs.statfsSync(evidenceRoot);
  return space.bavail * space.bsize;
}
function loadMode() {
  if (process.argv.length === 2) return 0;
  if (process.argv.length === 3 && process.argv[2] === '--load-rows=1000000') return LOAD_ROWS;
  throw safeError('INVALID_LOAD_ARGUMENT');
}
async function withTimeout(promise, timeoutMs, onTimeout) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw safeError('TIME_LIMIT');
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          try { onTimeout(); } catch {}
          reject(safeError('TIME_LIMIT'));
        }, timeoutMs);
      })
    ]);
  } finally { clearTimeout(timer); }
}

function safeError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
async function portIsFree() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(port, '127.0.0.1', resolve));
  await new Promise(resolve => probe.close(resolve));
}
async function runTool(executable, args, inputPath, outputPath, errorPath, timeoutMs = 60000) {
  const descriptors = [];
  try {
    const input = inputPath ? fs.openSync(inputPath, 'r') : 'ignore';
    if (inputPath) descriptors.push(input);
    const output = fs.openSync(outputPath, 'wx');
    const error = fs.openSync(errorPath, 'wx');
    descriptors.push(output, error);
    const child = spawn(path.join(bin, executable), args, {
      windowsHide: true,
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: `C:/Windows/System32;${bin}` },
      stdio: [input, output, error]
    });
    return await new Promise((resolve, reject) => {
      let settled = false;
      let timedOut = false;
      let stopTimer;
      const finish = (error, exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        clearTimeout(stopTimer);
        if (error) reject(error);
        else resolve(exitCode);
      };
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        child.kill();
        stopTimer = setTimeout(() => finish(safeError('TOOL_STOP_FAILED')), 5000);
      }, timeoutMs);
      child.once('error', () => finish(safeError('TOOL_START_FAILED')));
      child.once('close', code => finish(timedOut ? safeError('TOOL_TIMEOUT') : null, code));
    });
  } finally {
    for (const fd of descriptors) fs.closeSync(fd);
  }
}
async function fileSha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function connect(database) {
  return mysql.createConnection({
    host: '127.0.0.1', port, user: 'root', database,
    charset: 'utf8mb4', dateStrings: true, supportBigNumbers: true,
    bigNumberStrings: true, timezone: 'Z'
  });
}
async function createFixture(connection) {
  await connection.query(`CREATE DATABASE ${sourceDb} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
  await connection.query(`CREATE DATABASE ${restoreDb} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
  await connection.changeUser({ database: sourceDb });
  await connection.query(`CREATE TABLE items (
    id INT PRIMARY KEY, nullable_col VARCHAR(30) NULL,
    unicode_col VARCHAR(100) NOT NULL, binary_col VARBINARY(8) NOT NULL,
    flags BIT(8) NOT NULL, amount DECIMAL(20,6) NOT NULL,
    occurred_at DATETIME(3) NOT NULL, json_col LONGTEXT NOT NULL,
    empty_col VARCHAR(20) NOT NULL,
    CONSTRAINT items_json_chk CHECK (JSON_VALID(json_col))
  ) ENGINE=InnoDB`);
  await connection.query('CREATE TABLE pairs (group_id INT NOT NULL, item_id VARCHAR(12) NOT NULL, payload VARCHAR(20), PRIMARY KEY (group_id,item_id)) ENGINE=InnoDB');
  await connection.query('CREATE TABLE empty_items (id INT AUTO_INCREMENT PRIMARY KEY, payload BLOB) ENGINE=InnoDB');
  await connection.query('ALTER TABLE empty_items AUTO_INCREMENT=100');
  await connection.query("CREATE TRIGGER trg_items_before BEFORE INSERT ON items FOR EACH ROW SET NEW.empty_col = COALESCE(NEW.empty_col, '')");
  await connection.query('CREATE VIEW v_items AS SELECT id, unicode_col FROM items');
  await connection.query('CREATE PROCEDURE p_count_items() SELECT COUNT(*) FROM items');
  await connection.query('CREATE FUNCTION f_one() RETURNS INT DETERMINISTIC RETURN 1');
  await connection.query('CREATE EVENT ev_noop ON SCHEDULE EVERY 1 DAY DISABLE DO SET @po_e2e = 1');
  await connection.query("INSERT INTO items (id,nullable_col,unicode_col,binary_col,flags,amount,occurred_at,json_col,empty_col) VALUES (?,?,?, ?,b'10000000',?,?,?,?)", [
    1, null, '冰川🙂', Buffer.from([0, 255, 1]), '9007199254740.123456', '2026-10-08 00:00:00.001', '{"value":1}', ''
  ]);
  await connection.query("INSERT INTO items (id,nullable_col,unicode_col,binary_col,flags,amount,occurred_at,json_col,empty_col) VALUES (?,?,?, ?,b'00000001',?,?,?,?)", [
    2, '', 'Unicode Ω', Buffer.from([0, 1, 255]), '-123456789012.654321', '2026-10-08 23:59:59.999', '{"value":2}', ''
  ]);
  await connection.query('INSERT INTO pairs (group_id,item_id,payload) VALUES (1,?,?),(1,?,?),(2,?,?)', ['a', 'first', 'b', 'second', 'a', 'third']);
}
async function createLoadFixture(connection, rowCount, checkResources) {
  await connection.query('CREATE TABLE po_load_items (id INT NOT NULL PRIMARY KEY, payload VARCHAR(32) NOT NULL) ENGINE=InnoDB');
  await connection.query('CREATE TABLE po_load_blob (id INT NOT NULL PRIMARY KEY, payload LONGBLOB NOT NULL) ENGINE=InnoDB');
  await connection.query('INSERT INTO po_load_blob (id,payload) VALUES (?,?)', [1, Buffer.alloc(LOAD_BLOB_BYTES, 0x5a)]);
  const started = performance.now();
  for (let first = 1; first <= rowCount; first += LOAD_BATCH_SIZE) {
    const batch = [];
    const last = Math.min(rowCount, first + LOAD_BATCH_SIZE - 1);
    for (let id = first; id <= last; id++) batch.push([id, `synthetic-${id.toString(36).padStart(8, '0')}`]);
    await connection.query({ sql: 'INSERT INTO po_load_items (id,payload) VALUES ?', timeout: 15000 }, [batch]);
    if (first % (LOAD_BATCH_SIZE * 100) === 1) {
      checkResources();
      if (performance.now() - started > LOAD_MAX_INSERT_MS) throw safeError('LOAD_INSERT_TIME_LIMIT');
    }
  }
  return Math.round(performance.now() - started);
}
async function verifyOwner(owner, watcher, expectedId) {
  const [[identity]] = await owner.query('SELECT CONNECTION_ID() AS connectionId');
  if (Number(identity?.connectionId) !== expectedId) throw safeError('LOCK_OWNER_CHANGED');
  const [rows] = await watcher.query('SELECT ID FROM information_schema.PROCESSLIST WHERE ID = ?', [expectedId]);
  if (rows.length !== 1 || Number(rows[0].ID) !== expectedId) throw safeError('LOCK_OWNER_LOST');
}

async function main() {
  const loadRows = loadMode();
  assert.equal(port, 43314);
  assert.equal(serverId, 20261015);
  await portIsFree();
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const initialFreeBytes = availableBytes();
  if (loadRows && initialFreeBytes < LOAD_PREFLIGHT_FREE_BYTES) throw safeError('LOAD_SPACE_PRECHECK_FAILED');
  const evidenceDir = fs.mkdtempSync(path.join(evidenceRoot, 'snapshot-manifest-isolated-'));
  const dataDir = path.join(evidenceDir, 'data');
  const resultPath = path.join(evidenceDir, 'result.json');
  const dumpPath = path.join(evidenceDir, 'fixture.sql');
  let stage = 'INIT';
  let server, serverLogFd, owner, watcher, measure, restored;
  let serverSpawnError = false;
  let serverClosed = false;
  let serverClosePromise = Promise.resolve();
  let lockHeld = false;
  let identityVerified = false;
  let serverStopped = false;
  let outcome = { status: 'NO_GO_ISOLATED', code: 'NOT_STARTED' };
  let minimumFreeBytes = initialFreeBytes;
  let peakRssBytes = 0;
  let peakHeapBytes = 0;
  let memoryTimer;
  const recordResources = () => {
    const memory = process.memoryUsage();
    peakRssBytes = Math.max(peakRssBytes, memory.rss, process.resourceUsage().maxRSS * 1024);
    peakHeapBytes = Math.max(peakHeapBytes, memory.heapUsed);
    minimumFreeBytes = Math.min(minimumFreeBytes, availableBytes());
    if (loadRows && minimumFreeBytes < LOAD_MIN_FREE_BYTES) throw safeError('LOAD_SPACE_THRESHOLD');
    if (loadRows && (peakRssBytes > RSS_BUDGET_BYTES || peakHeapBytes > HEAP_BUDGET_BYTES)) throw safeError('LOAD_MEMORY_BUDGET');
  };
  recordResources();
  memoryTimer = setInterval(() => {
    const memory = process.memoryUsage();
    peakRssBytes = Math.max(peakRssBytes, memory.rss, process.resourceUsage().maxRSS * 1024);
    peakHeapBytes = Math.max(peakHeapBytes, memory.heapUsed);
  }, 100);
  memoryTimer.unref();
  const timings = {};
  const scanMemory = {};
  const memorySample = () => {
    const value = process.memoryUsage();
    return { rssBytes: value.rss, heapBytes: value.heapUsed };
  };
  let lockStartedAt = 0;
  const lockRemainingMs = () => LOAD_MAX_LOCK_MS - (performance.now() - lockStartedAt);
  const scanOptions = { chunkSize: loadRows ? 10000 : 2 };
  try {
    const initExit = await runTool('mysql_install_db.exe', [`--datadir=${dataDir}`, `--port=${port}`], null,
      path.join(evidenceDir, 'init.stdout'), path.join(evidenceDir, 'init.stderr'));
    if (initExit !== 0) throw safeError('INIT_FAILED');
    stage = 'START';
    serverLogFd = fs.openSync(path.join(evidenceDir, 'server.log'), 'wx');
    server = spawn(path.join(bin, 'mysqld.exe'), [
      '--no-defaults', `--basedir=C:/xampp/mysql`, `--datadir=${dataDir}`,
      '--bind-address=127.0.0.1', `--port=${port}`, `--server-id=${serverId}`,
      '--skip-log-bin', '--event-scheduler=OFF', '--max-allowed-packet=64M'
    ], { windowsHide: true, stdio: ['ignore', serverLogFd, serverLogFd] });
    server.once('error', () => { serverSpawnError = true; });
    serverClosePromise = new Promise(resolve => server.once('close', () => { serverClosed = true; resolve(); }));
    for (let attempt = 0; attempt < 100; attempt++) {
      try { owner = await connect(); break; }
      catch {
        if (serverSpawnError) throw safeError('ISOLATED_SERVER_START_FAILED');
        if (server.exitCode !== null) throw safeError('ISOLATED_SERVER_EXITED');
        await sleep(200);
      }
    }
    if (!owner) throw safeError('ISOLATED_SERVER_UNAVAILABLE');
    const [[identity]] = await owner.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,VERSION() AS version');
    if (Number(identity.port) !== port || Number(identity.serverId) !== serverId ||
        path.resolve(identity.datadir).toLowerCase() !== path.resolve(dataDir).toLowerCase() ||
        identity.version !== '10.4.14-MariaDB') throw safeError('ISOLATED_IDENTITY_MISMATCH');
    identityVerified = true;
    const [[packet]] = await owner.query('SELECT @@max_allowed_packet AS maxAllowedPacket');
    const maxAllowedPacketBytes = Number(packet.maxAllowedPacket);
    if (!Number.isSafeInteger(maxAllowedPacketBytes) || maxAllowedPacketBytes > MAX_PACKET_BYTES || maxAllowedPacketBytes < LOAD_BLOB_BYTES + 1024) {
      throw safeError('ISOLATED_PACKET_LIMIT_INVALID');
    }
    stage = 'FIXTURE';
    await createFixture(owner);
    if (loadRows) {
      stage = 'LOAD_INSERT';
      timings.insertMs = await createLoadFixture(owner, loadRows, recordResources);
      recordResources();
    }
    watcher = await connect();
    measure = await connect(sourceDb);
    const [[lockIdentity]] = await owner.query('SELECT CONNECTION_ID() AS connectionId');
    const ownerId = Number(lockIdentity.connectionId);
    await owner.query('SET SESSION lock_wait_timeout = 5');
    stage = 'LOCK';
    await owner.query('FLUSH TABLES WITH READ LOCK');
    lockHeld = true;
    lockStartedAt = performance.now();
    stage = 'SOURCE_BEFORE';
    await verifyOwner(owner, watcher, ownerId);
    scanMemory.sourceBeforeStart = memorySample();
    let phaseStarted = performance.now();
    const before = await withTimeout(snapshotManifest(measure, measure.connection, scanOptions),
      lockRemainingMs(), () => measure.connection.destroy());
    timings.sourceBeforeMs = Math.round(performance.now() - phaseStarted);
    scanMemory.sourceBeforeEnd = memorySample();
    recordResources();
    await verifyOwner(owner, watcher, ownerId);
    stage = 'DUMP';
    phaseStarted = performance.now();
    const dumpExit = await runTool('mysqldump.exe', [
      '--no-defaults', '--host=127.0.0.1', `--port=${port}`, '--user=root', '--protocol=tcp',
      '--default-character-set=utf8mb4', '--single-transaction', '--quick', '--routines',
      '--triggers', '--events', '--hex-blob', '--no-tablespaces', sourceDb
    ], null, dumpPath, path.join(evidenceDir, 'dump.stderr'), Math.max(1, Math.min(60000, lockRemainingMs())));
    timings.dumpMs = Math.round(performance.now() - phaseStarted);
    recordResources();
    if (dumpExit !== 0 || fs.statSync(dumpPath).size === 0 || fs.statSync(path.join(evidenceDir, 'dump.stderr')).size !== 0) {
      throw safeError('DUMP_INVALID');
    }
    stage = 'SOURCE_AFTER';
    await verifyOwner(owner, watcher, ownerId);
    scanMemory.sourceAfterStart = memorySample();
    phaseStarted = performance.now();
    const after = await withTimeout(snapshotManifest(measure, measure.connection, scanOptions),
      lockRemainingMs(), () => measure.connection.destroy());
    timings.sourceAfterMs = Math.round(performance.now() - phaseStarted);
    scanMemory.sourceAfterEnd = memorySample();
    recordResources();
    await verifyOwner(owner, watcher, ownerId);
    if (!require('node:util').isDeepStrictEqual(before, after)) throw safeError('SOURCE_CHANGED');
    timings.lockHeldMs = Math.round(performance.now() - lockStartedAt);
    if (timings.lockHeldMs > LOAD_MAX_LOCK_MS) throw safeError('LOCK_TIME_LIMIT');
    await owner.query('UNLOCK TABLES');
    lockHeld = false;
    stage = 'RESTORE';
    phaseStarted = performance.now();
    const restoreExit = await runTool('mysql.exe', [
      '--no-defaults', '--host=127.0.0.1', `--port=${port}`, '--user=root', '--protocol=tcp',
      '--default-character-set=utf8mb4', '--binary-mode=1', restoreDb
    ], dumpPath, path.join(evidenceDir, 'restore.stdout'), path.join(evidenceDir, 'restore.stderr'), loadRows ? 120000 : 60000);
    timings.restoreImportMs = Math.round(performance.now() - phaseStarted);
    recordResources();
    if (restoreExit !== 0 || fs.statSync(path.join(evidenceDir, 'restore.stderr')).size !== 0) {
      throw safeError('RESTORE_INVALID');
    }
    restored = await connect(restoreDb);
    stage = 'RESTORED_MANIFEST';
    scanMemory.restoreStart = memorySample();
    phaseStarted = performance.now();
    const recovered = await withTimeout(snapshotManifest(restored, restored.connection, scanOptions),
      loadRows ? 120000 : 60000, () => restored.connection.destroy());
    timings.restoreScanMs = Math.round(performance.now() - phaseStarted);
    scanMemory.restoreEnd = memorySample();
    recordResources();
    if (!require('node:util').isDeepStrictEqual(before, recovered)) throw safeError('RESTORE_MISMATCH');
    stage = 'MUTATION_CHECKS';
    await restored.query("UPDATE items SET unicode_col='mutated' WHERE id=2");
    const dataMutation = await withTimeout(snapshotManifest(restored, restored.connection, scanOptions),
      loadRows ? 120000 : 60000, () => restored.connection.destroy());
    recordResources();
    const dataDiffRejected = !require('node:util').isDeepStrictEqual(before.tables, dataMutation.tables);
    await restored.query("UPDATE items SET unicode_col='Unicode Ω' WHERE id=2");
    await restored.query('ALTER TABLE pairs ADD INDEX idx_payload (payload)');
    const objectMutation = await withTimeout(snapshotManifest(restored, restored.connection, scanOptions),
      loadRows ? 120000 : 60000, () => restored.connection.destroy());
    const objectDiffRejected = !require('node:util').isDeepStrictEqual(before.objects, objectMutation.objects);
    if (!dataDiffRejected || !objectDiffRejected) throw safeError('MUTATION_NOT_DETECTED');
    recordResources();
    outcome = {
      status: 'PASS_ISOLATED_MANIFEST_E2E', code: 'MATCH_AND_MUTATIONS_REJECTED',
      targetPort: port, serverId, version: identity.version, productionTouched: false,
      initNoDefaultsSupported: false,
      tableCount: before.tables.length, objectCount: before.objects.length,
      sourceBeforeAfterEqual: true, restoredMatchesSource: true,
      dataDiffRejected, objectDiffRejected,
      loadRows, loadBlobBytes: loadRows ? LOAD_BLOB_BYTES : 0, timings, scanMemory,
      initialFreeBytes, minimumFreeBytes, endingFreeBytes: availableBytes(),
      peakRssBytes, peakHeapBytes, rssBudgetBytes: RSS_BUDGET_BYTES, heapBudgetBytes: HEAP_BUDGET_BYTES,
      lockBudgetMs: LOAD_MAX_LOCK_MS,
      maxAllowedPacketBytes, packetLimitScope: 'logical_packet_only_not_process_memory_bound',
      dumpBytes: fs.statSync(dumpPath).size, dumpSha256: await fileSha256(dumpPath),
      scriptSha256: await fileSha256(__filename),
      snapshotManifestSha256: await fileSha256(path.join(projectRoot, 'server/src/db/snapshotManifest.js')),
      snapshotGateSha256: await fileSha256(path.join(projectRoot, 'server/src/db/snapshotGate.js'))
    };
  } catch (error) {
    outcome = {
      status: 'NO_GO_ISOLATED', stage,
      code: /^[A-Z][A-Z0-9_]+$/.test(String(error?.code || '')) ? error.code : 'ISOLATED_REHEARSAL_FAILED',
      targetPort: port, serverId, productionTouched: false, initNoDefaultsSupported: false,
      loadRows, timings, initialFreeBytes, minimumFreeBytes,
      peakRssBytes, peakHeapBytes, scanMemory
    };
  } finally {
    clearInterval(memoryTimer);
    if (lockHeld && owner) await owner.query('UNLOCK TABLES').catch(() => {});
    for (const connection of [restored, measure, watcher]) if (connection) await connection.end().catch(() => {});
    if (owner) {
      if (identityVerified) { try { await owner.query('SHUTDOWN'); } catch {} }
      await owner.end().catch(() => {});
    }
    if (server) {
      await Promise.race([serverClosePromise, sleep(3000)]);
      if (!serverClosed && !serverSpawnError) server.kill();
      await Promise.race([serverClosePromise, sleep(3000)]);
      serverStopped = serverClosed;
      if (!serverStopped) outcome = { status: 'NO_GO_ISOLATED', stage: 'CLEANUP', code: 'SERVER_NOT_STOPPED', targetPort: port, serverId, productionTouched: false };
    }
    if (serverLogFd !== undefined) fs.closeSync(serverLogFd);
    outcome.serverStopped = serverStopped;
    outcome.evidenceDir = evidenceDir;
    fs.writeFileSync(resultPath, JSON.stringify(outcome, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify(outcome) + '\n');
  }
  if (outcome.status !== 'PASS_ISOLATED_MANIFEST_E2E') process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ status: 'NO_GO_ISOLATED', code: /^[A-Z][A-Z0-9_]+$/.test(String(error?.code || '')) ? error.code : 'PRECHECK_FAILED', productionTouched: false }) + '\n');
  process.exitCode = 1;
});
