const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('../../../server/src/db/repository');

test('风险分类统计保留筛选范围，且只在概览请求启用分类细分', async () => {
  const repo = Object.create(Repository.prototype);
  const calls = [];
  repo.countContents = async filters => { calls.push(filters); return filters.contentType === 'post' ? '2' : '3'; };
  const scope = { communityId: 'community', platform: 'bigplayer_h5', publishedFrom: '2026-10-11', publishedTo: '2026-10-12' };
  const stats = await repo.getContentStats(scope, { includeBreakdown: true });
  for (const riskMode of ['attention', 'negative']) {
    assert.equal(stats[`${riskMode}PostCount`], 2);
    assert.equal(stats[`${riskMode}CommentCount`], 3);
    for (const contentType of ['post', 'comment']) {
      assert.deepEqual(calls.find(f => f.riskMode === riskMode && f.contentType === contentType), { ...scope, riskMode, contentType });
    }
  }
  calls.length = 0;
  await repo.getContentStats(scope);
  assert(!calls.some(f => f.riskMode && f.contentType));
});

for (const empty of [false, true]) {
  test(`紧急告警关联内容按内容ID去重并沿用范围；空数据=${empty}`, async () => {
    const repo = Object.create(Repository.prototype);
    const calls = [];
    repo.listContents = async () => [];
    repo.getContentStats = async () => ({ post: 2, comment: 3, attentionPostCount: 1, attentionCommentCount: 2 });
    repo.query = async (sql, values) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT DISTINCT a.*')) return empty ? [] : [{ id: 'urgent-id', severity: 'urgent' }, { id: 'urgent-id', severity: 'urgent' }, { id: 'attention-id', severity: 'attention' }];
      if (sql.startsWith('SELECT COUNT(DISTINCT CASE')) return [{ postCount: '2', commentCount: '3' }];
      return [];
    };
    const overview = await repo.getOverview({ regionCode: 'domestic', communityId: 'community', platform: 'bigplayer_h5', from: 'start', to: 'end' });
    assert.equal(overview.metrics.urgentAlertCount, empty ? 0 : 1);
    assert.equal(overview.metrics.urgentAlertPostCount, empty ? 0 : 2);
    assert.equal(overview.metrics.urgentAlertCommentCount, empty ? 0 : 3);
    assert.equal(overview.metrics.attentionCommentCount, 2);
    const query = calls.find(c => c.sql.startsWith('SELECT COUNT(DISTINCT CASE'));
    if (empty) assert.equal(query, undefined);
    else {
      assert.deepEqual(query.values, ['urgent-id', 'domestic', 'community', 'bigplayer_h5', 'start', 'end']);
      assert.match(query.sql, /DISTINCT CASE WHEN c.content_type='comment' THEN c.id/);
      assert.match(query.sql, /c.published_at >= \?/);
      assert.match(query.sql, /c.published_at < \?/);
      assert.match(query.sql, /COALESCE\(c.is_deleted,0\)=0/);
      assert.doesNotMatch(query.sql.split('WHERE ac.alert_id')[1], /c.content_type='post'/);
    }
  });
}
