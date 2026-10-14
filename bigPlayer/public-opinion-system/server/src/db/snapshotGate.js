'use strict';

const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { isDeepStrictEqual } = require('node:util');

const FORMAT = 'po-snapshot-manifest-v1';
const SHA256 = /^[a-f0-9]{64}$/;
const OBJECT_TYPES = new Set(['SCHEMA', 'TABLE', 'VIEW', 'TRIGGER', 'PROCEDURE', 'FUNCTION', 'EVENT']);
const result = (status, code, extra = {}) => ({ status, code, ...extra });
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;
const name = value => typeof value === 'string' && value.length > 0 && !value.includes('\0');
const digest = value => typeof value === 'string' && SHA256.test(value);
const objectKey = object => `${object.type}\0${object.name}`;

function inventoryValid(inventory) {
  if (!inventory || !Array.isArray(inventory.tables) || !Array.isArray(inventory.objects) || inventory.tables.length === 0) return false;
  if (!inventory.tables.every(name) || !inventory.objects.every(object => object && OBJECT_TYPES.has(object.type) && name(object.name))) return false;
  const tables = new Set(inventory.tables);
  const objects = new Set(inventory.objects.map(objectKey));
  return tables.size === inventory.tables.length && objects.size === inventory.objects.length &&
    objects.has('SCHEMA\0__database__') && inventory.tables.every(table => objects.has(`TABLE\0${table}`)) &&
    inventory.objects.filter(object => object.type === 'TABLE').every(object => tables.has(object.name));
}

function sameInventory(actual, expected) {
  return inventoryValid(actual) &&
    actual.tables.length === expected.tables.length && actual.objects.length === expected.objects.length &&
    isDeepStrictEqual(new Set(actual.tables), new Set(expected.tables)) &&
    isDeepStrictEqual(new Set(actual.objects.map(objectKey)), new Set(expected.objects.map(objectKey)));
}

function manifestValid(manifest, expected) {
  if (!manifest || manifest.format !== FORMAT || !Array.isArray(manifest.tables) || !Array.isArray(manifest.objects)) return false;
  if (!sameInventory({ tables: manifest.tables.map(table => table?.name), objects: manifest.objects }, expected)) return false;
  for (const object of manifest.objects) {
    if (!digest(object.sha256) || (object.type === 'TABLE' && String(object.engine).toUpperCase() !== 'INNODB')) return false;
  }
  for (const table of manifest.tables) {
    if (!Array.isArray(table.primary) || !table.primary.length || !table.primary.every(name) ||
      new Set(table.primary).size !== table.primary.length || !nonnegativeInteger(table.count) ||
      !digest(table.digest) || !Array.isArray(table.chunks)) return false;
    let rows = 0;
    const tableHash = crypto.createHash('sha256').update(`${FORMAT}:table:`);
    for (let index = 0; index < table.chunks.length; index++) {
      const chunk = table.chunks[index];
      if (!chunk || chunk.number !== index + 1 || !positiveInteger(chunk.rows) ||
        !positiveInteger(chunk.bytes) || !digest(chunk.firstKeyHash) ||
        !digest(chunk.lastKeyHash) || !digest(chunk.sha256)) return false;
      rows += chunk.rows;
      if (!Number.isSafeInteger(rows)) return false;
      tableHash.update(JSON.stringify(chunk));
    }
    if (rows !== table.count || (table.count === 0) !== (table.chunks.length === 0)) return false;
    tableHash.update(`rows:${table.count}:chunks:${table.chunks.length}`);
    if (tableHash.digest('hex') !== table.digest) return false;
  }
  return true;
}

/**
 * Isolated backup gate. Callbacks must stop child processes on abort.
 * cleanup must await child exit and return { processesExited: true }.
 * No production endpoint invokes this module.
 */
async function runSnapshotGate({
  owner, watcher, expectedInventory, inventory, sourceManifest, dump,
  verifyArtifact, restore, restoredManifest, checkSpace, cleanup,
  lockWaitSeconds = 5, maxLockMs = 60000, maxRestoreMs = 600000,
  maxCleanupMs = 30000, watchdogIntervalMs = 250, watchdogQueryMs = 5000,
}) {
  if (!owner || typeof owner.query !== 'function' || typeof owner.destroy !== 'function' ||
    !watcher || typeof watcher.query !== 'function' ||
    ![inventory, sourceManifest, dump, verifyArtifact, restore, restoredManifest, checkSpace, cleanup].every(fn => typeof fn === 'function') ||
    !inventoryValid(expectedInventory)) {
    throw new TypeError('snapshot gate dependencies and static expected inventory are required');
  }
  if (![lockWaitSeconds, maxLockMs, maxRestoreMs, maxCleanupMs, watchdogIntervalMs, watchdogQueryMs].every(positiveInteger)) {
    throw new TypeError('snapshot gate limits must be positive integers');
  }

  const expected = structuredClone(expectedInventory);
  const abort = new AbortController();
  let lockHeld = false;
  let lockAttempted = false;
  let lockStart = 0;
  let lockTimer;
  let restoreTimer;
  let watchdogTimer;
  let watchdogPoll = Promise.resolve();
  let polling = false;
  let ownerId;
  let artifactId;
  let failureCode;
  let gateResult = result('NO_GO', 'NOT_STARTED');

  const destroyOwner = () => {
    try { owner.destroy(); } catch { /* failure remains NO_GO */ }
    lockHeld = false;
  };
  const fail = (code, dropLock = false) => {
    if (!failureCode) failureCode = code;
    if (!abort.signal.aborted) abort.abort();
    if (dropLock && lockAttempted) destroyOwner();
  };
  const elapsedLockMs = () => lockStart ? Math.ceil(performance.now() - lockStart) : 0;
  const stage = (callback, timeoutMs, timeoutCode) => new Promise((resolve, reject) => {
    if (abort.signal.aborted) { reject(new Error('ABORTED')); return; }
    let settled = false;
    let timer;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      abort.signal.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve(value);
    };
    const onAbort = () => finish(new Error('ABORTED'));
    abort.signal.addEventListener('abort', onAbort, { once: true });
    if (timeoutMs) timer = setTimeout(() => {
      fail(timeoutCode, lockAttempted && (lockHeld || timeoutCode === 'LOCK_ACQUIRE_TIMEOUT'));
      finish(new Error('TIME_LIMIT'));
    }, timeoutMs);
    Promise.resolve().then(() => callback(abort.signal)).then(
      value => finish(null, value),
      () => finish(new Error('STAGE_FAILED'))
    );
  });
  const checkedSpace = async () => {
    try {
      const ok = await stage(signal => checkSpace({ signal }), watchdogQueryMs, 'SPACE_CHECK_FAILED');
      if (ok !== true) fail('SPACE_THRESHOLD', lockHeld);
    } catch {
      if (!failureCode) fail('SPACE_CHECK_FAILED', lockHeld);
    }
    return !failureCode;
  };
  const alive = async () => {
    if (failureCode) return false;
    try {
      const [rows] = await stage(() => watcher.query('SELECT ID FROM information_schema.PROCESSLIST WHERE ID = ?', [ownerId]), watchdogQueryMs, 'LOCK_WATCHDOG_FAILED');
      if (!Array.isArray(rows) || rows.length !== 1 || Number(rows[0].ID) !== ownerId) {
        fail('LOCK_OWNER_LOST', true);
        return false;
      }
    } catch {
      if (!failureCode) fail('LOCK_WATCHDOG_FAILED', true);
      return false;
    }
    return checkedSpace();
  };
  const checkpoint = async () => {
    if (!await alive()) return false;
    try {
      const [rows] = await stage(() => owner.query('SELECT CONNECTION_ID() AS connectionId'), watchdogQueryMs, 'LOCK_WATCHDOG_FAILED');
      if (Number(rows?.[0]?.connectionId) !== ownerId) {
        fail('LOCK_OWNER_CHANGED', true);
        return false;
      }
      return !failureCode;
    } catch {
      if (!failureCode) fail('LOCK_OWNER_LOST', true);
      return false;
    }
  };
  const scanInventory = async code => {
    let actual;
    try { actual = await stage(signal => inventory({ signal }), 0); }
    catch { if (!failureCode) fail(code); return false; }
    if (!sameInventory(actual, expected)) { fail(code); return false; }
    return !failureCode;
  };
  const scanManifest = async code => {
    let manifest;
    try { manifest = await stage(signal => sourceManifest({ signal }), 0); }
    catch { if (!failureCode) fail(code); return null; }
    if (!manifestValid(manifest, expected)) { fail(code); return null; }
    try { return structuredClone(manifest); }
    catch { fail(code); return null; }
  };
  const startWatchdog = check => {
    watchdogTimer = setInterval(() => {
      if (polling || failureCode) return;
      polling = true;
      watchdogPoll = Promise.resolve().then(check).catch(() => {
        if (!failureCode) fail('WATCHDOG_FAILED', lockHeld);
      }).finally(() => { polling = false; });
    }, watchdogIntervalMs);
  };
  const stopWatchdog = async () => {
    clearInterval(watchdogTimer);
    watchdogTimer = undefined;
    await watchdogPoll;
    return !failureCode;
  };

  const execute = async () => {
    if (!await checkedSpace()) return result('NO_GO', failureCode);
    await stage(() => owner.query(`SET SESSION lock_wait_timeout = ${lockWaitSeconds}`), watchdogQueryMs, 'LOCK_SETUP_TIMEOUT');
    const [identity] = await stage(() => owner.query('SELECT CONNECTION_ID() AS connectionId'), watchdogQueryMs, 'LOCK_SETUP_TIMEOUT');
    ownerId = Number(identity?.[0]?.connectionId);
    if (!positiveInteger(ownerId)) return result('NO_GO', 'LOCK_OWNER_ID_INVALID');
    lockAttempted = true;
    try { await stage(() => owner.query('FLUSH TABLES WITH READ LOCK'), lockWaitSeconds * 1000 + watchdogQueryMs, 'LOCK_ACQUIRE_TIMEOUT'); }
    catch {
      if (!failureCode) fail('LOCK_ACQUIRE_FAILED', true);
      destroyOwner();
      return result('NO_GO', failureCode);
    }
    if (failureCode) return result('NO_GO', failureCode);
    lockHeld = true;
    lockStart = performance.now();
    lockTimer = setTimeout(() => fail('LOCK_TIME_LIMIT', true), maxLockMs);
    if (!await checkpoint()) return result('NO_GO', failureCode);
    startWatchdog(alive);

    if (!await scanInventory('SOURCE_INVENTORY_INVALID') || !await checkpoint()) return result('NO_GO', failureCode);
    const before = await scanManifest('SOURCE_MANIFEST_INVALID');
    if (!before || !await checkpoint()) return result('NO_GO', failureCode);
    let dumpEvidence;
    try { dumpEvidence = await stage(signal => dump({ signal }), 0); }
    catch { if (!failureCode) fail('DUMP_FAILED'); return result('NO_GO', failureCode); }
    if (!await checkpoint()) return result('NO_GO', failureCode);
    if (dumpEvidence?.exitCode !== 0 || dumpEvidence.warnings || !name(dumpEvidence.artifactId) ||
      !positiveInteger(dumpEvidence.bytes) || !digest(dumpEvidence.sha256)) return result('NO_GO', 'DUMP_INVALID');
    artifactId = dumpEvidence.artifactId;

    if (!await scanInventory('SOURCE_INVENTORY_CHANGED') || !await checkpoint()) return result('NO_GO', failureCode);
    const after = await scanManifest('SOURCE_RECHECK_FAILED');
    if (!after || !await checkpoint()) return result('NO_GO', failureCode);
    if (!isDeepStrictEqual(before, after)) return result('NO_GO', 'SOURCE_CHANGED');
    if (!await stopWatchdog() || !await checkpoint()) return result('NO_GO', failureCode);
    if (elapsedLockMs() > maxLockMs || failureCode) return result('NO_GO', failureCode || 'LOCK_TIME_LIMIT');
    try {
      await stage(() => owner.query('UNLOCK TABLES'), watchdogQueryMs, 'LOCK_RELEASE_TIMEOUT');
      lockHeld = false;
      const [releaseIdentity] = await stage(() => owner.query('SELECT CONNECTION_ID() AS connectionId'), watchdogQueryMs, 'LOCK_RELEASE_TIMEOUT');
      if (Number(releaseIdentity?.[0]?.connectionId) !== ownerId) {
        fail('LOCK_OWNER_CHANGED');
        return result('NO_GO', failureCode);
      }
    }
    catch { if (!failureCode) fail('LOCK_RELEASE_FAILED', true); return result('NO_GO', failureCode); }
    clearTimeout(lockTimer);
    lockTimer = undefined;
    const heldMs = elapsedLockMs();

    restoreTimer = setTimeout(() => fail('RESTORE_TIME_LIMIT'), maxRestoreMs);
    startWatchdog(checkedSpace);
    if (!await checkedSpace()) return result('NO_GO', failureCode);
    const verify = async code => {
      let actual;
      try { actual = await stage(signal => verifyArtifact({ artifactId, signal }), 0); }
      catch { if (!failureCode) fail(code); return false; }
      if (!actual || actual.bytes !== dumpEvidence.bytes || actual.sha256 !== dumpEvidence.sha256) { fail(code); return false; }
      return !failureCode;
    };
    if (!await verify('ARTIFACT_MISMATCH')) return result('NO_GO', failureCode);
    let restoreEvidence;
    try { restoreEvidence = await stage(signal => restore({ artifactId, signal }), 0); }
    catch { if (!failureCode) fail('RESTORE_FAILED'); return result('NO_GO', failureCode); }
    if (failureCode || restoreEvidence?.exitCode !== 0 || restoreEvidence.errors) return result('NO_GO', failureCode || 'RESTORE_INVALID');
    if (!await verify('ARTIFACT_CHANGED')) return result('NO_GO', failureCode);
    let recovered;
    try { recovered = await stage(signal => restoredManifest({ signal }), 0); }
    catch { if (!failureCode) fail('RESTORED_MANIFEST_FAILED'); return result('NO_GO', failureCode); }
    if (!manifestValid(recovered, expected) || !isDeepStrictEqual(before, recovered)) return result('NO_GO', 'RESTORE_MISMATCH');
    if (!await stopWatchdog() || !await checkedSpace()) return result('NO_GO', failureCode);
    return result('RESTORE_VERIFIED', 'MATCH', {
      dumpSha256: dumpEvidence.sha256, dumpBytes: dumpEvidence.bytes, lockHeldMs: heldMs,
    });
  };

  try { gateResult = await execute(); }
  catch { gateResult = result('NO_GO', failureCode || 'GATE_FAILED'); }
  finally {
    clearInterval(watchdogTimer);
    clearTimeout(lockTimer);
    clearTimeout(restoreTimer);
    if (!abort.signal.aborted) abort.abort();
    try { await watchdogPoll; } catch { gateResult = result('NO_GO', 'WATCHDOG_FAILED'); }
    if (lockHeld) {
      let releaseTimer;
      try {
        const released = await Promise.race([
          Promise.resolve().then(() => owner.query('UNLOCK TABLES')).then(() => true, () => false),
          new Promise(resolve => { releaseTimer = setTimeout(() => resolve(false), watchdogQueryMs); })
        ]);
        if (!released) { destroyOwner(); gateResult = result('NO_GO', 'LOCK_RELEASE_FAILED'); }
        else lockHeld = false;
      } catch { destroyOwner(); gateResult = result('NO_GO', 'LOCK_RELEASE_FAILED'); }
      finally { clearTimeout(releaseTimer); }
    }
    const cleanupAbort = new AbortController();
    let cleanupTimer;
    try {
      const done = await Promise.race([
        Promise.resolve().then(() => cleanup({ signal: cleanupAbort.signal, reason: failureCode, artifactId })),
        new Promise((_, reject) => {
          cleanupTimer = setTimeout(() => { cleanupAbort.abort(); reject(new Error('CLEANUP_TIMEOUT')); }, maxCleanupMs);
        })
      ]);
      if (done?.processesExited !== true) gateResult = result('NO_GO', 'CLEANUP_UNCONFIRMED');
    } catch { gateResult = result('NO_GO', 'CLEANUP_FAILED'); }
    finally { clearTimeout(cleanupTimer); }
  }
  return failureCode ? result('NO_GO', failureCode) : gateResult;
}

module.exports = { runSnapshotGate };
