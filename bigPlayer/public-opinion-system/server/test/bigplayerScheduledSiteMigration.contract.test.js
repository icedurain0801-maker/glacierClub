const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '../../migrations/028_bigplayer_scheduled_site_runs.sql'), 'utf8');

test('028 keeps the parent source schedule slot and permits only internal scheduled_site children without a slot', () => {
  assert.match(migration, /DROP CONSTRAINT po_sync_runs_trigger_slot_chk/i);
  assert.match(migration, /trigger_type IN \('legacy','manual','scheduled_site'\) AND scheduled_at IS NULL/i);
  assert.match(migration, /trigger_type IN \('scheduled','scheduled_catchup'\) AND scheduled_at IS NOT NULL/i);
  assert.doesNotMatch(migration, /DROP INDEX po_sync_runs_source_schedule_uk/i);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+po_sync_runs/i);
});
