'use strict';
const path = require('node:path');
const releaseRoot = path.resolve(process.argv[2] || '');
process.env.PUBLIC_OPINION_SERVICE_MODE = '1';
process.env.PUBLIC_OPINION_ENV_FILE = process.argv[3] || '';
require(path.join(releaseRoot, 'server/src/runtimeEnv')).loadRuntimeEnv();
const { Repository } = require(path.join(releaseRoot, 'server/src/db/repository'));
(async () => {
  const repository = new Repository(process.env);
  let connection;
  try {
    connection = await repository.pool.getConnection();
    const query = connection.query.bind(connection);
    connection.query = (sql, params) => {
      if (!/^\s*(?:SELECT|SHOW)\b/i.test(String(sql))) throw new Error('Worker readiness permits SELECT/SHOW only');
      return query(sql, params);
    };
    await repository.assertUnifiedSchedulerSchemaReady(connection);
    console.log('PASS: Worker schema/lease/epoch readiness is valid');
  } finally {
    connection?.release?.();
    await repository.pool?.end?.();
  }
})().catch(error => { console.error(error.code || 'WORKER_READINESS_FAILED', error.message); process.exitCode = 1; });
