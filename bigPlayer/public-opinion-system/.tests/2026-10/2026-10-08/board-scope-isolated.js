'use strict';
// Runs only against a new, owned MariaDB process and a fresh temporary datadir.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
const project = path.resolve(__dirname, '../../..');
const { runMigrations } = require(path.join(project, 'server/src/db/migrate'));
const { bigPlayerBoardSchemaReady } = require(path.join(project, 'shared/bigPlayerBoardSchema'));
const port = 43307;
const serverId = 20261008;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(port, '127.0.0.1', resolve));
  await new Promise(resolve => probe.close(resolve));
}
async function main() {
  await freePort();
  const tempBase = path.resolve(project, '../../.temp/po-closeout-20261008');
  fs.mkdirSync(tempBase, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(tempBase, 'mariadb-'));
  const data = path.join(fixture, 'data');
  const bin = 'C:/xampp/mysql/bin';
  const initLog = fs.openSync(path.join(fixture, 'initialize.log'), 'w');
  try {
    await new Promise((resolve, reject) => {
      const init = spawn(path.join(bin, 'mysql_install_db.exe'), [`--datadir=${data}`, `--port=${port}`], { windowsHide: true, stdio: ['ignore', initLog, initLog] });
      init.on('error', reject);
      init.on('exit', code => code === 0 ? resolve() : reject(new Error(`isolated initialization failed: ${code}`)));
    });
  } finally { fs.closeSync(initLog); }
  const log = fs.openSync(path.join(fixture, 'server.log'), 'w');
  const server = spawn(path.join(bin, 'mysqld.exe'), ['--no-defaults', '--basedir=C:/xampp/mysql', `--datadir=${data}`, '--bind-address=127.0.0.1', `--port=${port}`, `--server-id=${serverId}`, '--skip-log-bin'], { windowsHide: true, stdio: ['ignore', log, log] });
  const exited = new Promise(resolve => { server.once('exit', resolve); server.once('error', resolve); });
  let conn;
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { conn = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', multipleStatements: true }); break; }
      catch { if (server.exitCode !== null) throw new Error('isolated server exited during startup'); await sleep(100); }
    }
    assert.ok(conn, 'isolated server did not start');
    const [[identity]] = await conn.query('SELECT @@port AS port, @@server_id AS serverId, @@datadir AS datadir');
    assert.equal(identity.port, port);
    assert.equal(identity.serverId, serverId);
    assert.equal(path.resolve(identity.datadir).toLowerCase(), path.resolve(data).toLowerCase());
    console.log('ISOLATED_IDENTITY', JSON.stringify({ ...identity, fixture }));
    await conn.query('CREATE DATABASE closeout_empty; CREATE DATABASE closeout_board');
    await runMigrations({ env: { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_USER: 'root', DB_PASSWORD: '', DB_NAME: 'closeout_empty' }, only: undefined });
    console.log('PASS full empty database migrations');
    await conn.query(`USE closeout_board;
      CREATE TABLE po_schema_migrations (version VARCHAR(255) PRIMARY KEY);
      CREATE TABLE po_sync_runs (id INT PRIMARY KEY);
      CREATE TABLE po_contents (id INT PRIMARY KEY, source_id CHAR(36), external_id VARCHAR(255), fingerprint CHAR(64), UNIQUE KEY po_contents_source_external_uk(source_id,external_id));
      INSERT INTO po_contents VALUES (1,'source-1','external-1','same-body'),(2,'source-1','external-2','same-body');`);
    const sql = fs.readFileSync(path.join(project, 'migrations/030_bigplayer_board_scope.sql'), 'utf8');
    // Simulate interruption after run DDL, then replay the complete migration.
    await conn.query(sql.split('ALTER TABLE po_contents')[0]);
    assert.equal(await bigPlayerBoardSchemaReady(conn), false);
    await conn.query(sql);
    await conn.query(sql);
    await conn.query("INSERT INTO po_schema_migrations VALUES ('030_bigplayer_board_scope.sql')");
    assert.equal(await bigPlayerBoardSchemaReady(conn), true);
    await conn.query("INSERT INTO po_contents (id,source_id,external_id,fingerprint,board_id) VALUES (3,'source-1','external-1','same-body','2'),(4,'source-1','external-1','same-body','3'),(5,'source-1','external-5','same-body','2')");
    const [[count]] = await conn.query('SELECT COUNT(*) AS n FROM po_contents');
    assert.equal(count.n, 5);
    await assert.rejects(() => conn.query("INSERT INTO po_contents (id,source_id,external_id,board_id) VALUES (6,'source-1','external-1','2')"), error => error.code === 'ER_DUP_ENTRY');
    await conn.query('ALTER TABLE po_contents DROP INDEX po_contents_source_board_external_uk');
    assert.equal(await bigPlayerBoardSchemaReady(conn), false);
    console.log('PASS 030 interrupted replay, duplicate-body retention, board isolation, same-board uniqueness, partial-schema rejection');
  } finally {
    if (conn) { try { await conn.query('SHUTDOWN'); } catch {} await conn.end().catch(() => {}); }
    // This handle belongs only to the process launched above; no service/PID lookup.
    if (server.exitCode === null) { await Promise.race([exited, sleep(3000)]); if (server.exitCode === null) server.kill(); }
    await exited;
    fs.closeSync(log);
    console.log('ISOLATED_SERVER_STOPPED', fixture);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
