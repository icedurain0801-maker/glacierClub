const { test } = require('node:test');
const assert = require('node:assert/strict');
test('API formats registry conflicts as actionable 409 and missing schema as 503', async () => {
  const appPath = process.env.PO_API_TEST_APP || require.resolve('../src/app');
  const runtimePath = require('node:path').join(require('node:path').dirname(appPath), 'runtimeEnv.js');
  const oldRuntime = require.cache[runtimePath];
  require.cache[runtimePath] = { id: runtimePath, filename: runtimePath, loaded: true, exports: { loadRuntimeEnv() {} } };
  process.env.PUBLIC_OPINION_BAAS_ENABLED = 'false';
  process.env.DB_PORT = '1';
  process.env.DB_NAME = 'test_never_connects';
  const app = require(appPath);
  const original = app.repo.listGames, log = console.error;
  try {
    console.error = () => {};
    for (const [code, status] of [['MULTISITE_SITE_REGISTRY_MISMATCH', 409], ['MULTISITE_SITE_ID_CONFLICT', 409], ['MULTISITE_SITE_URL_CONFLICT', 409], ['MULTISITE_SCHEMA_NOT_READY', 503]]) {
      app.repo.listGames = async () => { throw Object.assign(new Error('private upstream details'), { code }); };
      let actualStatus, body;
      await app.handler({ url: '/api/public-opinion/games', method: 'GET', headers: {}, socket: {} }, { writeHead(value) { actualStatus = value; }, end(value) { body = JSON.parse(value); } });
      assert.equal(actualStatus, status);
      assert.equal(body.error.code, code);
      assert.match(body.error.message, /站点|多站点/);
      assert.doesNotMatch(body.error.message, /internal server error|private upstream/);
    }
  } finally {
    app.repo.listGames = original;
    console.error = log;
    await app.repo.pool.end();
    if (oldRuntime) require.cache[runtimePath] = oldRuntime; else delete require.cache[runtimePath];
  }
});
