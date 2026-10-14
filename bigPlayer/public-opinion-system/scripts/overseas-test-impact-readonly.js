'use strict';
// Incident evidence only: no Repository/runtimeEnv, DDL, DML or cleanup.
const fs = require('node:fs');
const path = require('node:path');
const util = require('node:util');
const { createRequire } = require('node:module');
const project = path.resolve(__dirname, '..');
const mysql = createRequire(path.join(project, 'server/package.json'))('mysql2/promise');
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--readonly-current-local') throw Error('EXPLICIT_READONLY_MODE_REQUIRED');
  const file = path.join(project, '.env');
  const env = util.parseEnv(fs.readFileSync(file, 'utf8'));
  if (env.DATABASE_URL || env.DB_HOST !== '127.0.0.1' || Number(env.DB_PORT) !== 3306) throw Error('READONLY_TARGET_REJECTED');
  const report = { kind: 'test-impact-current-readonly', observedAt: new Date().toISOString(),
    environmentSource: file, environmentModifiedAt: fs.statSync(file).mtime.toISOString(),
    historicalEndpointProven: false, historicalProductionUnchangedProven: false,
    endpoint: { host: '127.0.0.1', port: 3306 }, queries: [], errorCode: null };
  const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3306,
    user: env.DB_USER, password: env.DB_PASSWORD, connectTimeout: 2000 });
  const timer = setTimeout(() => conn.destroy(), 15000);
  const select = async (name, sql) => {
    if (!/^(SELECT|SHOW)\b/.test(sql) || sql.includes(';')) throw Error('READONLY_SQL_REJECTED');
    const [rows] = await conn.query({ sql, timeout: 3000 });
    report.queries.push({ name, rows }); return rows;
  };
  try {
    const [id] = await select('identity', 'SELECT @@port AS port,@@server_id AS server_id,@@datadir AS datadir,@@version AS version,DATABASE() AS selected_database,CONNECTION_ID() AS connection_id');
    if (Number(id.port) !== 3306) throw Error('READONLY_IDENTITY_REJECTED');
    await select('schemas', "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN ('public_opinion','public_opinion_test')");
    await select('test_table_metadata', "SELECT TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_ROWS,CREATE_TIME,UPDATE_TIME FROM information_schema.TABLES WHERE TABLE_SCHEMA='public_opinion_test' ORDER BY TABLE_NAME");
    await select('trigger_metadata', "SELECT TRIGGER_SCHEMA,TRIGGER_NAME,EVENT_OBJECT_SCHEMA,EVENT_OBJECT_TABLE,EVENT_MANIPULATION FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA IN ('public_opinion','public_opinion_test') ORDER BY TRIGGER_SCHEMA,TRIGGER_NAME");
    await select('logging_availability', "SHOW VARIABLES WHERE Variable_name IN ('log_bin','general_log','general_log_file','binlog_format','log_output')");
    await select('production_table_metadata', "SELECT TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_ROWS,CREATE_TIME,UPDATE_TIME FROM information_schema.TABLES WHERE TABLE_SCHEMA='public_opinion' AND TABLE_NAME IN ('po_sync_runs','po_contents','po_sync_run_contents','po_audit_events','po_sources') ORDER BY TABLE_NAME");
  } catch (error) { report.errorCode = /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'READONLY_QUERY_FAILED'; }
  finally { clearTimeout(timer); conn.destroy(); }
  const base = path.resolve(project, '../../.temp');
  if (fs.lstatSync(base).isSymbolicLink() || fs.realpathSync(base) !== base) throw Error('READONLY_EVIDENCE_ROOT_REJECTED');
  const dir = fs.mkdtempSync(path.join(base, 'overseas-test-impact-readonly-'));
  const output = path.join(dir, 'result.json');
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, ...report }));
  if (report.errorCode) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'READONLY_DIAGNOSTIC_FAILED'); process.exitCode = 1; });
