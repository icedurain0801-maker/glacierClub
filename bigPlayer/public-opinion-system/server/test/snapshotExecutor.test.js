'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { runSnapshotExecutor, inventory } = require('../src/db/snapshotExecutor');

test('production mode is disabled before any connection or file access', async () => {
  let connections = 0;
  const result = await runSnapshotExecutor({
    mode: 'production',
    connect: async () => { connections++; throw new Error('must not connect'); }
  });
  assert.deepEqual(result, { status: 'NO_GO', code: 'PRODUCTION_EXECUTION_DISABLED' });
  assert.equal(connections, 0);
});

test('invalid isolated identity and paths are rejected before connecting', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'po-executor-test-'));
  try {
    const data = path.join(root, 'data');
    fs.mkdirSync(data);
    let connections = 0;
    const base = {
      mode: 'isolated', evidenceDir: root,
      target: { host: '127.0.0.1', port: 43317, serverId: 20261017, version: '10.4.14-MariaDB', datadir: data },
      sourceDb: 'source_fixture', restoreDb: 'restore_fixture',
      tools: { dumpExecutable: path.join(root, 'mysqldump.exe'), restoreExecutable: path.join(root, 'mysql.exe') },
      expectedInventory: { tables: ['items'], objects: [
        { type: 'SCHEMA', name: '__database__' }, { type: 'TABLE', name: 'items' }
      ] },
      connect: async () => { connections++; throw new Error('must not connect'); }
    };
    for (const change of [
      { target: { ...base.target, port: 3306 } },
      { target: { ...base.target, host: '0.0.0.0' } },
      { target: { ...base.target, datadir: root } },
      { restoreDb: 'source_fixture' },
      { tools: { ...base.tools, dumpExecutable: 'mysqldump.exe' } }
    ]) {
      assert.deepEqual(await runSnapshotExecutor({ ...base, ...change }), { status: 'NO_GO', code: 'ISOLATED_PREFLIGHT_INVALID' });
    }
    assert.equal(connections, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('independent inventory includes every supported object kind', async () => {
  const connection = { async query(sql) {
    if (sql.includes('information_schema.tables')) return [[
      { table_name: 'items', table_type: 'BASE TABLE' },
      { table_name: 'v_items', table_type: 'VIEW' }
    ]];
    if (sql.includes('information_schema.triggers')) return [[{ name: 'trg_items' }]];
    if (sql.includes('information_schema.routines')) return [[
      { name: 'p_count', type: 'PROCEDURE' }, { name: 'f_one', type: 'FUNCTION' }
    ]];
    if (sql.includes('information_schema.events')) return [[{ name: 'ev_noop' }]];
    throw new Error('unexpected query');
  } };
  assert.deepEqual(await inventory(connection), {
    tables: ['items'],
    objects: [
      { type: 'SCHEMA', name: '__database__' },
      { type: 'TABLE', name: 'items' },
      { type: 'VIEW', name: 'v_items' },
      { type: 'TRIGGER', name: 'trg_items' },
      { type: 'PROCEDURE', name: 'p_count' },
      { type: 'FUNCTION', name: 'f_one' },
      { type: 'EVENT', name: 'ev_noop' }
    ]
  });
});
