const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('../src/db/repository');

test('daily trend keeps scope, Beijing day boundaries and read-only aggregation', async () => {
  const repo = Object.create(Repository.prototype);
  let calls = 0;
  repo.query = async (sql, values) => {
    calls++;
    assert.match(sql, /^SELECT/);
    assert.match(sql, /DATE_FORMAT\(DATE_ADD\(c.published_at, INTERVAL 8 HOUR\), '%Y-%m-%d'\)/);
    assert.match(sql, /GROUP BY date/);
    assert.match(sql, /COALESCE\(c.is_deleted,0\)=0/);
    assert.match(sql, /c.published_at >= \?/);
    assert.match(sql, /c.published_at < \?/);
    assert.deepEqual(values, ['domestic', 'game', 'community', 'source', 'bigplayer_h5', '2026-10-05 16:00:00', '2026-10-12 04:00:00']);
    return [{ date: '2026-10-12', positive: 1, neutral: 2, negative: 3 }];
  };
  const rows = await repo.getOverviewTrend({ regionCode: 'domestic', gameId: 'game', communityId: 'community', sourceId: 'source', platform: 'bigplayer_h5', from: '2026-10-05 16:00:00', to: '2026-10-12 04:00:00' });
  assert.equal(rows[0].negative, 3);
  assert.equal(calls, 1);
});

test('trend route validates period, independent range and community scope', async () => {
  const { server, repo } = require('../src/app');
  const originalTrend = repo.getOverviewTrend;
  const originalScope = repo.resolveCommunityCanonical;
  const calls = [];
  repo.resolveCommunityCanonical = async input => {
    if (input.communityId === 'wrong') { const e = new Error('not found'); e.code = 'COMMUNITY_NOT_FOUND'; throw e; }
    return { regionCode: 'overseas', gameId: 'game', communityId: 'canonical' };
  };
  repo.getOverviewTrend = async query => { calls.push(query); return []; };
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/public-opinion/overview-trend?`;
  try {
    for (const period of ['7d', '15d', '30d']) {
      const r = await fetch(base + `period=${period}&communityId=valid&platform=bigplayer_h5`);
      assert.equal(r.status, 200);
      const { data } = await r.json();
      assert.deepEqual(data.trend, []);
      const days = period === '7d' ? 7 : period === '15d' ? 15 : 30;
      const first = new Date(Date.parse(data.window.publishedFrom) + 8 * 3600000).toISOString().slice(0, 10);
      const last = new Date(Date.parse(data.window.publishedTo) + 8 * 3600000).toISOString().slice(0, 10);
      assert.equal((Date.parse(last) - Date.parse(first)) / 86400000, days - 1);
      assert.equal(calls.at(-1).communityId, 'canonical');
      assert.equal(calls.at(-1).regionCode, 'overseas');
    }
    for (const query of ['period=today', 'period=invalid', 'period=7d&from=2026-10-01', 'period=30d&publishedTo=2026-10-12', 'period=7d&platform=invalid']) assert.equal((await fetch(base + query)).status, 400);
    assert.equal((await fetch(base + 'period=7d&communityId=wrong')).status, 404);
    assert.equal(calls.length, 3);
  } finally {
    await new Promise(resolve => server.close(resolve));
    repo.getOverviewTrend = originalTrend; repo.resolveCommunityCanonical = originalScope;
    await repo.pool.end();
  }
});
