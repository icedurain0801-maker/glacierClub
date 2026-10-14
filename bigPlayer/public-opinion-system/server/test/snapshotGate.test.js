'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { runSnapshotGate } = require('../src/db/snapshotGate');

const FORMAT = 'po-snapshot-manifest-v1';
const expectedInventory = Object.freeze({
  tables: ['fixture'],
  objects: [
    { type: 'SCHEMA', name: '__database__' },
    { type: 'TABLE', name: 'fixture' }
  ]
});
const dumpHash = 'd'.repeat(64);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function makeManifest({ rowHash = 'b'.repeat(64), objectHash = 'a'.repeat(64), extraObject = false } = {}) {
  const chunk = {
    number: 1, rows: 1, bytes: 12,
    firstKeyHash: '1'.repeat(64), lastKeyHash: '1'.repeat(64), sha256: rowHash
  };
  const tableHash = crypto.createHash('sha256').update(`${FORMAT}:table:`);
  tableHash.update(JSON.stringify(chunk));
  tableHash.update('rows:1:chunks:1');
  return {
    format: FORMAT,
    objects: [
      { type: 'SCHEMA', name: '__database__', sha256: 'e'.repeat(64) },
      { type: 'TABLE', name: 'fixture', engine: 'InnoDB', sha256: objectHash },
      ...(extraObject ? [{ type: 'VIEW', name: 'unexpected', sha256: 'f'.repeat(64) }] : [])
    ],
    tables: [{ name: 'fixture', primary: ['id'], count: 1, chunks: [chunk], digest: tableHash.digest('hex') }]
  };
}
const manifest = makeManifest();

function fixture(options = {}) {
  const events = [];
  const signals = [];
  let sourceReads = 0;
  let inventoryReads = 0;
  let verifyReads = 0;
  let spaceChecks = 0;
  let idChecks = 0;
  let watcherChecks = 0;
  let lockHeld = false;
  const owner = {
    async query(sql) {
      events.push(sql);
      if (sql.startsWith('SET SESSION lock_wait_timeout')) return [[], []];
      if (sql === 'SELECT CONNECTION_ID() AS connectionId') {
        idChecks += 1;
        if (options.ownerQueryFailsAt === idChecks) throw new Error('fixture owner disconnected');
        return [[{ connectionId: options.ownerChangesAt === idChecks ? 8 : 7 }]];
      }
      if (sql === 'FLUSH TABLES WITH READ LOCK') {
        if (options.lockFails) throw new Error('fixture lock acquisition failed');
        lockHeld = true;
        return [[], []];
      }
      if (sql === 'UNLOCK TABLES') {
        if (options.unlockFails) throw new Error('fixture lock release failed');
        lockHeld = false;
        return [[], []];
      }
      throw new Error('unexpected owner query');
    },
    destroy() {
      events.push('destroy-owner');
      lockHeld = false;
    }
  };
  const watcher = {
    async query(sql, values) {
      events.push('watchdog');
      watcherChecks += 1;
      assert.match(sql, /information_schema\.PROCESSLIST/);
      assert.deepEqual(values, [7]);
      if (options.watcherThrows) throw new Error('fixture watchdog unavailable');
      return [options.watcherLosesOwner || options.watcherLosesAt === watcherChecks ? [] : [{ ID: 7 }]];
    }
  };
  const deps = {
    owner,
    watcher,
    expectedInventory: options.expectedInventory ?? expectedInventory,
    async checkSpace() {
      spaceChecks += 1;
      events.push('space');
      return options.spaceFailsAt !== spaceChecks;
    },
    async inventory({ signal }) {
      signals.push(signal);
      events.push('inventory');
      inventoryReads += 1;
      if (options.inventoryThrowsAt === inventoryReads) throw new Error('fixture inventory failed');
      if (options.emptyInventoryAt === inventoryReads) return { tables: [], objects: [] };
      if (options.missingObjectAt === inventoryReads) return { tables: ['fixture'], objects: [{ type: 'SCHEMA', name: '__database__' }] };
      if (options.inventoryChangesAt === inventoryReads) {
        return { tables: ['fixture'], objects: [...expectedInventory.objects, { type: 'VIEW', name: 'new_view' }] };
      }
      return structuredClone(expectedInventory);
    },
    async sourceManifest({ signal }) {
      signals.push(signal);
      events.push('source');
      sourceReads += 1;
      if (options.sourceDelayMs) await pause(options.sourceDelayMs);
      if (options.sourceFailsAt === sourceReads) throw new Error('fixture source read failed');
      if (options.invalidManifest) return {};
      if (options.extraManifestObject) return makeManifest({ extraObject: true });
      return sourceReads === 2 && options.sourceChanges ? makeManifest({ rowHash: 'c'.repeat(64) }) : manifest;
    },
    async dump({ signal }) {
      signals.push(signal);
      events.push('dump');
      if (options.dumpIgnoresAbort) return new Promise(() => {});
      if (options.dumpWaitsForAbort) {
        await new Promise(resolve => {
          if (signal.aborted) return resolve();
          signal.addEventListener('abort', resolve, { once: true });
        });
        events.push('dump-aborted');
        throw new Error('fixture dump aborted');
      }
      if (options.dumpThrows) throw new Error('fixture dump failed');
      return {
        exitCode: options.dumpExitCode ?? 0, warnings: Boolean(options.dumpWarnings),
        artifactId: 'fixture-artifact-v1', bytes: 1024, sha256: dumpHash
      };
    },
    async verifyArtifact({ artifactId, signal }) {
      signals.push(signal);
      events.push('verify-artifact');
      verifyReads += 1;
      assert.equal(artifactId, 'fixture-artifact-v1');
      if (options.verifyThrowsAt === verifyReads) throw new Error('fixture verify failed');
      return {
        bytes: options.artifactChangesAt === verifyReads ? 1025 : 1024,
        sha256: options.artifactHashChangesAt === verifyReads ? '9'.repeat(64) : dumpHash
      };
    },
    async restore({ artifactId, signal }) {
      signals.push(signal);
      events.push('restore');
      assert.equal(artifactId, 'fixture-artifact-v1');
      if (options.restoreIgnoresAbort) return new Promise(() => {});
      if (options.restoreThrows) throw new Error('fixture restore failed');
      return { exitCode: options.restoreExitCode ?? 0, errors: false };
    },
    async restoredManifest({ signal }) {
      signals.push(signal);
      events.push('restored');
      if (options.restoredManifestThrows) throw new Error('fixture restored manifest failed');
      if (options.restoreChanges) return makeManifest({ rowHash: 'c'.repeat(64) });
      if (options.restoreObjectChanges) return makeManifest({ objectHash: 'c'.repeat(64) });
      return manifest;
    },
    async cleanup({ signal, artifactId }) {
      events.push('cleanup');
      signals.push(signal);
      assert.ok(artifactId === undefined || artifactId === 'fixture-artifact-v1');
      if (options.cleanupIgnoresAbort) return new Promise(() => {});
      if (options.cleanupFails) throw new Error('fixture cleanup failed');
      return { processesExited: !options.cleanupUnconfirmed };
    },
    watchdogIntervalMs: 2,
    watchdogQueryMs: 20,
    maxLockMs: options.maxLockMs ?? 5000,
    maxRestoreMs: options.maxRestoreMs ?? 5000,
    maxCleanupMs: options.maxCleanupMs ?? 100
  };
  return {
    deps, events, signals,
    get lockHeld() { return lockHeld; },
    get inventoryReads() { return inventoryReads; },
    get verifyReads() { return verifyReads; }
  };
}

test('成功路径：静态对象清单、锁内前后 inventory、双次 artifact 校验与同一 artifactId', async () => {
  const f = fixture();
  const result = await runSnapshotGate(f.deps);
  assert.deepEqual({ status: result.status, code: result.code }, { status: 'RESTORE_VERIFIED', code: 'MATCH' });
  assert.equal(result.dumpSha256, dumpHash);
  assert.equal(result.dumpBytes, 1024);
  assert.equal(f.inventoryReads, 2);
  assert.equal(f.verifyReads, 2);
  assert.equal(f.events.filter(event => event === 'source').length, 2);
  assert.equal(f.events.filter(event => event === 'UNLOCK TABLES').length, 1);
  assert.ok(f.events.indexOf('FLUSH TABLES WITH READ LOCK') < f.events.indexOf('inventory'));
  assert.ok(f.events.indexOf('UNLOCK TABLES') < f.events.indexOf('verify-artifact'));
  assert.ok(f.events.indexOf('verify-artifact') < f.events.indexOf('restore'));
  assert.equal(f.events.at(-1), 'cleanup');
  assert.equal(f.lockHeld, false);
  assert.ok(f.signals.length >= 8 && f.signals.every(signal => signal instanceof AbortSignal));
});

const failCases = [
  ['锁获取失败', { lockFails: true }, 'LOCK_ACQUIRE_FAILED'],
  ['锁主连接在 checkpoint 丢失', { ownerQueryFailsAt: 2 }, 'LOCK_OWNER_LOST'],
  ['锁主连接 ID 改变', { ownerChangesAt: 2 }, 'LOCK_OWNER_CHANGED'],
  ['看门连接找不到锁主', { watcherLosesOwner: true }, 'LOCK_OWNER_LOST'],
  ['看门查询失败', { watcherThrows: true }, 'LOCK_WATCHDOG_FAILED'],
  ['初始磁盘阈值不足', { spaceFailsAt: 1 }, 'SPACE_THRESHOLD'],
  ['持锁后磁盘阈值不足', { spaceFailsAt: 2 }, 'SPACE_THRESHOLD'],
  ['源端前清单为空', { emptyInventoryAt: 1 }, 'SOURCE_INVENTORY_INVALID'],
  ['源端前清单缺对象', { missingObjectAt: 1 }, 'SOURCE_INVENTORY_INVALID'],
  ['源端后清单为空', { emptyInventoryAt: 2 }, 'SOURCE_INVENTORY_CHANGED'],
  ['源端后清单新增对象', { inventoryChangesAt: 2 }, 'SOURCE_INVENTORY_CHANGED'],
  ['清单读取抛错', { inventoryThrowsAt: 1 }, 'SOURCE_INVENTORY_INVALID'],
  ['dump 抛错', { dumpThrows: true }, 'DUMP_FAILED'],
  ['dump 非零退出', { dumpExitCode: 1 }, 'DUMP_INVALID'],
  ['dump 警告', { dumpWarnings: true }, 'DUMP_INVALID'],
  ['源清单无效', { invalidManifest: true }, 'SOURCE_MANIFEST_INVALID'],
  ['源清单夹带漏列对象', { extraManifestObject: true }, 'SOURCE_MANIFEST_INVALID'],
  ['源端前后摘要差异', { sourceChanges: true }, 'SOURCE_CHANGED'],
  ['恢复前 artifact 变更', { artifactChangesAt: 1 }, 'ARTIFACT_MISMATCH'],
  ['恢复前 artifact 校验失败', { verifyThrowsAt: 1 }, 'ARTIFACT_MISMATCH'],
  ['恢复非零退出', { restoreExitCode: 1 }, 'RESTORE_INVALID'],
  ['恢复过程抛错', { restoreThrows: true }, 'RESTORE_FAILED'],
  ['恢复后 artifact 变更', { artifactHashChangesAt: 2 }, 'ARTIFACT_CHANGED'],
  ['恢复清单读取失败', { restoredManifestThrows: true }, 'RESTORED_MANIFEST_FAILED'],
  ['恢复逐项差异', { restoreChanges: true }, 'RESTORE_MISMATCH'],
  ['恢复对象定义差异', { restoreObjectChanges: true }, 'RESTORE_MISMATCH'],
  ['解锁失败', { unlockFails: true }, 'LOCK_RELEASE_FAILED'],
  ['最终清理失败', { cleanupFails: true }, 'CLEANUP_FAILED'],
  ['子进程退出未确认', { cleanupUnconfirmed: true }, 'CLEANUP_UNCONFIRMED']
];
for (const [label, options, code] of failCases) {
  test(`${label}：不得产生 RESTORE_VERIFIED，且清理`, async () => {
    const f = fixture(options);
    const result = await runSnapshotGate(f.deps);
    assert.equal(result.status, 'NO_GO');
    assert.equal(result.code, code);
    assert.equal(f.events.at(-1), 'cleanup');
    assert.equal(f.lockHeld, false);
    if (options.artifactChangesAt === 1 || options.verifyThrowsAt === 1) {
      assert.equal(f.events.includes('restore'), false);
    }
  });
}

test('不可信静态预期清单在任何数据库操作前拒绝，包括空表或漏对象', async () => {
  const f = fixture();
  const invalid = [
    { tables: [], objects: [] },
    { tables: ['fixture'], objects: [{ type: 'SCHEMA', name: '__database__' }] },
    { tables: ['fixture'], objects: [{ type: 'TABLE', name: 'fixture' }] },
    { tables: ['fixture', 'fixture'], objects: expectedInventory.objects }
  ];
  for (const expected of invalid) {
    await assert.rejects(runSnapshotGate({ ...f.deps, expectedInventory: expected }), TypeError);
  }
  await assert.rejects(runSnapshotGate({ ...f.deps, expectedInventory: null }), TypeError);
  await assert.rejects(runSnapshotGate({ ...f.deps, owner: null }), TypeError);
  await assert.rejects(runSnapshotGate({ ...f.deps, maxLockMs: 0 }), TypeError);
  assert.deepEqual(f.events, []);
});

test('持锁阶段忽略 signal 且不返回时，硬时限打断并销毁锁主', async () => {
  const f = fixture({ dumpIgnoresAbort: true, maxLockMs: 20 });
  const result = await runSnapshotGate(f.deps);
  assert.deepEqual({ status: result.status, code: result.code }, { status: 'NO_GO', code: 'LOCK_TIME_LIMIT' });
  assert.ok(f.events.includes('destroy-owner'));
  assert.equal(f.events.includes('restore'), false);
  assert.equal(f.events.at(-1), 'cleanup');
  assert.equal(f.lockHeld, false);
});

test('恢复阶段忽略 signal 且不返回时，硬时限打断且清理', async () => {
  const f = fixture({ restoreIgnoresAbort: true, maxRestoreMs: 20 });
  const result = await runSnapshotGate(f.deps);
  assert.deepEqual({ status: result.status, code: result.code }, { status: 'NO_GO', code: 'RESTORE_TIME_LIMIT' });
  assert.equal(f.events.includes('restored'), false);
  assert.equal(f.events.at(-1), 'cleanup');
  assert.equal(f.lockHeld, false);
});

test('清理忽略 signal 且不确认子进程退出时，硬时限仍返回 NO_GO', async () => {
  const f = fixture({ cleanupIgnoresAbort: true, maxCleanupMs: 20 });
  const result = await runSnapshotGate(f.deps);
  assert.deepEqual({ status: result.status, code: result.code }, { status: 'NO_GO', code: 'CLEANUP_FAILED' });
  assert.equal(f.events.at(-1), 'cleanup');
});

test('dump 阶段锁主消失：看门中止子任务，不能进入恢复', async () => {
  const f = fixture({ watcherLosesAt: 4, dumpWaitsForAbort: true });
  const result = await runSnapshotGate(f.deps);
  assert.deepEqual({ status: result.status, code: result.code }, { status: 'NO_GO', code: 'LOCK_OWNER_LOST' });
  assert.ok(f.events.includes('dump-aborted'));
  assert.ok(f.events.includes('destroy-owner'));
  assert.equal(f.events.includes('restore'), false);
  assert.equal(f.events.at(-1), 'cleanup');
});
