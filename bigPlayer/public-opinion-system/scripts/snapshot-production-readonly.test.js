'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { readConfig, grantsAreMinimal, assessProduction } = require('./snapshot-production-readonly');

const env = {
  PO_READONLY_DB_HOST: '127.0.0.1', PO_READONLY_DB_PORT: '3306',
  PO_READONLY_DB_NAME: 'public_opinion', PO_READONLY_DB_USER: 'po_observer',
  PO_READONLY_DB_PASSWORD: 'fixture-password'
};

test('missing or privileged credentials fail before connecting', async () => {
  let connected = 0;
  const connect = async () => { connected++; throw new Error('must not connect'); };
  assert.equal(readConfig({ ...env, PO_READONLY_DB_USER: 'root' }), null);
  assert.deepEqual(await assessProduction({ env: {}, connect }), {
    status: 'NO_GO', code: 'READONLY_CREDENTIALS_MISSING_OR_INVALID', productionTouched: false
  });
  assert.deepEqual(await assessProduction({ env: { ...env, PO_READONLY_DB_USER: 'root' }, connect }), {
    status: 'NO_GO', code: 'READONLY_CREDENTIALS_MISSING_OR_INVALID', productionTouched: false
  });
  assert.equal(connected, 0);
});

test('only database SELECT plus global PROCESS is accepted', () => {
  const narrow = [{ Grants: "GRANT PROCESS ON *.* TO 'po_observer'@'localhost'" },
    { Grants: "GRANT SELECT ON `public_opinion`.* TO 'po_observer'@'localhost'" }];
  assert.equal(grantsAreMinimal(narrow), true);
  for (const extra of ['EXECUTE', 'LOCK TABLES', 'GRANT OPTION', 'SELECT']) {
    const global = extra === 'GRANT OPTION' ?
      "GRANT PROCESS ON *.* TO 'po_observer'@'localhost' WITH GRANT OPTION" :
      `GRANT ${extra} ON *.* TO 'po_observer'@'localhost'`;
    assert.equal(grantsAreMinimal([...narrow, { Grants: global }]), false);
  }
});

test('read-only assessment emits only aggregates and remains NO_GO', async () => {
  let ended = false;
  const queries = [];
  const connection = {
    async query({ sql }) {
      queries.push(sql);
      if (sql === 'SHOW GRANTS') return [[
        { Grants: "GRANT PROCESS ON *.* TO 'po_observer'@'localhost'" },
        { Grants: "GRANT SELECT ON `public_opinion`.* TO 'po_observer'@'localhost'" }
      ]];
      if (sql.includes('@@hostname')) return [[{ hostname: 'LIUFUYI-2-48', port: 3306, serverId: 1,
        version: '10.4.14-MariaDB', db: 'public_opinion', capturedAt: '2026-10-08 12:00:00.000' }]];
      if (sql.includes('information_schema.tables')) return [[{ table_name: 'po_items', table_type: 'BASE TABLE',
        engine: 'InnoDB', table_rows: 20, data_length: 1024, index_length: 512 }]];
      if (sql.includes('information_schema.triggers')) return [[{ type: 'TRIGGER', n: 1 }, { type: 'ROUTINE', n: 0 }, { type: 'EVENT', n: 0 }]];
      if (sql.includes('information_schema.innodb_trx')) return [[{ n: 1, maxAgeSeconds: 30, rowsModified: 2, rowsLocked: 4 }]];
      if (sql.includes('information_schema.processlist')) return [[{ n: 3, maxAgeSeconds: 30, targetDbConnections: 2 }]];
      if (sql.includes('po_sync_runs')) return [[{ status: 'queued', n: 1 }]];
      if (sql.includes('po_source_schedule_state')) return [[{ n: 1 }]];
      if (sql.includes('po_worker_leases')) return [[{ n: 2 }]];
      if (sql.includes('po_worker_heartbeats')) return [[{ n: 1 }]];
      if (sql.includes('GLOBAL_STATUS')) return [[
        { name: 'COM_INSERT', value: 1 },
        { name: 'COM_UPDATE', value: queries.filter(item => item.includes('GLOBAL_STATUS')).length },
        { name: 'COM_DELETE', value: 1 },
        { name: 'COM_REPLACE', value: 1 }
      ]];
      throw new Error('unexpected SQL');
    },
    async end() { ended = true; },
    destroy() {}
  };
  const result = await assessProduction({ env, connect: async () => connection, intervalMs: 1 });
  assert.equal(result.code, 'PRODUCTION_WINDOW_NOT_ADMITTED');
  assert.equal(result.writes.globalStatementDelta, 1);
  assert.ok(result.blockers.includes('ACTIVE_TRANSACTIONS'));
  assert.ok(result.blockers.includes('WRITE_ACTIVITY_OBSERVED'));
  assert.ok(ended);
  assert.doesNotMatch(JSON.stringify(result), /fixture-password|lease-owner|credential|HOST|INFO/);
  assert.ok(queries.every(sql => /^(SELECT|SHOW GRANTS)\b/.test(sql)));
});
