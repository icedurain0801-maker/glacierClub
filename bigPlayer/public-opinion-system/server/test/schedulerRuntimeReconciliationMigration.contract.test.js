const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..', '..');
const migrationPath = path.join(projectRoot, 'migrations', '026_scheduler_runtime_schema_reconciliation.sql');
const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');
const compact = sql.replace(/\s+/g, ' ');

test('026 is an additive reconciliation and never edits migration history', () => {
  assert.equal(path.basename(migrationPath), '026_scheduler_runtime_schema_reconciliation.sql');
  assert.doesNotMatch(sql, /(?:DELETE|UPDATE)\s+(?:FROM\s+)?po_schema_migrations/i);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|RENAME)\b/i);
  assert.doesNotMatch(sql, /\b(?:DELETE|UPDATE)\s+po_sync_runs\b/i);
});

test('026 idempotently adds the sync-run fencing epoch', () => {
  assert.match(compact, /information_schema\.columns[^;]+table_name='po_sync_runs'[^;]+column_name='lease_epoch'[^;]+ALTER TABLE po_sync_runs ADD COLUMN lease_epoch BIGINT UNSIGNED NOT NULL DEFAULT 0/i);
  assert.match(compact, /SELECT 'po_sync_runs' table_name, 'lease_epoch' column_name, 'bigint%unsigned' column_type, 'NO' is_nullable, '0' expected_default/i);
});

test('026 creates and validates the complete heartbeat contract', () => {
  assert.match(compact, /CREATE TABLE IF NOT EXISTS po_worker_heartbeats/i);
  for (const column of [
    'worker_id', 'build_sha', 'mode', 'last_seen_at', 'scan_started_at',
    'scan_finished_at', 'scan_status', 'scan_error', 'current_scan'
  ]) assert.match(compact, new RegExp(`'po_worker_heartbeats','${column}'`, 'i'));
  assert.match(compact, /SELECT 'po_worker_heartbeats' table_name, 'PRIMARY' index_name, 0 non_unique, 'worker_id' columns_list/i);
  assert.match(compact, /'po_worker_heartbeats','po_worker_heartbeats_seen_idx',1,'last_seen_at'/i);
  assert.match(compact, /'po_worker_heartbeats','po_worker_heartbeats_scan_idx',1,'scan_started_at,scan_finished_at'/i);
  assert.match(compact, /po_migration_026_fail_runtime_schema_definition/i);
});
