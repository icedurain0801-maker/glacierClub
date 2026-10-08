const { loadRuntimeEnv } = require('../runtimeEnv');
loadRuntimeEnv();

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

function connConfig(env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  return {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'public_opinion'
  };
}

const MIGRATION_023 = '023_unified_source_scheduling.sql';
const MIGRATION_028 = '028_bigplayer_scheduled_site_runs.sql';
const MIGRATION_023_CHECKS = [
  {
    table: 'po_translation_jobs',
    constraint: 'po_translation_jobs_status_chk',
    definitions: ["`status` in ('pending','running','retryable','completed','failed')"]
  },
  {
    table: 'po_sync_runs',
    constraint: 'po_sync_runs_trigger_slot_chk',
    definitions: [
      "(`trigger_type` in ('legacy','manual') and `scheduled_at` is null) or (`trigger_type` in ('scheduled','scheduled_catchup') and `scheduled_at` is not null)",
      "`trigger_type` in ('legacy','manual') and `scheduled_at` is null or `trigger_type` in ('scheduled','scheduled_catchup') and `scheduled_at` is not null"
    ]
  }
];
const MIGRATION_028_CHECKS = [
  {
    table: 'po_sync_runs',
    constraint: 'po_sync_runs_trigger_slot_chk',
    definitions: [
      "(`trigger_type` in ('legacy','manual','scheduled_site') and `scheduled_at` is null) or (`trigger_type` in ('scheduled','scheduled_catchup') and `scheduled_at` is not null)",
      "`trigger_type` in ('legacy','manual','scheduled_site') and `scheduled_at` is null or `trigger_type` in ('scheduled','scheduled_catchup') and `scheduled_at` is not null"
    ]
  }
];
const MIGRATION_027_PREREQUISITES = [
  ['po_sources', 'id', 'char(36)'],
  ['po_accounts', 'source_id', 'char(36)'],
  ['po_sync_runs', 'id', 'char(36)'],
  ['po_sync_runs', 'source_id', 'char(36)'],
  ['po_sync_checkpoints', 'account_id', 'char(36)'],
  ['po_sync_checkpoints', 'task_kind', 'varchar(40)'],
  ['po_sync_checkpoints', 'task_key', 'varchar(255)'],
  ['po_sync_checkpoints', 'window_start', 'varchar(32)'],
  ['po_sync_checkpoints', 'window_end', 'varchar(32)']
];

async function validateMigration027Prerequisites(connection, applied) {
  const requiredVersions = [
    '023_unified_source_scheduling.sql',
    '025_worker_scan_leases.sql',
    '026_scheduler_runtime_schema_reconciliation.sql'
  ];
  const missingVersions = requiredVersions.filter(version => !applied.has(version));
  const [rows] = await connection.query(
    `SELECT table_name, column_name, column_type FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name IN (?,?,?,?)`,
    ['po_sources', 'po_accounts', 'po_sync_runs', 'po_sync_checkpoints']
  );
  const actual = new Map(rows.map(row => [`${row.table_name}.${row.column_name}`, row.column_type.toLowerCase()]));
  const missingColumns = MIGRATION_027_PREREQUISITES
    .filter(([table, column, type]) => !actual.has(`${table}.${column}`) || actual.get(`${table}.${column}`) !== type)
    .map(([table, column, type]) => `${table}.${column}=${type}`);
  if (missingVersions.length || missingColumns.length) {
    const error = new Error(`027 prerequisites not ready; versions=${missingVersions.join(',') || 'ok'} columns=${missingColumns.join(',') || 'ok'}`);
    error.code = 'MIGRATION_027_PREREQUISITE_NOT_READY';
    throw error;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractCheckDefinition(createTableSql, constraintName) {
  const constraintPattern = new RegExp(`\\bCONSTRAINT\\s+(?:\`${escapeRegExp(constraintName)}\`|${escapeRegExp(constraintName)})\\s+CHECK\\s*`, 'i');
  const match = constraintPattern.exec(createTableSql);
  if (!match) return null;

  const openingIndex = createTableSql.indexOf('(', match.index + match[0].length);
  if (openingIndex === -1) return null;

  let depth = 0;
  let quote = null;
  for (let index = openingIndex; index < createTableSql.length; index += 1) {
    const char = createTableSql[index];
    if (quote) {
      if (char === quote) {
        if (createTableSql[index + 1] === quote) index += 1;
        else quote = null;
      } else if (char === '\\' && quote !== '`') {
        index += 1;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return createTableSql.slice(openingIndex + 1, index);
    }
  }
  return null;
}

function normalizeCheckDefinition(definition) {
  return definition.replace(/`/g, '').replace(/\s+/g, '').toLowerCase();
}

function hasOneOuterParenthesis(definition) {
  if (!definition.startsWith('(') || !definition.endsWith(')')) return false;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < definition.length; index += 1) {
    const char = definition[index];
    if (quote) {
      if (char === quote) {
        if (definition[index + 1] === quote) index += 1;
        else quote = null;
      } else if (char === '\\' && quote !== '`') {
        index += 1;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0 && index < definition.length - 1) return false;
  }
  return depth === 0;
}

function matchesCheckDefinition(actual, expected) {
  const normalizedActual = normalizeCheckDefinition(actual);
  const normalizedExpected = normalizeCheckDefinition(expected);
  if (normalizedActual === normalizedExpected) return true;
  return hasOneOuterParenthesis(normalizedActual)
    && normalizedActual.slice(1, -1) === normalizedExpected;
}

function checkDefinitionMismatch(table, constraint) {
  const error = new Error(`023 CHECK definition mismatch: ${table}.${constraint}`);
  error.code = 'MIGRATION_023_CHECK_DEFINITION_MISMATCH';
  return error;
}

async function validateMigrationChecks(connection, checks = MIGRATION_023_CHECKS) {
  for (const expected of checks) {
    const [rows] = await connection.query(`SHOW CREATE TABLE ${expected.table}`);
    const createTableSql = rows?.[0]?.['Create Table'];
    const actual = typeof createTableSql === 'string'
      ? extractCheckDefinition(createTableSql, expected.constraint)
      : null;
    if (actual === null || !expected.definitions.some(definition => matchesCheckDefinition(actual, definition))) {
      throw checkDefinitionMismatch(expected.table, expected.constraint);
    }
  }
}

async function applyMigration({ connection, file, sql, logger = console }) {
  await connection.query(sql);
  if (file === MIGRATION_023) await validateMigrationChecks(connection, MIGRATION_023_CHECKS);
  if (file === MIGRATION_028) await validateMigrationChecks(connection, MIGRATION_028_CHECKS);
  await connection.query('INSERT INTO po_schema_migrations (version) VALUES (?)', [file]);
  logger.log(`migration applied: ${file}`);
}

async function runMigrations({
  env = process.env,
  mysqlClient = mysql,
  fileSystem = fs,
  logger = console,
  only = process.argv[2],
  migrationsDir = path.join(__dirname, '..', '..', '..', 'migrations')
} = {}) {
  let conn;
  let primaryError;
  try {
    const config = connConfig(env);
    conn = await mysqlClient.createConnection({ ...(typeof config === 'string' ? { uri: config } : config), multipleStatements: true });
    await conn.query('CREATE TABLE IF NOT EXISTS po_schema_migrations (version VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    const [done] = await conn.query('SELECT version FROM po_schema_migrations');
    const applied = new Set(done.map(row => row.version));
    const files = only ? [path.basename(only)] : fileSystem.readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) { logger.log(`skip (already applied): ${file}`); continue; }
      if (file === '027_bigplayer_multisite.sql') await validateMigration027Prerequisites(conn, applied);
      const sql = fileSystem.readFileSync(path.join(migrationsDir, file), 'utf8');
      await applyMigration({ connection: conn, file, sql, logger });
      applied.add(file);
    }
  } catch (error) {
    primaryError = error;
  } finally {
    if (conn) {
      try {
        await conn.end();
      } catch (closeError) {
        if (!primaryError) primaryError = closeError;
      }
    }
  }
  if (primaryError) throw primaryError;
  logger.log('all migrations up to date');
}

async function main() {
  await runMigrations();
}
if (require.main === module) {
  main().catch(error => { console.error(error.code ? `${error.code}: ${error.message}` : error.message); process.exitCode = 1; });
}

module.exports = { applyMigration, runMigrations };
