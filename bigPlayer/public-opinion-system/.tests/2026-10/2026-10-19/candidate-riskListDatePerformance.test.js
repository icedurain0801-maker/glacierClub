const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('E:/CodexData/public-opinion/releases/release-20261019-risk-list-date-r1/server/src/db/repository');
function fixture() {
  const calls = [];
  const repo = Object.create(Repository.prototype);
  repo.query = async (sql, values) => { calls.push({ sql, values }); return []; };
  return { repo, calls };
}
test('dated risk lists use scope/time index while retaining risk, scope and page boundaries', async () => {
  for (const [scope, index] of [
    [{ communityId: 'community' }, 'po_contents_community_time_idx'],
    [{ sourceId: 'source' }, 'po_contents_source_time_idx'],
    [{ accountId: 'account' }, 'po_contents_account_time_idx'],
    [{ gameId: 'game' }, 'po_contents_game_time_idx'],
    [{}, 'po_contents_published_time_idx']
  ]) for (const riskMode of ['attention', 'negative', 'urgent']) {
    const { repo, calls } = fixture();
    await repo.listContents({ ...scope, riskMode, platform: 'bigplayer_h5', regionCode: 'overseas', contentType: 'post', publishedFrom: '2026-10-17 16:00:00', publishedTo: '2026-10-18 16:00:00', page: 2, pageSize: 20, sort: 'published_desc', handlingStatus: 'pending' });
    const { sql, values } = calls[0];
    assert(sql.includes(`po_contents c FORCE INDEX (${index})`));
    assert.match(sql, /c\.is_deleted=0/);
    assert.match(sql, /a\.sentiment IN \('neutral','negative'\)/);
    assert.match(sql, /NOT EXISTS \(SELECT 1 FROM po_content_handlings/);
    assert.match(sql, /c\.published_at>=\? AND c\.published_at<\?/);
    assert.match(sql, /ORDER BY c\.published_at DESC, c\.id DESC LIMIT \? OFFSET \?/);
    assert.deepEqual(values.slice(-4), ['2026-10-17 16:00:00', '2026-10-18 16:00:00', 20, 20]);
    if (riskMode === 'attention') assert.equal(values[0], 'attention');
    else {
      assert.deepEqual(values.slice(0, 2), ['negative', 'urgent']);
      assert.match(sql, /urgentReview\.status/);
      assert.match(sql, /a\.content_fingerprint=c\.fingerprint/);
    }
  }
});
test('date index preference preserves job-id, severity-driven and exact-id plans', async () => {
  const { repo, calls } = fixture();
  for (const exact of [{ contentId: 'id' }, { postId: 'post' }]) {
    await repo.listContents({ ...exact, communityId: 'community', publishedFrom: '2026-10-17 16:00:00' });
    assert.match(calls.at(-1).sql, /FORCE INDEX \(po_contents_published_time_idx\)/);
    assert.doesNotMatch(calls.at(-1).sql, /FORCE INDEX \(po_contents_community_time_idx\)/);
  }
  await repo.listContents({ severity: 'urgent', communityId: 'community', publishedTo: '2026-10-18 16:00:00' });
  assert.match(calls.at(-1).sql, /sf ON sf\.content_id=c\.id/);
  assert.doesNotMatch(calls.at(-1).sql, /po_contents c FORCE INDEX/);
  repo.query = async (sql, values) => { calls.push({ sql, values }); return sql.startsWith('SELECT DISTINCT content_id') ? [{ content_id: 'job-content' }] : []; };
  await repo.listContents({ analysisStatus: 'failed', communityId: 'community', publishedFrom: '2026-10-17 16:00:00' });
  assert.doesNotMatch(calls.at(-1).sql, /po_contents c FORCE INDEX/);
  assert.match(calls.at(-1).sql, /c\.id IN \(\?\)/);
});
test('undated lists and engagement ordering keep their existing behavior', async () => {
  const { repo, calls } = fixture();
  await repo.listContents({ communityId: 'community', riskMode: 'attention', sort: 'engagement' });
  assert.match(calls[0].sql, /FORCE INDEX \(po_contents_published_time_idx\)/);
  assert.match(calls[0].sql, /ORDER BY engagement_score DESC, a\.negative_score DESC/);
});
