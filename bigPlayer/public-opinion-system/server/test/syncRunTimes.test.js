'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeSyncRunTimes } = require('../src/services/syncRunTimes');
const { Repository } = require('../src/db/repository');

test('mixed historical submission clocks are withheld without inventing a corrected timestamp', () => {
  const row = { created_at: '2026-10-15 14:00:59', requested_at: '2026-10-15 14:00:59', started_at: '2026-10-15 06:02:34', finished_at: '2026-10-15 06:09:54' };
  const normalized = normalizeSyncRunTimes(row);
  assert.equal(normalized.created_at, null);
  assert.equal(normalized.requested_at, null);
  assert.deepEqual(normalized.raw_time_fields, { created_at: row.created_at, requested_at: row.requested_at });
  assert.match(normalized.timestamp_warning, /原始值已保留/);
  assert.equal(row.created_at, '2026-10-15 14:00:59');
  assert.equal(normalized.started_at, row.started_at);
});

test('valid UTC, queued rows and a submission in an earlier day are preserved', () => {
  for (const row of [
    { created_at: '2026-10-15 06:00:59', requested_at: '2026-10-15 06:00:59', started_at: '2026-10-15 06:02:34' },
    { created_at: '2026-10-15 14:00:59', requested_at: '2026-10-15 14:00:59', started_at: null },
    { created_at: '2026-10-14 23:59:00', started_at: '2026-10-15 00:01:00' }
  ]) assert.equal(normalizeSyncRunTimes(row), row);
});

test('parent execution and explicit timezone timestamps also detect impossible chronology', () => {
  const parent = normalizeSyncRunTimes({ created_at: '2026-10-15T14:00:59Z', display_started_at: '2026-10-15T14:02:34+08:00' });
  assert.equal(parent.created_at, null);
  assert.equal(normalizeSyncRunTimes(null), null);
});

test('detail and task list apply the same historical read compatibility', async () => {
  const row = { id: 'historical-run', created_at: '2026-10-15 14:00:59', requested_at: '2026-10-15 14:00:59', started_at: '2026-10-15 06:02:34' };
  const repo = Object.create(Repository.prototype);
  repo.getSyncRunProjection = async () => 'r.id,r.created_at,r.requested_at,r.started_at';
  repo.query = async sql => {
    if (sql.startsWith('SELECT COUNT(*)')) return [{ total: 1 }];
    if (sql.startsWith('SELECT scope.root_id')) return [];
    return [{ ...row }];
  };
  assert.equal((await repo.getSyncRun(row.id)).created_at, null);
  const result = await repo.listSyncRuns();
  assert.equal(result.items[0].created_at, null);
  assert.equal(result.items[0].raw_time_fields.created_at, row.created_at);
  assert.equal(result.total, 1);
});

test('every runtime task writer supplies UTC creation and request times explicitly', () => {
  let inserts = 0;
  for (const folder of ['server/src', 'worker/src']) {
    const root = path.resolve(__dirname, '../..', folder);
    for (const item of fs.readdirSync(root, { recursive: true })) {
      if (!item.endsWith('.js')) continue;
      const file = path.join(root, item);
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/INSERT INTO po_sync_runs\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)(?:['"`]|\n)/g)) {
        inserts++;
        assert.match(match[1], /^created_at,requested_at,/, file);
        assert.match(match[2], /^UTC_TIMESTAMP\(3\),UTC_TIMESTAMP\(3\),/, file);
      }
    }
  }
  assert.ok(inserts >= 19, 'all manual, scheduled, parent and site inserts covered');
});
