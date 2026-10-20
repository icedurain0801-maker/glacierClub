const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/runtimeEnv').loadRuntimeEnv = () => false;
const app = require('../src/app');
const calls = [];
app.repo.resolveCommunityCanonical = async input => ({ ...input, gameId: 'fixture-game' });
app.repo.query = async () => { throw new Error('Unexpected database access'); };
app.repo.listQualityContents = async filters => { calls.push(filters); return []; };
app.repo.countQualityContents = async filters => { calls.push(filters); return 0; };
test.after(() => app.repo.pool.end());
async function get(from, to) {
  let status, body;
  const params = new URLSearchParams({ communityId: 'fixture-community', regionCode: 'overseas', publishedFrom: from, publishedTo: to });
  await app.handler({ method: 'GET', url: '/api/public-opinion/quality-contents?' + params, headers: {}, socket: { remoteAddress: '127.0.0.1' } }, {
    writeHead(value) { status = value; }, end(value) { body = JSON.parse(value); }
  });
  return { status, body };
}
test('quality list uses UTC boundaries for Beijing publication days and preserves scope', async () => {
  assert.equal((await get('2026-10-14T00:00:00+08:00', '2026-10-15T00:00:00+08:00')).status, 200);
  assert.equal(calls.length, 2);
  for (const filters of calls) {
    assert.equal(filters.publishedFrom, '2026-10-13 16:00:00');
    assert.equal(filters.publishedTo, '2026-10-14 16:00:00');
    assert.equal(filters.communityId, 'fixture-community');
  }
});
test('invalid and reversed quality windows fail before list or count access', async () => {
  calls.length = 0;
  for (const [from, to] of [['invalid', '2026-10-15'], ['2026-10-15T00:00:00Z', '2026-10-14T00:00:00Z']]) {
    assert.equal((await get(from, to)).status, 400);
  }
  assert.equal(calls.length, 0);
});
