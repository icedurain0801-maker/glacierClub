'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../../..', '.temp/domestic-today-recovery-20261009');
const SQL = `SELECT w.requesting_trx_id,w.blocking_trx_id,
 r.trx_mysql_thread_id AS requesting_thread,b.trx_mysql_thread_id AS blocking_thread,
 r.trx_state AS requesting_state,b.trx_state AS blocking_state,
 r.trx_rows_locked AS requesting_rows_locked,b.trx_rows_locked AS blocking_rows_locked,
 TIMESTAMPDIFF(MICROSECOND,r.trx_wait_started,NOW(6)) AS wait_microseconds,
 rl.lock_table AS requesting_table,rl.lock_index AS requesting_index,
 rl.lock_type AS requesting_type,rl.lock_mode AS requesting_mode,
 bl.lock_table AS blocking_table,bl.lock_index AS blocking_index,
 bl.lock_type AS blocking_type,bl.lock_mode AS blocking_mode
 FROM information_schema.INNODB_LOCK_WAITS w
 JOIN information_schema.INNODB_TRX r ON r.trx_id=w.requesting_trx_id
 JOIN information_schema.INNODB_TRX b ON b.trx_id=w.blocking_trx_id
 JOIN information_schema.INNODB_LOCKS rl ON rl.lock_id=w.requested_lock_id
 JOIN information_schema.INNODB_LOCKS bl ON bl.lock_id=w.blocking_lock_id
 WHERE rl.lock_table LIKE '%public_opinion%'`;
function fail(code) { throw Object.assign(new Error(code), { code }); }
async function main(args = process.argv.slice(2)) {
  // Explicit output and stop-marker paths supplied by manager. No business IO.
  if (args.length !== 2) fail('LOCK_SAMPLER_PATHS_REQUIRED');
  for (const file of args) {
    if (!path.isAbsolute(file)) fail('LOCK_SAMPLER_PATH_INVALID');
    const relative = path.relative(ROOT, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || fs.existsSync(file)) fail('LOCK_SAMPLER_PATH_INVALID');
  }
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
  process.loadEnvFile('C:/ProgramData/PublicOpinion/config/public-opinion.env');
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
  if (process.env.DATABASE_URL || process.env.DB_HOST !== '127.0.0.1'
    || Number(process.env.DB_PORT) !== 3306 || process.env.DB_NAME !== 'public_opinion') fail('LOCK_SAMPLER_DB_TARGET');
  const mysql = require('C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/server/node_modules/mysql2/promise');
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: 'public_opinion', connectTimeout: 2000 });
  const samples = [], started = Date.now(); let code = null, firstWait = null;
  // Hard wall deadline also interrupts an in-flight read.
  const timer = setTimeout(() => conn.destroy(), 30000);
  try {
    const [[identity]] = await conn.query({ sql: 'SELECT CURRENT_USER() AS identity,DATABASE() AS db', timeout: 2000 });
    if (identity.identity !== 'root@localhost' || identity.db !== 'public_opinion') fail('LOCK_SAMPLER_IDENTITY');
    console.log('LOCK_SAMPLER_READY');
    while (Date.now() - started < 30000 && !fs.existsSync(args[1])) {
      const [rows] = await conn.query({ sql: SQL, timeout: 2000 });
      samples.push({ elapsedMs: Date.now() - started, rows });
      if (rows.length && firstWait === null) firstWait = Date.now();
      if (firstWait !== null && Date.now() - firstWait >= 5000) break;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  } catch (error) { code = /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'LOCK_SAMPLER_FAILED'; }
  finally { clearTimeout(timer); conn.destroy(); }
  fs.writeFileSync(args[0], JSON.stringify({ kind: 'readonly-lock-samples', maxDurationMs: 30000,
    queryTimeoutMs: 2000, cadenceMs: 150, errorCode: code, samples }, null, 2), { flag: 'wx' });
  if (code) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.code || 'LOCK_SAMPLER_FAILED'); process.exitCode = 1; });
module.exports = { SQL, main };
