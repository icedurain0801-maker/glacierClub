'use strict';

// Read-only production schema evidence. This module never writes to the target DB.
const TABLES = ['po_sync_runs', 'po_sync_checkpoints', 'po_sources', 'po_accounts'];

function normalizeCreateSql(value) {
  return String(value || '')
    .replace(/AUTO_INCREMENT=\d+/gi, 'AUTO_INCREMENT=?')
    .replace(/\s+/g, ' ')
    .trim();
}

async function querySnapshot(connection) {
  const [versionRows] = await connection.query('SELECT VERSION() AS version');
  const [columns] = await connection.query(
    `SELECT table_name, column_name, ordinal_position, column_type, is_nullable,
            column_default, character_set_name, collation_name, column_key
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name IN (?)
      ORDER BY table_name, ordinal_position`,
    [TABLES]
  );
  const [constraints] = await connection.query(
    `SELECT k.table_name, k.constraint_name, k.column_name, k.referenced_table_name,
            k.referenced_column_name, r.update_rule, r.delete_rule
       FROM information_schema.key_column_usage k
       LEFT JOIN information_schema.referential_constraints r
         ON r.constraint_schema = k.constraint_schema
        AND r.table_name = k.table_name
        AND r.constraint_name = k.constraint_name
      WHERE k.constraint_schema = DATABASE()
        AND k.table_name IN (?)
        AND k.referenced_table_name IS NOT NULL
      ORDER BY k.table_name, k.constraint_name, k.ordinal_position`,
    [TABLES]
  );
  const [indexes] = await connection.query(
    `SELECT table_name, index_name, non_unique, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_list
       FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name IN (?)
      GROUP BY table_name, index_name, non_unique
      ORDER BY table_name, index_name`,
    [TABLES]
  );
  const create = {};
  for (const table of TABLES) {
    try {
      const [rows] = await connection.query(`SHOW CREATE TABLE \`${table}\``);
      create[table] = normalizeCreateSql(rows?.[0]?.['Create Table']);
    } catch (error) {
      // Missing optional tables are evidence, not a probe failure.
      create[table] = { unavailable: true, code: error.code || 'SHOW_CREATE_FAILED' };
    }
  }
  const [tableRows] = await connection.query(
    `SELECT table_name, table_rows AS estimated_rows
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name IN (?)
      ORDER BY table_name`,
    [TABLES]
  );
  let lockWaits;
  try {
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS lock_waits
         FROM information_schema.innodb_lock_waits`
    );
    lockWaits = { status: 'PASS', count: Number(rows?.[0]?.lock_waits || 0) };
  } catch (error) {
    lockWaits = { status: 'PENDING', reason: 'innodb_lock_waits_unavailable', code: error.code || 'QUERY_FAILED' };
  }
  return {
    version: versionRows?.[0]?.version || null,
    columns,
    constraints,
    indexes,
    create,
    rowCount: { policy: 'record_only', tables: tableRows },
    lockWaits
  };
}

function strictProjection(snapshot) {
  return {
    columns: snapshot.columns || [],
    constraints: snapshot.constraints || [],
    indexes: snapshot.indexes || [],
    create: snapshot.create || {}
  };
}

function compareStrict(baseline, actual) {
  const expected = JSON.stringify(strictProjection(baseline));
  const observed = JSON.stringify(strictProjection(actual));
  return {
    status: expected === observed ? 'PASS' : 'FAIL',
    compared: ['columns', 'constraints', 'indexes', 'create'],
    rowCountPolicy: 'record_only',
    differences: expected === observed ? [] : [{ expected, observed }]
  };
}

module.exports = { TABLES, normalizeCreateSql, querySnapshot, compareStrict };
