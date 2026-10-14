'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { runSnapshotGate } = require('./snapshotGate');
const { snapshotManifest } = require('./snapshotManifest');

const databaseName = value => typeof value === 'string' && /^[a-z][a-z0-9_]*$/.test(value);
const noGo = code => ({ status: 'NO_GO', code });

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function inventory(connection) {
  const [tables] = await connection.query('SELECT table_name,table_type FROM information_schema.tables WHERE table_schema=DATABASE() ORDER BY table_name');
  const [triggers] = await connection.query('SELECT trigger_name AS name FROM information_schema.triggers WHERE trigger_schema=DATABASE() ORDER BY trigger_name');
  const [routines] = await connection.query('SELECT routine_name AS name,routine_type AS type FROM information_schema.routines WHERE routine_schema=DATABASE() ORDER BY routine_type,routine_name');
  const [events] = await connection.query('SELECT event_name AS name FROM information_schema.events WHERE event_schema=DATABASE() ORDER BY event_name');
  const objects = [{ type: 'SCHEMA', name: '__database__' }];
  for (const row of tables) objects.push({ type: row.table_type === 'VIEW' ? 'VIEW' : 'TABLE', name: row.table_name });
  for (const row of triggers) objects.push({ type: 'TRIGGER', name: row.name });
  for (const row of routines) objects.push({ type: row.type, name: row.name });
  for (const row of events) objects.push({ type: 'EVENT', name: row.name });
  return { tables: tables.filter(row => row.table_type === 'BASE TABLE').map(row => row.table_name), objects };
}

function validOptions(options) {
  const { target, evidenceDir, sourceDb, restoreDb, tools, connect, expectedInventory } = options;
  if (!target || target.host !== '127.0.0.1' || !Number.isInteger(target.port) || target.port < 43300 || target.port > 43399 ||
    !Number.isInteger(target.serverId) || target.serverId <= 1 || target.version !== '10.4.14-MariaDB' ||
    !databaseName(sourceDb) || !databaseName(restoreDb) || sourceDb === restoreDb ||
    typeof connect !== 'function' || !expectedInventory?.tables?.length || !expectedInventory?.objects?.length ||
    !path.isAbsolute(evidenceDir || '') || !path.isAbsolute(target.datadir || '') ||
    !path.isAbsolute(tools?.dumpExecutable || '') || !path.isAbsolute(tools?.restoreExecutable || '')) return false;
  const root = path.resolve(evidenceDir);
  if (path.relative(root, path.resolve(target.datadir)) !== 'data') return false;
  try {
    if (!fs.statSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink() ||
      !fs.statSync(target.datadir).isDirectory() || fs.lstatSync(target.datadir).isSymbolicLink()) return false;
    if (fs.realpathSync(target.datadir) !== path.join(fs.realpathSync(root), 'data')) return false;
  } catch { return false; }
  return true;
}

async function runSnapshotExecutor(options = {}) {
  if (options.mode !== 'isolated') return noGo('PRODUCTION_EXECUTION_DISABLED');
  if (!validOptions(options)) return noGo('ISOLATED_PREFLIGHT_INVALID');

  const { target, evidenceDir, sourceDb, restoreDb, tools, connect, expectedInventory } = options;
  const dumpPath = path.join(evidenceDir, 'snapshot.sql');
  const children = new Set();
  const connections = [];
  const artifactId = crypto.randomUUID();
  const maxLockMs = options.maxLockMs || 180000;
  const maxRestoreMs = options.maxRestoreMs || 120000;
  const minFreeBytes = options.minFreeBytes || 4 * 1024 * 1024 * 1024;
  let cleanupConfirmed = false;

  const closeConnections = async () => {
    for (const connection of connections.reverse()) await connection.end().catch(() => {});
    connections.length = 0;
  };
  const boundedClose = entry => new Promise(resolve => {
    let timer;
    entry.closedPromise.then(() => { clearTimeout(timer); resolve(); });
    timer = setTimeout(resolve, 5000);
  });
  const stopChildren = async () => {
    for (const entry of children) if (!entry.closed) entry.child.kill();
    await Promise.all([...children].map(boundedClose));
    return [...children].every(entry => entry.closed);
  };
  const runTool = async (executable, args, { input, output, error }, signal) => {
    const descriptors = [];
    let entry;
    try {
      const stdin = input ? fs.openSync(input, 'r') : 'ignore';
      if (input) descriptors.push(stdin);
      const stdout = fs.openSync(output, 'wx');
      const stderr = fs.openSync(error, 'wx');
      descriptors.push(stdout, stderr);
      const child = spawn(executable, args, {
        windowsHide: true, shell: false, stdio: [stdin, stdout, stderr],
        env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: `C:/Windows/System32;${path.dirname(executable)}` }
      });
      entry = { child, closed: false };
      entry.closedPromise = new Promise(resolve => child.once('close', code => {
        entry.closed = true;
        resolve(code);
      }));
      const spawnFailure = new Promise((_, reject) => child.once('error', () => reject(new Error('TOOL_START_FAILED'))));
      children.add(entry);
      const onAbort = () => child.kill();
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
      try {
        const exitCode = await Promise.race([entry.closedPromise, spawnFailure]);
        return { exitCode, warnings: fs.statSync(error).size > 0 };
      } finally { signal.removeEventListener('abort', onAbort); }
    } finally {
      for (const fd of descriptors) fs.closeSync(fd);
    }
  };

  try {
    const owner = await connect(sourceDb); connections.push(owner);
    const watcher = await connect(); connections.push(watcher);
    const source = await connect(sourceDb); connections.push(source);
    const restored = await connect(restoreDb); connections.push(restored);
    const [[identity]] = await owner.query('SELECT @@port AS port,@@server_id AS serverId,@@datadir AS datadir,VERSION() AS version,DATABASE() AS db');
    const [[sourceIdentity]] = await source.query('SELECT @@port AS port,DATABASE() AS db');
    const [[restoreIdentity]] = await restored.query('SELECT @@port AS port,DATABASE() AS db');
    if (Number(identity?.port) !== target.port || Number(identity?.serverId) !== target.serverId ||
      path.resolve(identity?.datadir || '').toLowerCase() !== path.resolve(target.datadir).toLowerCase() ||
      identity?.version !== target.version || identity?.db !== sourceDb ||
      Number(sourceIdentity?.port) !== target.port || sourceIdentity?.db !== sourceDb ||
      Number(restoreIdentity?.port) !== target.port || restoreIdentity?.db !== restoreDb) return noGo('ISOLATED_IDENTITY_MISMATCH');
    const [restoreTables] = await restored.query('SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE()');
    if (restoreTables.length) return noGo('RESTORE_DATABASE_NOT_EMPTY');

    const cancellable = (connection, signal, callback) => {
      const onAbort = () => connection.connection.destroy();
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
      return Promise.resolve().then(callback)
        .finally(() => signal.removeEventListener('abort', onAbort));
    };
    const manifest = (connection, signal) => cancellable(connection, signal,
      () => snapshotManifest(connection, connection.connection, { chunkSize: options.chunkSize || 10000 }));
    const result = await runSnapshotGate({
      owner: { query: (...args) => owner.query(...args), destroy: () => owner.connection.destroy() },
      watcher, expectedInventory,
      inventory: ({ signal }) => cancellable(source, signal, () => inventory(source)),
      sourceManifest: ({ signal }) => manifest(source, signal),
      dump: async ({ signal }) => {
        const output = path.join(evidenceDir, 'snapshot.sql');
        const evidence = await runTool(tools.dumpExecutable, [
          '--no-defaults', '--host=127.0.0.1', `--port=${target.port}`, '--user=root', '--protocol=tcp',
          '--default-character-set=utf8mb4', '--single-transaction', '--quick', '--routines',
          '--triggers', '--events', '--hex-blob', '--no-tablespaces', sourceDb
        ], { output, error: path.join(evidenceDir, 'dump.stderr') }, signal);
        const bytes = fs.statSync(output).size;
        return { ...evidence, artifactId, bytes, sha256: await hashFile(output) };
      },
      verifyArtifact: async ({ artifactId: id }) => {
        if (id !== artifactId) throw new Error('ARTIFACT_ID_MISMATCH');
        return { bytes: fs.statSync(dumpPath).size, sha256: await hashFile(dumpPath) };
      },
      restore: async ({ artifactId: id, signal }) => {
        if (id !== artifactId) throw new Error('ARTIFACT_ID_MISMATCH');
        const evidence = await runTool(tools.restoreExecutable, [
          '--no-defaults', '--host=127.0.0.1', `--port=${target.port}`, '--user=root', '--protocol=tcp',
          '--default-character-set=utf8mb4', '--binary-mode=1', restoreDb
        ], { input: dumpPath, output: path.join(evidenceDir, 'restore.stdout'), error: path.join(evidenceDir, 'restore.stderr') }, signal);
        return { exitCode: evidence.exitCode, errors: evidence.warnings };
      },
      restoredManifest: ({ signal }) => manifest(restored, signal),
      checkSpace: () => {
        const space = fs.statfsSync(evidenceDir);
        return space.bavail * space.bsize >= minFreeBytes;
      },
      cleanup: async () => {
        cleanupConfirmed = await stopChildren();
        return { processesExited: cleanupConfirmed };
      },
      lockWaitSeconds: options.lockWaitSeconds || 5,
      maxLockMs, maxRestoreMs,
      maxCleanupMs: 10000
    });
    return { ...result, cleanupConfirmed, targetPort: target.port };
  } catch {
    return noGo('EXECUTOR_FAILED');
  } finally {
    await stopChildren();
    await closeConnections();
  }
}

module.exports = { runSnapshotExecutor, inventory };
