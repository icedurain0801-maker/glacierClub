const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '../../migrations/027_bigplayer_multisite.sql'), 'utf8');

test('027 migration creates per-source site registry and preserves legacy baseUrl', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS po_source_sites/i);
  assert.match(migration, /UNIQUE KEY po_source_sites_source_site_uk \(source_id, site_id\)/i);
  assert.match(migration, /UNIQUE KEY po_source_sites_source_url_hash_uk \(source_id, url_hash\)/i);
  assert.match(migration, /s\.platform='bigplayer_h5'/i);
  assert.match(migration, /JSON_EXTRACT\(s\.config, '\$\.baseUrl'\)/i);
  assert.match(migration, /CONCAT\('legacy-', LEFT\(SHA2/i);
});

test('027 migration adds parent/site audit fields without deleting historical rows', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS parent_run_id CHAR\(36\) NULL/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS site_id VARCHAR\(120\) NULL/i);
  assert.match(migration, /po_sync_runs_parent_fk/i);
  assert.match(migration, /UPDATE po_sync_checkpoints cp[\s\S]*SET cp\.site_id=ss\.site_id/i);
  assert.match(migration, /po_sync_checkpoints_site_window_uk[\s\S]*account_id, site_id, task_kind/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+po_sync_(runs|checkpoints)/i);
});

test('027 migration scopes URL deduplication and site identity per source', () => {
  assert.match(migration, /url_hash CHAR\(64\) NOT NULL/i);
  assert.match(migration, /SHA2\(TRIM\(JSON_UNQUOTE\(JSON_EXTRACT\(s\.config, '\$\.baseUrl'\)\)\), 256\)/i);
  assert.match(migration, /WHERE cp\.site_id IS NULL AND ss\.site_id LIKE 'legacy-%'/i);
});

test('persisted site identity is authoritative and migration only fills NULL checkpoint site IDs', () => {
  assert.match(migration, /WHERE cp\.site_id IS NULL/i);
  assert.doesNotMatch(migration, /SET cp\.site_id=.*\nWHERE cp\.site_id\s*<>\s*NULL/i);
});
