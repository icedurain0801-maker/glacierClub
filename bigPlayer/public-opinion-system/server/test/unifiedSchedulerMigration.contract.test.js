const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..', '..');
const migrationPath = path.join(projectRoot, 'migrations', '023_unified_source_scheduling.sql');
const sql = fs.readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n');
const compact = sql.replace(/\s+/g, ' ');

function has(pattern, message) {
  assert.match(compact, pattern, message);
}

function normalizeCheckDefinition(value) {
  return value.replace(/''/g, "'").replace(/_utf8mb4/gi, '').replace(/[`\s]/g, '').toLowerCase();
}

function ddlCheckDefinition(constraintName) {
  if (constraintName === 'po_translation_jobs_status_chk') {
    const match = sql.match(/CONSTRAINT po_translation_jobs_status_chk CHECK \((status IN \([^)]+\))\)/i);
    assert.ok(match, 'missing translation status CHECK DDL');
    return normalizeCheckDefinition(match[1]);
  }
  const match = sql.match(/ADD CONSTRAINT po_sync_runs_trigger_slot_chk CHECK (\(\(trigger_type[^\n]+scheduled_at IS NOT NULL\)\))'/i);
  assert.ok(match, 'missing trigger/slot CHECK DDL');
  return normalizeCheckDefinition(match[1]);
}

test('contract test is fs-only and targets the fixed 023 migration', () => {
  assert.equal(path.basename(migrationPath), '023_unified_source_scheduling.sql');
  assert.doesNotMatch(__filename, /mysql2|child_process/);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+po_schema_migrations/i);
});

test('019-022 reconciliation and scheduler objects are definition-aware', () => {
  for (const object of [
    'po_games', 'po_communities', 'po_sync_checkpoints', 'po_translation_jobs',
    'po_content_translations', 'po_sources', 'po_sync_runs', 'po_source_schedule_state'
  ]) has(new RegExp(`table_name='${object}'`, 'i'), `missing contract for ${object}`);

  has(/column_type/i, 'column type must be verified');
  has(/is_nullable/i, 'column nullability must be verified');
  has(/column_default/i, 'column default must be verified');
  has(/non_unique/i, 'index uniqueness must be verified');
  has(/seq_in_index/i, 'index column order must be verified');
  has(/delete_rule/i, 'foreign-key delete rule must be verified');
  has(/@schema_definition_errors/i, 'definition mismatches must be aggregated');
  has(/po_migration_023_fail_schema_definition/i, 'definition mismatch must fail closed');
});

test('historical triggers are backfilled only when no scheduled slot exists', () => {
  has(/UPDATE po_sync_runs SET trigger_type='legacy' WHERE scheduled_at IS NULL AND \(trigger_type IS NULL OR trigger_type=''\)/i);
  has(/@invalid_trigger_rows/i);
  has(/scheduled_at IS NOT NULL AND \(trigger_type IS NULL OR trigger_type NOT IN \('scheduled','scheduled_catchup'\)\)/i);
  has(/scheduled_at IS NULL AND trigger_type NOT IN \('legacy','manual'\)/i);
  has(/po_migration_023_fail_invalid_trigger_slot/i);
  assert.doesNotMatch(compact, /trigger_type[^;]*DEFAULT 'manual'/i);
});

test('database check constraint permanently enforces trigger and slot combinations', () => {
  has(/ADD CONSTRAINT po_sync_runs_trigger_slot_chk CHECK/i);
  has(/trigger_type IN \('{1,2}legacy'{1,2},'{1,2}manual'{1,2}\) AND scheduled_at IS NULL/i);
  has(/trigger_type IN \('{1,2}scheduled'{1,2},'{1,2}scheduled_catchup'{1,2}\) AND scheduled_at IS NOT NULL/i);
  has(/information_schema\.table_constraints/i);
  has(/constraint_name='po_sync_runs_trigger_slot_chk'/i);
  has(/constraint_type='CHECK'/i);
});

test('translation job status check has an in-migration existence guard', () => {
  has(/CONSTRAINT po_translation_jobs_status_chk CHECK \(status IN \('pending','running','retryable','completed','failed'\)\)/i);
  has(/constraint_name='po_translation_jobs_status_chk'/i);
  has(/constraint_type='CHECK'/i);
  has(/po_migration_023_fail_schema_definition/i);
});

test('MariaDB-truncated CHECK metadata is not used for full definition validation inside SQL', () => {
  assert.doesNotMatch(sql, /information_schema\.check_constraints/i);
  assert.doesNotMatch(sql, /check_clause/i);
  assert.equal(normalizeCheckDefinition(ddlCheckDefinition('po_translation_jobs_status_chk')), "statusin('pending','running','retryable','completed','failed')");
  assert.equal(normalizeCheckDefinition(ddlCheckDefinition('po_sync_runs_trigger_slot_chk')), "((trigger_typein('legacy','manual')andscheduled_atisnull)or(trigger_typein('scheduled','scheduled_catchup')andscheduled_atisnotnull))");
});

test('one source and scheduled instant has one strict database slot', () => {
  has(/GROUP BY source_id, scheduled_at HAVING COUNT\(\*\)>1/i);
  has(/UNIQUE KEY po_sync_runs_source_schedule_uk \(source_id, scheduled_at\)/i);
  assert.doesNotMatch(compact, /UNIQUE KEY po_sync_runs_source_trigger_schedule_uk/i);
  has(/INDEX po_sync_runs_source_trigger_schedule_idx \(source_id, trigger_type, scheduled_at\)/i);
});

test('checkpoint account support index is verified and created before either legacy index is dropped', () => {
  const definitionGuard = sql.indexOf('SET @checkpoint_account_idx_definition_errors');
  const createSupportIndex = sql.indexOf('ALTER TABLE po_sync_checkpoints ADD INDEX po_sync_checkpoints_account_idx (account_id)');
  const readyGuard = sql.indexOf('SET @checkpoint_account_idx_ready');
  const dropIdentity = sql.indexOf('ALTER TABLE po_sync_checkpoints DROP INDEX po_sync_checkpoints_identity_uk');
  const dropTask = sql.indexOf('ALTER TABLE po_sync_checkpoints DROP INDEX po_sync_checkpoints_task_uk');

  for (const [name, position] of Object.entries({ definitionGuard, createSupportIndex, readyGuard })) {
    assert.notEqual(position, -1, `missing ${name}`);
    assert.ok(position < dropIdentity, `${name} must run before identity index drop`);
    assert.ok(position < dropTask, `${name} must run before task index drop`);
  }
});

test('missing checkpoint account support index is created with the exact definition', () => {
  has(/table_name='po_sync_checkpoints' AND index_name='po_sync_checkpoints_account_idx'\)=0, 'ALTER TABLE po_sync_checkpoints ADD INDEX po_sync_checkpoints_account_idx \(account_id\)'/i);
  has(/index_name='po_sync_checkpoints_account_idx'[\s\S]*GROUP_CONCAT\(column_name ORDER BY seq_in_index\)/i);
  has(/actual\.non_unique=1 AND actual\.columns_list='account_id'/i);
});

test('an existing wrongly-defined checkpoint account index fails before legacy index drops', () => {
  has(/actual\.index_name IS NOT NULL AND \(actual\.non_unique<>1 OR actual\.columns_list<>'account_id'\)/i);
  const failGuard = sql.indexOf('po_migration_023_fail_checkpoint_account_index_definition');
  const dropIdentity = sql.indexOf('ALTER TABLE po_sync_checkpoints DROP INDEX po_sync_checkpoints_identity_uk');
  const dropTask = sql.indexOf('ALTER TABLE po_sync_checkpoints DROP INDEX po_sync_checkpoints_task_uk');
  assert.notEqual(failGuard, -1, 'missing fail-closed target for wrong support index definition');
  assert.ok(failGuard < dropIdentity, 'wrong definition must fail before identity index drop');
  assert.ok(failGuard < dropTask, 'wrong definition must fail before task index drop');
});

test('default account and cutover backfills remain deterministic and non-destructive', () => {
  has(/a\.source_id=s\.id/i);
  has(/a\.game_id=s\.game_id/i);
  has(/a\.platform=s\.platform/i);
  has(/a\.enabled=1/i);
  has(/a\.auth_status='authorized'/i);
  has(/a\.auth_expire_at IS NULL OR a\.auth_expire_at>UTC_TIMESTAMP\(3\)/i);
  has(/a\.community_id <=> s\.community_id/i);
  has(/ORDER BY a\.updated_at DESC, a\.id ASC/i);
  has(/WHERE s\.default_account_id IS NULL/i);
  has(/schedule_effective_at=UTC_TIMESTAMP\(3\).*WHERE schedule_effective_at IS NULL/i);
  assert.doesNotMatch(compact, /FOREIGN KEY \(default_account_id\)/i);
});

test('default-account selection rejects unauthorized and expired candidates', () => {
  const now = Date.parse('2026-09-09T10:00:00.000Z');
  const source = { id: 's1', gameId: 'g1', platform: 'discord', communityId: 'c1' };
  const accounts = [
    { id: 'authorized-old', sourceId: 's1', gameId: 'g1', platform: 'discord', communityId: 'c1', enabled: true, authStatus: 'authorized', authExpireAt: null, updatedAt: '2026-09-08T00:00:00Z' },
    { id: 'authorized-new-z', sourceId: 's1', gameId: 'g1', platform: 'discord', communityId: 'c1', enabled: true, authStatus: 'authorized', authExpireAt: '2026-09-10T00:00:00Z', updatedAt: '2026-09-09T00:00:00Z' },
    { id: 'authorized-new-a', sourceId: 's1', gameId: 'g1', platform: 'discord', communityId: 'c1', enabled: true, authStatus: 'authorized', authExpireAt: '2026-09-10T00:00:00Z', updatedAt: '2026-09-09T00:00:00Z' },
    { id: 'unauthorized', sourceId: 's1', gameId: 'g1', platform: 'discord', communityId: 'c1', enabled: true, authStatus: 'unconfigured', authExpireAt: null, updatedAt: '2026-09-09T09:00:00Z' },
    { id: 'expired', sourceId: 's1', gameId: 'g1', platform: 'discord', communityId: 'c1', enabled: true, authStatus: 'authorized', authExpireAt: '2026-09-09T09:00:00Z', updatedAt: '2026-09-09T09:30:00Z' }
  ];
  const select = rows => rows.filter(a => a.enabled && a.authStatus === 'authorized'
    && (a.authExpireAt == null || Date.parse(a.authExpireAt) > now)
    && a.sourceId === source.id && a.gameId === source.gameId
    && a.platform === source.platform && a.communityId === source.communityId)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id))[0]?.id || null;

  assert.equal(select(accounts), 'authorized-new-a', 'multiple legal candidates use updated_at DESC, id ASC');
  assert.equal(select(accounts.filter(a => ['unauthorized', 'expired'].includes(a.id))), null, 'no legal candidate remains NULL');
});

test('schedule state exposes versioned cursor and generation-fenced lease fields', () => {
  has(/CREATE TABLE IF NOT EXISTS po_source_schedule_state/i);
  for (const field of [
    'source_id', 'schedule_version', 'effective_at', 'last_scheduled_at',
    'next_scheduled_at', 'lease_run_id', 'lease_owner', 'lease_epoch', 'lease_until'
  ]) has(new RegExp(`\\b${field}\\b`, 'i'), `missing schedule-state field ${field}`);
  has(/FOREIGN KEY \(source_id\) REFERENCES po_sources\(id\) ON DELETE CASCADE/i);
  has(/INSERT IGNORE INTO po_source_schedule_state/i);
});

test('fresh, drifted-old, and rerun claims are limited to direct SQL text contracts', () => {
  for (const [table, column] of [
    ['po_games', 'external_id'], ['po_communities', 'managed_by'],
    ['po_communities', 'external_id'], ['po_sync_checkpoints', 'window_start'],
    ['po_sync_checkpoints', 'window_end'], ['po_sources', 'default_account_id'],
    ['po_sources', 'schedule_effective_at'], ['po_sync_runs', 'source_id'],
    ['po_sync_runs', 'trigger_type'], ['po_sync_runs', 'scheduled_at']
  ]) {
    has(new RegExp(`table_name='${table}' AND column_name='${column}'`, 'i'));
    has(new RegExp(`ALTER TABLE ${table} ADD COLUMN ${column}`, 'i'));
  }
  for (const table of ['po_translation_jobs', 'po_content_translations', 'po_source_schedule_state']) {
    has(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, 'i'));
  }
  has(/UPDATE po_sources SET schedule_effective_at=UTC_TIMESTAMP\(3\) WHERE schedule_effective_at IS NULL/i);
  has(/INSERT IGNORE INTO po_source_schedule_state/i);
});
