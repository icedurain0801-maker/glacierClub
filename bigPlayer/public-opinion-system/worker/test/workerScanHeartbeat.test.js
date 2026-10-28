const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkerScanHeartbeat } = require('../src/workerScanHeartbeat');

function fixture(write = async () => {}) {
  const rows = [], warnings = [];
  let time = 0, tick, cleared = false;
  const heartbeat = createWorkerScanHeartbeat({
    write: async row => { rows.push(row); await write(row); }, now: () => new Date(time),
    setTimer: callback => { tick = callback; return { unref() {} }; },
    clearTimer: () => { cleared = true; }, warn: item => warnings.push(item)
  });
  return { heartbeat, rows, warnings, advance: ms => { time = ms; tick(); },
    get cleared() { return cleared; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('long scan refreshes liveness without changing start or hiding overdue scan', async () => {
  const f = fixture(); await f.heartbeat.start();
  f.heartbeat.stage('collection', () => 'active=2,waiting=1');
  f.advance(30000); await flush();
  f.advance(601000); await flush();
  assert.equal(f.rows.length, 3);
  assert(f.rows.every(row => row.scanStartedAt.getTime() === 0 && row.scanFinishedAt === null));
  assert.equal(f.rows.at(-1).currentScan, 'collection:active=2,waiting=1');
  assert.equal(f.warnings[0].errorCode, 'WORKER_SCAN_OVERDUE');
  f.advance(630000); await flush(); assert.equal(f.warnings.length, 1);
  await f.heartbeat.finish('completed'); assert(f.cleared);
  assert.equal(f.rows.at(-1).scanStatus, 'completed');
  assert.equal(f.rows.at(-1).scanStartedAt.getTime(), 0);
});

test('no overlapping ticks and final completion cannot be overwritten by a delayed tick', async () => {
  let release;
  const f = fixture(row => row.currentScan === 'blocked' ? new Promise(resolve => { release = resolve; }) : undefined);
  await f.heartbeat.start(); f.heartbeat.stage('blocked');
  f.advance(30000); await flush(); f.advance(60000); await flush();
  assert.equal(f.rows.length, 2);
  const finished = f.heartbeat.finish('failed', 'isolated failure');
  await flush(); assert.equal(f.rows.length, 2);
  release(); await finished;
  assert.equal(f.rows.at(-1).scanStatus, 'failed');
  f.advance(90000); await flush(); assert.equal(f.rows.length, 3);
});

test('failed liveness write is contained and a later tick recovers', async () => {
  let fail = false;
  const f = fixture(() => { if (fail) throw new Error('isolated write failure'); });
  await f.heartbeat.start(); fail = true; f.advance(30000); await flush();
  fail = false; f.advance(60000); await flush();
  await f.heartbeat.finish('completed');
  assert.equal(f.rows.length, 4);
  assert.equal(f.rows.at(-1).scanStatus, 'completed');
});

test('real runOnce integration keeps heartbeating while collection is blocked, then closes cleanly', async t => {
  const { runOnce } = require('../src/worker');
  t.mock.timers.enable({ apis: ['setInterval'] });
  let release;
  const rows = [];
  const repo = {
    async upsertWorkerHeartbeat(row) { rows.push(row); },
    async listManualDueSources() { return []; },
    async listDueSources() { return [{ id: 'isolated-heartbeat-source' }]; }
  };
  const scan = runOnce({ repo, unifiedScheduler: { mode: 'off' },
    runSource: () => new Promise(resolve => { release = resolve; }) });
  await flush(); assert.equal(typeof release, 'function');
  t.mock.timers.tick(30000); await flush();
  assert.match(rows.at(-1).currentScan, /^collection:active=1,waiting=0$/);
  assert.equal(rows.at(-1).scanStartedAt, rows[0].scanStartedAt);
  release(); await scan;
  assert.equal(rows.at(-1).scanStatus, 'completed');
  const count = rows.length; t.mock.timers.tick(60000); await flush();
  assert.equal(rows.length, count);
});
