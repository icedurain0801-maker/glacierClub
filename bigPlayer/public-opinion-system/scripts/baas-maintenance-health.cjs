'use strict';
process.env.PO_MAINTENANCE_HEALTH_ONLY = '1';
const fs = require('node:fs'), path = require('node:path');
const { health, validateCurrent, repo } = require('./baas-shard-gc-daily.cjs');
(async () => {
  const online = await health('maintenance'), integrity = await validateCurrent('maintenance');
  const result = { at: new Date().toISOString(), online, integrity };
  fs.writeFileSync(path.join(process.env.PO_MAINTENANCE_RUN_DIR, 'health-maintenance.json'), JSON.stringify(result));
  console.log(JSON.stringify({ healthPassed: true, endpoints: online.endpoints.length, chunks: integrity.chunks }));
})().catch(e => { console.error(JSON.stringify({ healthPassed: false, code: e.code || e.name })); process.exitCode = 1; }).finally(() => repo.pool.end());
