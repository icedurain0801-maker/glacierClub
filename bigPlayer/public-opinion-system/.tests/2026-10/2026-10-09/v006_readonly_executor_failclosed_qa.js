'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runProtected, selectAllowed, PORT, PATHS } = require('../../../scripts/domestic-readonly-executor');

const root = 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/bigplayer-recovery-20261009';
const dir = fs.mkdtempSync(path.join(root, 'qa-executor-drift-'));
const fixture = path.join(dir, 'baseline.txt');
fs.writeFileSync(fixture, 'before');
let poolEnded = 0;

(async () => {
  try {
    assert.equal(PORT, 43322);
    assert.equal(PATHS.length, 5);
    for (const sql of ['UPDATE x SET y=1', 'SELECT 1; DELETE FROM x', 'SELECT SLEEP(1)', 'SELECT * FROM x FOR UPDATE']) {
      assert.equal(selectAllowed(sql), false);
    }
    await assert.rejects(runProtected({
      baselineFiles: [fixture],
      expectedIdentity: 'qa_ro@127.0.0.1',
      createPool: () => ({
        query: async value => value.sql.includes('CURRENT_USER')
          ? [[{ identity: 'qa_ro@127.0.0.1', database_name: 'public_opinion', port: 3306 }]]
          : value.sql === 'SHOW GRANTS'
            ? [[{ Grants: 'GRANT USAGE ON *.* TO qa_ro' }, { Grants: 'GRANT SELECT ON `public_opinion`.* TO qa_ro' }]]
            : [[{ ok: 1 }]],
        end: async () => { poolEnded += 1; }
      }),
      loadApp: factory => {
        const pool = factory.createPool();
        let first = true;
        return { handler: async (_req, res) => {
          await pool.query('SELECT 1');
          if (first) { fs.writeFileSync(fixture, 'after'); first = false; }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ data: [] }));
        } };
      }
    }), { code: 'BASELINE_CHANGED' });
    assert.equal(poolEnded, 1);
    assert.equal(fs.readFileSync(fixture, 'utf8'), 'after');
    console.log(JSON.stringify({ status: 'PASS_FAIL_CLOSED_BASELINE_DRIFT', port: PORT, paths: PATHS.length, poolEnded, productionConnections: 0 }));
  } finally {
    fs.unlinkSync(fixture);
    fs.rmdirSync(dir);
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
