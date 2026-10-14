const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository } = require('../../../server/src/db/repository');
const { AlertEngine } = require('../../../server/src/pipeline/alertEngine');
const detail = require('../../../../admin/PublicOpinion/assets/alert-detail');
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

test('原文仅平铺命中帖子与评论，忽略原帖和其他评论，重复ID只展示一次', () => {
  const comment = { id: 'comment', content_type: 'comment', body: '<b>命中评论</b>' };
  const post = { id: 'post', content_type: 'post', title: '命中帖子' };
  const html = detail.renderRelatedContents({ related_contents: [comment, post, comment], related_threads: [{ root: { id: 'parent', title: '不相关原帖' }, comments: [{ id: 'other', body: '其他评论' }] }] }, esc);
  assert.equal((html.match(/<article /g) || []).length, 2);
  assert.match(html, /&lt;b&gt;命中评论&lt;\/b&gt;/);
  assert.match(html, /命中帖子/);
  assert.doesNotMatch(html, /不相关原帖|其他评论|评论与回复|原帖|comment-section|related-thread/);
  assert.match(detail.renderRelatedContents({ related_contents: [comment] }, esc), /content-type comment/);
  assert.doesNotMatch(detail.renderRelatedContents({ related_contents: [] }, esc), /<article/);
});

test('详情接口不再查询原帖及整个评论树', async () => {
  const repo = Object.create(Repository.prototype), calls = [];
  repo.listAlertQualityCandidates = async () => [];
  repo.query = async sql => {
    calls.push(sql);
    if (sql.startsWith('SELECT DISTINCT a.* FROM po_alerts')) return [{ id: 'alert', severity: 'urgent', status: 'pending' }];
    if (sql.includes('SELECT c.*')) return [{ id: 'comment', content_type: 'comment', root_content_id: 'root' }];
    return [];
  };
  const alert = await repo.getAlert('alert');
  assert.deepEqual(alert.related_threads, []);
  assert.equal(alert.related_contents.length, 1);
  assert(!calls.some(sql => sql.includes('c.root_content_id=?')));
});

test('复用查询严格限制同一内容且拒绝复用历史混合告警', async () => {
  const repo = Object.create(Repository.prototype);
  repo.query = async (sql, values) => {
    assert.match(sql, /own.content_id=\?/);
    assert.match(sql, /NOT EXISTS .*other.content_id<>\?/);
    assert.deepEqual(values, ['game', 'community', 'ai_urgent', 900, 'comment', 'comment']);
    return [];
  };
  assert.equal(await repo.findOpenAlert({ gameId: 'game', communityId: 'community', alertType: 'ai_urgent', cooldownSeconds: 900, contentId: 'comment' }), null);
});

test('同社区的帖子和评论各建独立告警，同一内容重复分析复用自身告警', async () => {
  const records = new Map(), linked = [], lookups = [];
  const repo = {
    findOpenAlert: async filter => { lookups.push(filter); return records.get(filter.contentId); },
    insertAlert: async input => { assert.equal(input.contentIds.length, 1); const alert = { id: `alert-${input.contentIds[0]}` }; records.set(input.contentIds[0], alert); return alert; },
    linkAlertContent: async (...args) => linked.push(args), updateDingStatus: async () => {}
  };
  const engine = new AlertEngine(repo, null, {}), game = { id: 'game', community_id: 'community', name: '游戏' };
  for (const [id, content_type] of [['post', 'post'], ['comment', 'comment'], ['comment', 'comment']]) {
    await engine.processAiUrgent({ game, content: { id, content_type, game_id: 'game', community_id: 'community' }, analysis: { sentiment: 'negative', severity: 'urgent', negativeScore: 0.8 } });
  }
  assert.equal(records.size, 2);
  assert.deepEqual(lookups.map(filter => filter.contentId), ['post', 'comment', 'comment']);
  assert.deepEqual(linked, [['alert-comment', 'comment']]);
});
