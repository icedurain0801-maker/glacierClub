'use strict';

const mysql = require('C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/node_modules/mysql2/promise.js');
const required = {
  po_contents: ['board_id', 'board_name', 'board_key'],
  po_sync_runs: ['board_id', 'site_url_snapshot']
};

async function main() {
  process.loadEnvFile('C:/ProgramData/PublicOpinion/config/public-opinion.env');
  if (process.env.DATABASE_URL || process.env.DB_HOST !== '127.0.0.1' || Number(process.env.DB_PORT) !== 3306 || process.env.DB_NAME !== 'public_opinion') throw Error('DB_TARGET_MISMATCH');
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME, timezone: 'Z', dateStrings: true, multipleStatements: false, connectTimeout: 3000 });
  try {
    const [[identity]] = await conn.query({ sql: 'SELECT CURRENT_USER() AS user_name,DATABASE() AS db_name,UTC_TIMESTAMP(3) AS observed_at', timeout: 8000 });
    if (identity.user_name !== 'root@localhost' || identity.db_name !== 'public_opinion') throw Error('IDENTITY_MISMATCH');
    const [columns] = await conn.query({ sql: `SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name IN ('po_contents','po_sync_runs') AND column_name IN ('board_id','board_name','board_key','site_url_snapshot')`, timeout: 8000 });
    const result = Object.fromEntries(Object.entries(required).map(([table, names]) => [table, Object.fromEntries(names.map(name => [name, columns.some(row => row.table_name === table && row.column_name === name)]))]));
    console.log(JSON.stringify({ observedAtUtc: identity.observed_at, status: Object.values(result).every(table => Object.values(table).every(Boolean)) ? 'SCHEMA_READY' : 'SCHEMA_GAP', columns: result }));
  } finally { await conn.end(); }
}

main().catch(error => { console.error(error.code || error.message || 'READONLY_QA_FAILED'); process.exitCode = 1; });
