const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const runnerPath = path.resolve(__dirname, '..', 'src', 'db', 'migrate.js');
const runnerSource = fs.readFileSync(runnerPath, 'utf8');

const translationCheck = "`status` in ('pending','running','retryable','completed','failed')";
const triggerCheck = "(`trigger_type` in ('legacy','manual') and `scheduled_at` is null) or (`trigger_type` in ('scheduled','scheduled_catchup') and `scheduled_at` is not null)";
const mariaDb4C2TriggerCheck = "`trigger_type` in ('legacy','manual') and `scheduled_at` is null or `trigger_type` in ('scheduled','scheduled_catchup') and `scheduled_at` is not null";

function createSql(table, constraint, definition) {
  return `CREATE TABLE \`${table}\` (\n  CONSTRAINT \`${constraint}\` CHECK (${definition})\n) ENGINE=InnoDB`;
}

function fakeConnection(definitions) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === 'migration sql') return [{ affectedRows: 0 }];
      if (sql === 'SHOW CREATE TABLE po_translation_jobs') return [[{
        Table: 'po_translation_jobs',
        'Create Table': createSql('po_translation_jobs', 'po_translation_jobs_status_chk', definitions.translation)
      }]];
      if (sql === 'SHOW CREATE TABLE po_sync_runs') return [[{
        Table: 'po_sync_runs',
        'Create Table': createSql('po_sync_runs', 'po_sync_runs_trigger_slot_chk', definitions.trigger)
      }]];
      if (sql === 'INSERT INTO po_schema_migrations (version) VALUES (?)') return [{ affectedRows: 1 }];
      throw new Error(`unexpected query: ${sql}`);
    }
  };
}

test('023 validates complete SHOW CREATE definitions before writing its ledger row', async () => {
  assert.match(runnerSource, /if \(require\.main === module\)/, 'runner must be import-safe');
  const { applyMigration } = require('../src/db/migrate');
  const connection = fakeConnection({ translation: translationCheck, trigger: triggerCheck });

  await applyMigration({ connection, file: '023_unified_source_scheduling.sql', sql: 'migration sql', logger: { log() {} } });

  assert.deepEqual(connection.calls.map(call => call.sql), [
    'migration sql',
    'SHOW CREATE TABLE po_translation_jobs',
    'SHOW CREATE TABLE po_sync_runs',
    'INSERT INTO po_schema_migrations (version) VALUES (?)'
  ]);
  assert.deepEqual(connection.calls[3].params, ['023_unified_source_scheduling.sql']);
});

test('one outer CHECK parenthesis is accepted', async () => {
  assert.match(runnerSource, /if \(require\.main === module\)/, 'runner must be import-safe');
  const { applyMigration } = require('../src/db/migrate');
  const connection = fakeConnection({ translation: `(${translationCheck})`, trigger: `(${triggerCheck})` });
  await applyMigration({ connection, file: '023_unified_source_scheduling.sql', sql: 'migration sql', logger: { log() {} } });
  assert.equal(connection.calls.at(-1).sql, 'INSERT INTO po_schema_migrations (version) VALUES (?)');
});

test('MariaDB 4C-2 trigger CHECK without branch parentheses writes the 023 ledger row', async () => {
  assert.match(runnerSource, /if \(require\.main === module\)/, 'runner must be import-safe');
  const { applyMigration } = require('../src/db/migrate');
  const connection = fakeConnection({ translation: translationCheck, trigger: mariaDb4C2TriggerCheck });

  await applyMigration({ connection, file: '023_unified_source_scheduling.sql', sql: 'migration sql', logger: { log() {} } });

  assert.equal(connection.calls.at(-1).sql, 'INSERT INTO po_schema_migrations (version) VALUES (?)');
  assert.deepEqual(connection.calls.at(-1).params, ['023_unified_source_scheduling.sql']);
});

test('MariaDB 4C-2 trigger CHECK with one outer parenthesis writes the 023 ledger row', async () => {
  assert.match(runnerSource, /if \(require\.main === module\)/, 'runner must be import-safe');
  const { applyMigration } = require('../src/db/migrate');
  const connection = fakeConnection({ translation: translationCheck, trigger: `(${mariaDb4C2TriggerCheck})` });

  await applyMigration({ connection, file: '023_unified_source_scheduling.sql', sql: 'migration sql', logger: { log() {} } });

  assert.equal(connection.calls.at(-1).sql, 'INSERT INTO po_schema_migrations (version) VALUES (?)');
  assert.deepEqual(connection.calls.at(-1).params, ['023_unified_source_scheduling.sql']);
});

test('wrong enum, OR 1=1, and extra restrictions fail before the 023 ledger write', async () => {
  assert.match(runnerSource, /if \(require\.main === module\)/, 'runner must be import-safe');
  const { applyMigration } = require('../src/db/migrate');
  const variants = [
    { translation: translationCheck.replace("'failed'", "'cancelled'"), trigger: triggerCheck },
    { translation: translationCheck, trigger: `${triggerCheck} or 1=1` },
    { translation: `${translationCheck} and status<>'failed'`, trigger: triggerCheck }
  ];

  for (const definitions of variants) {
    const connection = fakeConnection(definitions);
    await assert.rejects(
      () => applyMigration({ connection, file: '023_unified_source_scheduling.sql', sql: 'migration sql', logger: { log() {} } }),
      error => error?.code === 'MIGRATION_023_CHECK_DEFINITION_MISMATCH'
    );
    assert.equal(connection.calls.some(call => call.sql.startsWith('INSERT INTO po_schema_migrations')), false);
  }
});

test('MariaDB 4C-2 trigger CHECK aliases reject changed or unknown definitions before the 023 ledger write', async () => {
  assert.match(runnerSource, /if \(require\.main === module\)/, 'runner must be import-safe');
  const { applyMigration } = require('../src/db/migrate');
  const variants = [
    mariaDb4C2TriggerCheck.replace(",'manual'", ''),
    `${mariaDb4C2TriggerCheck} or 1=1`,
    `${mariaDb4C2TriggerCheck} and \`trigger_type\`<>'legacy'`,
    '`trigger_type` is not null'
  ];

  for (const trigger of variants) {
    const connection = fakeConnection({ translation: translationCheck, trigger });
    await assert.rejects(
      () => applyMigration({ connection, file: '023_unified_source_scheduling.sql', sql: 'migration sql', logger: { log() {} } }),
      error => error?.code === 'MIGRATION_023_CHECK_DEFINITION_MISMATCH'
    );
    assert.equal(connection.calls.some(call => call.sql.startsWith('INSERT INTO po_schema_migrations')), false);
  }
});

test('non-023 migration behavior remains execute then ledger without SHOW CREATE', async () => {
  assert.match(runnerSource, /if \(require\.main === module\)/, 'runner must be import-safe');
  const { applyMigration } = require('../src/db/migrate');
  const calls = [];
  const connection = { async query(sql, params = []) { calls.push({ sql, params }); return [{ affectedRows: 1 }]; } };

  await applyMigration({ connection, file: '001_initial.sql', sql: 'migration sql', logger: { log() {} } });

  assert.deepEqual(calls, [
    { sql: 'migration sql', params: [] },
    { sql: 'INSERT INTO po_schema_migrations (version) VALUES (?)', params: ['001_initial.sql'] }
  ]);
});

function orchestrationHarness({ file, migrationError, endError, definitions }) {
  const calls = [];
  let endCalls = 0;
  const connection = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS po_schema_migrations')) return [{ affectedRows: 0 }];
      if (sql === 'SELECT version FROM po_schema_migrations') return [[]];
      if (sql === 'migration sql') {
        if (migrationError) throw migrationError;
        return [{ affectedRows: 0 }];
      }
      if (sql === 'SHOW CREATE TABLE po_translation_jobs') return [[{
        Table: 'po_translation_jobs',
        'Create Table': createSql('po_translation_jobs', 'po_translation_jobs_status_chk', definitions.translation)
      }]];
      if (sql === 'SHOW CREATE TABLE po_sync_runs') return [[{
        Table: 'po_sync_runs',
        'Create Table': createSql('po_sync_runs', 'po_sync_runs_trigger_slot_chk', definitions.trigger)
      }]];
      if (sql === 'INSERT INTO po_schema_migrations (version) VALUES (?)') return [{ affectedRows: 1 }];
      throw new Error(`unexpected query: ${sql}`);
    },
    async end() {
      endCalls += 1;
      calls.push({ sql: 'connection.end', params: [] });
      if (endError) throw endError;
    }
  };
  return {
    calls,
    connection,
    get endCalls() { return endCalls; },
    options: {
      env: {},
      mysqlClient: { async createConnection() { return connection; } },
      fileSystem: { readFileSync() { return 'migration sql'; } },
      logger: { log() {} },
      only: file,
      migrationsDir: '/mock/migrations'
    }
  };
}

test('023 failure closes once, writes no ledger, and preserves the primary error when close also fails', async () => {
  const { runMigrations } = require('../src/db/migrate');
  const closeError = Object.assign(new Error('close failed'), { code: 'END_FAILED' });
  const harness = orchestrationHarness({
    file: '023_unified_source_scheduling.sql',
    endError: closeError,
    definitions: { translation: translationCheck.replace("'failed'", "'cancelled'"), trigger: triggerCheck }
  });

  await assert.rejects(
    () => runMigrations(harness.options),
    error => error?.code === 'MIGRATION_023_CHECK_DEFINITION_MISMATCH'
  );
  assert.equal(harness.endCalls, 1);
  assert.equal(harness.calls.some(call => call.sql.startsWith('INSERT INTO po_schema_migrations')), false);
  assert.equal(harness.calls.at(-1).sql, 'connection.end');
});

test('ordinary migration failure closes once, preserves the error object, and writes no ledger', async () => {
  const { runMigrations } = require('../src/db/migrate');
  const migrationError = Object.assign(new Error('migration failed'), { code: 'MIGRATION_SQL_FAILED' });
  const harness = orchestrationHarness({
    file: '001_initial.sql',
    migrationError,
    definitions: { translation: translationCheck, trigger: triggerCheck }
  });

  await assert.rejects(() => runMigrations(harness.options), error => error === migrationError);
  assert.equal(harness.endCalls, 1);
  assert.equal(harness.calls.some(call => call.sql.startsWith('INSERT INTO po_schema_migrations')), false);
  assert.equal(harness.calls.some(call => call.sql.startsWith('SHOW CREATE TABLE')), false);
});

test('successful migration writes its ledger row and closes exactly once as the final operation', async () => {
  const { runMigrations } = require('../src/db/migrate');
  const harness = orchestrationHarness({
    file: '001_initial.sql',
    definitions: { translation: translationCheck, trigger: triggerCheck }
  });

  await runMigrations(harness.options);
  assert.equal(harness.endCalls, 1);
  assert.deepEqual(harness.calls.at(-2), {
    sql: 'INSERT INTO po_schema_migrations (version) VALUES (?)',
    params: ['001_initial.sql']
  });
  assert.equal(harness.calls.at(-1).sql, 'connection.end');
});
