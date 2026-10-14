'use strict';

// Synthetic, database-free load test for the snapshot row stream.
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { performance } = require('node:perf_hooks');
const { tableManifest } = require('../../../server/src/db/snapshotManifest');

const SEED = 0x5eedc0de;
const CHUNK_SIZE = 10000;
const ROWS = 1000000;
const RSS_BUDGET_BYTES = 512 * 1024 * 1024;
const HEAP_BUDGET_BYTES = 256 * 1024 * 1024;
const columns = [
  { column_name: 'group_id', column_type: 'int', data_type: 'int' },
  { column_name: 'item_id', column_type: 'varchar(4)', data_type: 'varchar' },
  { column_name: 'payload', column_type: 'varbinary(80)', data_type: 'varbinary' }
];

function syntheticRow(index) {
  const group = Math.floor(index / 1000);
  const item = String(index % 1000).padStart(4, '0');
  const marker = ((Math.imul(index ^ SEED, 1664525) + 1013904223) >>> 0).toString(16).padStart(8, '0');
  const payload = Buffer.from(`synthetic-${marker}-`.repeat(4), 'ascii');
  return [Buffer.from(String(group), 'ascii'), Buffer.from(item, 'ascii'), payload];
}

function syntheticConnection(rowCount, observe) {
  let started = false;
  const raw = {
    destroyed: false,
    destroy() { this.destroyed = true; },
    query(options) {
      assert.equal(started, false, 'one streaming query per connection');
      started = true;
      assert.equal(options.rowsAsArray, true);
      assert.equal(options.typeCast, false);
      assert.match(options.sql, /ORDER BY `group_id`,`item_id`/);
      return {
        stream(streamOptions) {
          assert.equal(streamOptions.highWaterMark, 1);
          function* rows() {
            for (let index = 0; index < rowCount; index++) {
              if (index % 1000 === 0) observe(process.memoryUsage());
              yield syntheticRow(index);
            }
            observe(process.memoryUsage());
          }
          return Readable.from(rows(), { objectMode: true, highWaterMark: 1 });
        }
      };
    }
  };
  return { connection: raw, raw };
}

async function scan(rowCount) {
  let peakRss = 0;
  let peakHeap = 0;
  const observe = memory => {
    peakRss = Math.max(peakRss, memory.rss, process.resourceUsage().maxRSS * 1024);
    peakHeap = Math.max(peakHeap, memory.heapUsed);
  };
  observe(process.memoryUsage());
  const fake = syntheticConnection(rowCount, observe);
  const started = performance.now();
  const manifest = await tableManifest(fake, fake.raw, 'synthetic_items', columns, ['group_id', 'item_id'], {
    chunkSize: CHUNK_SIZE,
    maxRows: ROWS,
    maxFieldBytes: 1024,
    maxRowBytes: 4096,
    maxChunkBytes: 64 * 1024 * 1024,
    maxChunks: 200
  });
  observe(process.memoryUsage());
  assert.equal(fake.raw.destroyed, false);
  assert.equal(manifest.count, rowCount);
  assert.ok(peakRss <= RSS_BUDGET_BYTES, 'RSS budget exceeded');
  assert.ok(peakHeap <= HEAP_BUDGET_BYTES, 'heap budget exceeded');
  return {
    manifest,
    elapsedMs: Math.round(performance.now() - started),
    peakRssBytes: peakRss,
    peakHeapBytes: peakHeap
  };
}

async function main() {
  const boundary = [];
  for (const count of [9999, 10000, 10001]) {
    const run = await scan(count);
    const expected = count <= CHUNK_SIZE ? [count] : [CHUNK_SIZE, 1];
    assert.deepEqual(run.manifest.chunks.map(chunk => chunk.rows), expected);
    boundary.push({ rowCount: count, chunkRows: expected });
  }

  const first = await scan(ROWS);
  const second = await scan(ROWS);
  assert.equal(first.manifest.chunks.length, 100);
  assert.equal(second.manifest.chunks.length, 100);
  assert.ok(first.manifest.chunks.every(chunk => chunk.rows === CHUNK_SIZE));
  assert.deepEqual(first.manifest, second.manifest, 'fixed-seed repeated stream must have identical digest and boundaries');
  assert.match(first.manifest.chunks[0].firstKeyHash, /^[a-f0-9]{64}$/);
  assert.match(first.manifest.chunks.at(-1).lastKeyHash, /^[a-f0-9]{64}$/);
  const peakRssBytes = Math.max(first.peakRssBytes, second.peakRssBytes);
  const peakHeapBytes = Math.max(first.peakHeapBytes, second.peakHeapBytes);
  const elapsedMs = first.elapsedMs + second.elapsedMs;
  const result = {
    status: 'PASS_SYNTHETIC_STREAM_LOAD',
    databaseTouched: false,
    seed: SEED,
    rowCountPerPass: ROWS,
    passes: 2,
    chunkSize: CHUNK_SIZE,
    chunkCount: first.manifest.chunks.length,
    boundary,
    reproducibleDigest: true,
    tableDigest: first.manifest.digest,
    firstKeyHash: first.manifest.chunks[0].firstKeyHash,
    lastKeyHash: first.manifest.chunks.at(-1).lastKeyHash,
    elapsedMs,
    rowsPerSecond: Math.round((ROWS * 2 * 1000) / elapsedMs),
    peakRssBytes,
    peakHeapBytes,
    rssBudgetBytes: RSS_BUDGET_BYTES,
    heapBudgetBytes: HEAP_BUDGET_BYTES
  };
  process.stdout.write(JSON.stringify(result) + '\n');
}

main().catch(error => {
  const code = error?.code && /^MANIFEST_[A-Z_]+$/.test(error.code) ? error.code :
    error?.message === 'RSS budget exceeded' ? 'RSS_BUDGET_EXCEEDED' :
    error?.message === 'heap budget exceeded' ? 'HEAP_BUDGET_EXCEEDED' : 'SYNTHETIC_LOAD_FAILED';
  process.stderr.write(JSON.stringify({ status: 'NO_GO_SYNTHETIC_LOAD', code, databaseTouched: false }) + '\n');
  process.exitCode = 1;
});
