const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository, isWithinActiveWindow } = require('../src/db/repository');

// 构造一个不会真正连库的 Repository：覆盖 query 记录 SQL/params，返回预设行。
function stubRepo(handler) {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  repo.pool = {
    async query() { throw new Error('pool.query should not be called in unit test'); },
    async getConnection() {
      return {
        async beginTransaction() {},
      async query(sql, params = []) {
        const result = await repo.query(sql, params);
        return Array.isArray(result) ? [result, []] : [result, []];
      },
        async commit() {},
        async rollback() {},
        release() {}
      };
    },
    async end() {}
  };
  repo.calls = [];
  repo.query = async (sql, params = []) => { repo.calls.push({ sql, params }); return handler ? handler(sql, params) : []; };
  return repo;
}

test('renewSyncRunLease only renews an owned running run', async () => {
  const repo = stubRepo(() => ({ affectedRows: 1 }));
  const renewed = await repo.renewSyncRunLease('run-1', 'owner-1', 45);
  assert.equal(renewed, true);
  assert.match(repo.calls[0].sql, /status='running'/);
  assert.match(repo.calls[0].sql, /lease_owner=\?/);
  assert.deepEqual(repo.calls[0].params, [45, 'run-1', 'owner-1']);
});

test('listGames and listCommunities support external directory identifiers', async () => {
  const repo = stubRepo(() => []);
  await repo.listGames({ regionCode: 'overseas', externalId: '100017' });
  assert.deepEqual(repo.calls[0].params, ['overseas', '100017']);
  assert.match(repo.calls[0].sql, /region_code=\?/);
  assert.match(repo.calls[0].sql, /external_id=\?/);
  await repo.listCommunities({ regionCode: 'overseas', externalId: '100017' });
  assert.deepEqual(repo.calls[1].params, ['overseas', '100017']);
  assert.match(repo.calls[1].sql, /c\.external_id=\?/);
});
test('listSources combines sourceId with the complete scope using AND filters', async () => {
  const repo = stubRepo(() => []);
  await repo.listSources('last-night-game', {
    sourceId: 'last-night-source',
    regionCode: 'overseas',
    communityId: 'last-night-community',
    platform: 'bigplayer_h5'
  });

  assert.match(repo.calls[0].sql, /s\.id=\?/);
  assert.match(repo.calls[0].sql, /s\.game_id=\?/);
  assert.match(repo.calls[0].sql, /g\.region_code=\?/);
  assert.match(repo.calls[0].sql, /s\.community_id=\?/);
  assert.match(repo.calls[0].sql, /s\.platform=\?/);
  assert.deepEqual(repo.calls[0].params, ['last-night-source', 'last-night-game', 'overseas', 'last-night-community', 'bigplayer_h5']);
});


test('active_window: 空窗口视为全天生效', () => {
  assert.equal(isWithinActiveWindow(null), true);
  assert.equal(isWithinActiveWindow({}), true);
});

test('active_window: 命中工作日白天窗口', () => {
  const wed10 = new Date('2026-08-05T10:00:00'); // 周三 10:00 本地
  assert.equal(isWithinActiveWindow({ days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }, wed10), true);
  const sat10 = new Date('2026-08-08T10:00:00'); // 周六
  assert.equal(isWithinActiveWindow({ days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }, sat10), false);
});

test('active_window: 跨零点夜间窗口', () => {
  const win = { start: '22:00', end: '06:00' };
  assert.equal(isWithinActiveWindow(win, new Date('2026-08-05T23:30:00')), true);
  assert.equal(isWithinActiveWindow(win, new Date('2026-08-05T05:30:00')), true);
  assert.equal(isWithinActiveWindow(win, new Date('2026-08-05T12:00:00')), false);
});

test('active_window: JSON 字符串也可解析', () => {
  assert.equal(isWithinActiveWindow('{"days":[3],"start":"09:00","end":"18:00"}', new Date('2026-08-05T10:00:00')), true);
});

test('listDueSources 用 active_window 过滤到期源', async () => {
  const repo = stubRepo(() => [
    { id: 's1', active_window: null },
    { id: 's2', active_window: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' } }
  ]);
  const sat = new Date('2026-08-08T10:00:00'); // 周六：s2 应被过滤
  const due = await repo.listDueSources(sat);
  assert.deepEqual(due.map(s => s.id), ['s1']);
  // 到期判定用 frequency_seconds 且要求 game 启用
  assert.match(repo.calls[0].sql, /INTERVAL s\.frequency_seconds SECOND/);
  assert.match(repo.calls[0].sql, /g\.enabled=1/);
});

test('loadKeywordRules 两级词表：平台级覆盖游戏级', async () => {
  const repo = stubRepo(() => [
    { id: 'r1', keyword: '崩溃', platform: null, severity: 'attention' },
    { id: 'r2', keyword: '崩溃', platform: 'taptap', severity: 'urgent' },
    { id: 'r3', keyword: '退款', platform: null, severity: 'attention' }
  ]);
  const rules = await repo.loadKeywordRules('g1', 'taptap');
  const byKw = Object.fromEntries(rules.map(r => [r.keyword, r]));
  assert.equal(byKw['崩溃'].id, 'r2'); // 平台级优先
  assert.equal(byKw['退款'].id, 'r3'); // 游戏级兜底
  assert.equal(rules.length, 2);
  assert.deepEqual(repo.calls[0].params, ['g1', 'taptap']);
});

test('loadKeywordRules 四级词表按社区和平台优先级覆盖并归一化去重', async () => {
  const repo = stubRepo(() => [
    { id: 'game-common', keyword: ' 崩溃 ', community_id: null, platform: null },
    { id: 'game-platform', keyword: '崩溃', community_id: null, platform: 'taptap' },
    { id: 'community-common', keyword: 'ＢＵＧ', community_id: 'community-1', platform: null },
    { id: 'community-platform', keyword: 'bug', community_id: 'community-1', platform: 'taptap' },
    { id: 'refund-community', keyword: ' 退款 ', community_id: 'community-1', platform: null },
    { id: 'refund-game-platform', keyword: '退款', community_id: null, platform: 'taptap' },
    { id: 'lag-game', keyword: '卡顿', community_id: null, platform: null }
  ]);

  const rules = await repo.loadKeywordRules('game-1', 'taptap', 'community-1');

  assert.deepEqual(rules.map(rule => rule.id), ['game-platform', 'community-platform', 'refund-community', 'lag-game']);
  assert.match(repo.calls[0].sql, /\(community_id=\? OR community_id IS NULL\)/);
  assert.match(repo.calls[0].sql, /\(platform=\? OR platform IS NULL\)/);
  assert.deepEqual(repo.calls[0].params, ['game-1', 'community-1', 'taptap']);
});

test('countWindowHits 用 JSON_CONTAINS 统计滑窗命中', async () => {
  const repo = stubRepo(() => [{ hits: 7 }]);
  const hits = await repo.countWindowHits({ gameId: 'g1', groupName: '差评组', windowSeconds: 1800 });
  assert.equal(hits, 7);
  assert.match(repo.calls[0].sql, /JSON_CONTAINS/);
  assert.deepEqual(repo.calls[0].params, ['g1', 1800, '差评组']);
});

test('findOpenAlert 只取冷却期内未闭环告警', async () => {
  const repo = stubRepo(() => [{ id: 'a1' }]);
  const found = await repo.findOpenAlert({ gameId: 'g1', alertType: 'immediate', cooldownSeconds: 600 });
  assert.equal(found.id, 'a1');
  assert.match(repo.calls[0].sql, /status NOT IN \('resolved','false_positive'\)/);
  assert.deepEqual(repo.calls[0].params, ['g1', 'immediate', 600]);
});

test('insertAlert 写主体并关联命中内容', async () => {
  const repo = stubRepo((sql) => (sql.startsWith('SELECT') ? [{ id: 'fixed', game_id: 'g1' }] : { affectedRows: 1 }));
  const alert = await repo.insertAlert({ gameId: 'g1', severity: 'urgent', alertType: 'immediate', title: 't', triggerDetail: 'd', contentIds: ['c1', 'c2'] });
  assert.equal(alert.game_id, 'g1');
  const inserts = repo.calls.filter(c => c.sql.startsWith('INSERT INTO po_alerts'));
  const links = repo.calls.filter(c => c.sql.startsWith('INSERT IGNORE INTO po_alert_contents'));
  assert.equal(inserts.length, 1);
  assert.equal(links.length, 2);
});

test('getAlert 返回帖子和评论的完整关联原文', async () => {
  const longBody = '完整原文内容'.repeat(40);
  const related = [
    { id: 'c-post', content_type: 'post', body: longBody, author_id: 'author-post' },
    { id: 'c-comment', content_type: 'comment', body: '完整评论', author_id: 'author-comment' }
  ];
  const repo = stubRepo(sql => {
    if (/FROM po_alerts a .*a\.id=\?/.test(sql)) return [{ id: 'a1', title: '告警' }];
    if (/FROM po_alert_contents ac/.test(sql)) return related;
    return [];
  });

  const alert = await repo.getAlert('a1');

  assert.equal(alert.id, 'a1');
  assert.deepEqual(alert.related_contents, related);
  assert.equal(alert.related_contents[0].body, longBody);
  assert.equal(alert.related_contents[0].author_id, 'author-post');
  assert.equal(alert.related_contents[1].author_id, 'author-comment');
  const relatedCall = repo.calls.find(call => /FROM po_alert_contents ac/.test(call.sql));
  assert.ok(relatedCall);
  assert.match(relatedCall.sql, /c\.platform_author_id AS author_id/);
  assert.match(relatedCall.sql, /JOIN po_contents c ON c\.id=ac\.content_id/);
  assert.doesNotMatch(relatedCall.sql, /LEFT\s*\(|SUBSTRING\s*\(/i);
  assert.deepEqual(relatedCall.params, ['a1']);
});

test('getAlert 不存在时不查询关联内容，无关联时返回空数组', async () => {
  const missing = stubRepo(() => []);
  assert.equal(await missing.getAlert('missing'), null);
  assert.equal(missing.calls.length, 1);

  const empty = stubRepo(sql => /FROM po_alerts a .*a\.id=\?/.test(sql) ? [{ id: 'a-empty' }] : []);
  const emptyAlert = await empty.getAlert('a-empty');
  assert.deepEqual(emptyAlert.related_contents, []);
  assert.deepEqual(emptyAlert.independent_reviews, []);
  assert.equal(empty.calls.length, 3);
});

test('updateDingStatus 幂等回写推送状态', async () => {
  const repo = stubRepo(() => ({ affectedRows: 1 }));
  await repo.updateDingStatus('a1', 'sent');
  assert.match(repo.calls[0].sql, /UPDATE po_alerts SET ding_talk_status=\?/);
  assert.deepEqual(repo.calls[0].params, ['sent', 'a1']);
});

test('listContents unclassified 过滤未分析内容', async () => {
  const repo = stubRepo(() => []);
  await repo.listContents({ gameId: 'g1', sentiment: 'unclassified', page: 1, pageSize: 20 });
  const sql = repo.calls[0].sql;
  assert.match(sql, /a\.content_id IS NULL/);
  // unclassified 不应额外拼 a.sentiment=? 条件
  assert.doesNotMatch(sql, /a\.sentiment=\?/);
  // 仍带 gameId 过滤与分页（jobs join 已按需拼接，无 analysisStatus 时不再前置 lightVersion 参数）
  assert.deepEqual(repo.calls[0].params, ['g1', 20, 0]);
});

test('insertAnalysis keeps task trigger and model explanation in separate columns', async () => {
  const repo = stubRepo(() => ({ affectedRows: 1 }));
  await repo.insertAnalysis('c1', {
    triggerReason: 'manual_reanalysis', reason: '内容使用明确的抱怨措辞，表达了对登录失败的不满。',
    sentiment: 'negative', negativeScore: 0.9, confidence: 0.8, severity: 'attention'
  });
  const call = repo.calls[0];
  assert.match(call.sql, /trigger_reason, analysis_reason/);
  assert.match(call.sql, /analysis_reason=VALUES\(analysis_reason\)/);
  assert.equal(call.params[5], 'manual_reanalysis');
  assert.equal(call.params[6], '内容使用明确的抱怨措辞，表达了对登录失败的不满。');
});

test('insertAnalysis never falls back from model explanation to task trigger', async () => {
  const repo = stubRepo(() => ({ affectedRows: 1 }));
  await repo.insertAnalysis('c1', { reason: '内容只是在确认更新信息，没有明显情绪倾向。', sentiment: 'neutral', negativeScore: 0, confidence: 0.9, severity: 'normal' });
  assert.equal(repo.calls[0].params[5], null);
  assert.equal(repo.calls[0].params[6], '内容只是在确认更新信息，没有明显情绪倾向。');
});

test('legacy insertContent persists source community ownership', async () => {
  const repo = stubRepo(sql => sql.startsWith('INSERT INTO po_contents') ? { affectedRows: 1 } : [{ id: 'content-1' }]);
  const source = { id: 'source-1', game_id: 'game-1', community_id: 'community-1' };
  const raw = { externalId: 'external-1', contentType: 'post', authorName: 'author', title: 'title', body: 'body', publishedAt: '2026-08-14 10:00:00', sourceUrl: 'https://example.test/post/1', engagement: { likes: 2 }, fingerprint: 'fp-1' };

  const content = await repo.insertContent(source, raw);

  assert.equal(content.id, 'content-1');
  assert.match(repo.calls[0].sql, /\(id, game_id, community_id, source_id,/);
  assert.deepEqual(repo.calls[0].params.slice(1, 4), ['game-1', 'community-1', 'source-1']);
});

test('claimAnalysisJobs scopes claims by ownership and published window with a unique claim owner', async () => {
  const repo = stubRepo(sql => sql.startsWith('UPDATE po_analysis_jobs') ? { affectedRows: 1 } : []);

  await repo.claimAnalysisJobs({
    profile: 'light', version: 'sentiment-v2', leaseOwner: 'worker-1', leaseSeconds: 120, limit: 700,
    sourceId: 'source-1', accountId: 'account-1', gameId: 'game-1', communityId: 'community-1',
    publishedFrom: '2026-08-10T16:00:00.000Z', publishedTo: '2026-08-11T16:00:00.000Z'
  });

  const claim = repo.calls[0];
  assert.match(claim.sql, /JOIN po_contents c ON c\.id=j\.content_id/);
  assert.match(claim.sql, /JOIN po_sources s ON s\.id=c\.source_id/);
  assert.match(claim.sql, /s\.enabled=1/);
  assert.match(claim.sql, /j\.lease_owner NOT LIKE 'q1-daily:%:%:%:%'/);
  assert.match(claim.sql, /c\.source_id=\?/);
  assert.match(claim.sql, /c\.account_id=\?/);
  assert.match(claim.sql, /c\.game_id=\?/);
  assert.match(claim.sql, /c\.community_id=\?/);
  assert.match(claim.sql, /c\.published_at>=\?/);
  assert.match(claim.sql, /c\.published_at<\?/);
  assert.match(claim.params[0], /^worker-1:/);
  assert.deepEqual(claim.params.slice(1), [120, 'light', 'sentiment-v2', 'source-1', 'account-1', 'game-1', 'community-1', '2026-08-10T16:00:00.000Z', '2026-08-11T16:00:00.000Z', 500]);
  assert.equal(repo.calls[1].params[0], claim.params[0], 'claim 后只能查询本次唯一 lease owner');
});

test('claimAnalysisJobs only bypasses disabled source gate for an exact auditable manual scope', async () => {
  const repo = stubRepo(sql => sql.startsWith('UPDATE po_analysis_jobs') ? { affectedRows: 1 } : []);
  const scope = {
    profile: 'deep', version: 'quality-v1', leaseOwner: 'q1-daily:1234:5c21f78d-5f67-4467-963d-dcdeb5e26cab:2026-09-09',
    sourceId: '5c21f78d-5f67-4467-963d-dcdeb5e26cab', contentIds: ['content-1'],
    publishedFrom: '2026-09-08T16:00:00.000Z', publishedTo: '2026-09-09T16:00:00.000Z', businessDate: '2026-09-09', allowDisabledSource: true
  };

  await repo.claimAnalysisJobs(scope);

  assert.doesNotMatch(repo.calls[0].sql, /s\.enabled=1/);
  assert.match(repo.calls[0].sql, /c\.source_id=\?/);
  assert.match(repo.calls[0].sql, /c\.id IN \(\?\)/);
  assert.match(repo.calls[0].sql, /c\.published_at>=\?.*c\.published_at<\?/);
});

test('claimAnalysisJobs rejects disabled source bypass without the complete manual fence', async () => {
  const repo = stubRepo(() => []);
  await assert.rejects(
    () => repo.claimAnalysisJobs({
      profile: 'deep', version: 'quality-v1', leaseOwner: 'worker-1', sourceId: 'source-1',
      contentIds: ['content-1'], publishedFrom: 'from', publishedTo: 'to', allowDisabledSource: true
    }),
    error => error.code === 'ANALYSIS_CLAIM_SCOPE_REQUIRED'
  );
  await assert.rejects(
    () => repo.claimAnalysisJobs({
      profile: 'deep', version: 'quality-v1',
      leaseOwner: 'q1-daily:1234:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:2026-09-09',
      sourceId: '5c21f78d-5f67-4467-963d-dcdeb5e26cab', contentIds: ['content-1'],
      publishedFrom: 'from', publishedTo: 'to', businessDate: '2026-09-09', allowDisabledSource: true
    }),
    error => error.code === 'ANALYSIS_CLAIM_SCOPE_REQUIRED'
  );
  assert.equal(repo.calls.length, 0);
});

test('countAnalysisJobs and countContentsByType keep yesterday isolation in SQL', async () => {
  const repo = stubRepo(sql => sql.includes('GROUP BY j.status')
    ? [{ status: 'pending', count: '2' }, { status: 'completed', count: '5' }]
    : [{ content_type: 'post', count: '3' }, { content_type: 'comment', count: '4' }]);
  const window = { publishedFrom: '2026-08-10T16:00:00.000Z', publishedTo: '2026-08-11T16:00:00.000Z' };

  assert.deepEqual(await repo.countAnalysisJobs({ profile: 'light', version: 'sentiment-v1', ...window }), { pending: 2, running: 0, retryable: 0, completed: 5, failed: 0, total: 7, completionRate: 71.4, updatedAt: null });
  assert.deepEqual(await repo.countContentsByType(window), { post: 3, comment: 4 });
  assert.match(repo.calls[0].sql, /c\.published_at>=\?.*c\.published_at<\?/);
  assert.match(repo.calls[1].sql, /c\.published_at>=\?.*c\.published_at<\?/);
});

test('listSyncParents can refresh completed comment checkpoints for daily collection', async () => {
  const repo = stubRepo(() => []);
  await repo.listSyncParents('account-1', 'comments', { includeCompleted: true });
  assert.match(repo.calls[0].sql, /cp\.status<>'running'/);
  assert.doesNotMatch(repo.calls[0].sql, /cp\.status IN \('idle','failed'\)/);
});

test('enqueueMissingAnalysis scopes candidates by region and community', async () => {
  const repo = stubRepo(() => []);

  const count = await repo.enqueueMissingAnalysis({ profile: 'light', version: 'sentiment-v2', regionCode: 'overseas', communityId: 'community-1', limit: 25 });

  assert.equal(count, 0);
  assert.match(repo.calls[0].sql, /JOIN po_games g ON g\.id=c\.game_id/);
  assert.match(repo.calls[0].sql, /c\.community_id=\?/);
  assert.match(repo.calls[0].sql, /g\.region_code=\?/);
  assert.deepEqual(repo.calls[0].params, ['light', 'sentiment-v2', 'community-1', 'overseas', 25]);
});

test('content list and tree queries expose analysis_reason', async () => {
  const repo = stubRepo(() => []);
  await repo.listContents({});
  await repo.listContentTree({});
  assert.match(repo.calls[0].sql, /a\.analysis_reason/);
  assert.match(repo.calls[1].sql, /an\.analysis_reason/);
});

test('getOverview 返回完整归属的 trend 与 hotNegative', async () => {
  const repo = stubRepo((sql) => {
    if (/DATE_ADD\(c\.published_at, INTERVAL 8 HOUR\)/.test(sql)) return [{ date: '2026-08-07', negative: 2, total: 5 }];
    if (/engagement DESC/.test(sql)) return [{ id: 'c1', game_name: '超能世界', community_name: '超能世界国服版', engagement: 99 }];
    if (/GROUP BY s\.platform/.test(sql)) return [{ platform: 'taptap', count: 5 }];
    if (/GROUP BY a\.sentiment/.test(sql)) return [{ sentiment: 'negative', count: 2 }];
    if (/po_alerts/.test(sql)) return [{ id: 'a1', game_name: '超能世界', community_name: '超能世界国服版' }];
    return [{ total: 5, negative: 2, urgent: 1 }];
  });
  const overview = await repo.getOverview({
    regionCode: 'domestic',
    gameId: 'g1',
    communityId: 'cm1',
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-08T00:00:00.000Z'
  });
  assert.equal(overview.trend[0].date, '2026-08-07');
  assert.equal(overview.hotNegative[0].community_name, '超能世界国服版');
  assert.equal(overview.activeAlerts[0].game_name, '超能世界');
  assert.equal(overview.metrics.total, 5);

  const trend = repo.calls.find(({ sql }) => /DATE_ADD\(c\.published_at, INTERVAL 8 HOUR\)/.test(sql));
  assert.match(trend.sql, /JOIN po_games g ON g\.id=c\.game_id/);
  assert.match(trend.sql, /g\.region_code=\?/);
  assert.doesNotMatch(trend.sql, /CURRENT_DATE - INTERVAL 6 DAY/);
  assert.deepEqual(trend.params, ['domestic', 'g1', 'cm1', '2026-08-01T00:00:00.000Z', '2026-08-08T00:00:00.000Z']);

  const hotNegative = repo.calls.find(({ sql }) => /engagement DESC/.test(sql));
  assert.match(hotNegative.sql, /g\.name AS game_name, g\.region_code/);
  assert.match(hotNegative.sql, /cm\.name AS community_name/);
  assert.match(hotNegative.sql, /JOIN po_games g ON g\.id=c\.game_id/);
  assert.match(hotNegative.sql, /LEFT JOIN po_communities cm ON cm\.id=c\.community_id/);

  const alerts = repo.calls.find(({ sql }) => /FROM po_alerts a/.test(sql));
  assert.match(alerts.sql, /g\.name AS game_name, g\.region_code/);
  assert.match(alerts.sql, /cm\.name AS community_name/);
  assert.match(alerts.sql, /a\.created_at >= \?/);
  assert.match(alerts.sql, /a\.created_at < \?/);
  assert.deepEqual(alerts.params, ['domestic', 'g1', 'cm1', '2026-08-01T00:00:00.000Z', '2026-08-08T00:00:00.000Z']);
});

// ── A3 后台配置写入 ──

test('updateSource 只更新传入的字段', async () => {
  const repo = stubRepo((sql) => (sql.startsWith('SELECT') ? [{ id: 's1', enabled: 0 }] : { affectedRows: 1 }));
  const row = await repo.updateSource('s1', { enabled: false, frequencySeconds: 300 });
  assert.equal(row.id, 's1');
  const upd = repo.calls.find(c => c.sql.startsWith('UPDATE po_sources'));
  assert.match(upd.sql, /frequency_seconds=COALESCE/);
  assert.equal(upd.params[0], 0); // enabled=false → 0
  assert.equal(upd.params[1], 300);
  assert.equal(upd.params[2], null); // activeWindow 未传 → 不动
  assert.equal(upd.params[4], null); // config 未传 baseUrl/startPaths → configJson=null 不动
  assert.equal(upd.params[5], 's1');
});

test('updateSource 序列化 active_window', async () => {
  const repo = stubRepo((sql) => (sql.startsWith('SELECT') ? [{ id: 's1' }] : { affectedRows: 1 }));
  await repo.updateSource('s1', { activeWindow: { days: [1, 2], start: '09:00', end: '18:00' } });
  const upd = repo.calls.find(c => c.sql.startsWith('UPDATE po_sources'));
  assert.equal(upd.params[2], '{"days":[1,2],"start":"09:00","end":"18:00"}');
});

test('Facebook baseUrl 变化在同一事务内失效身份、运行、能力和 checkpoint，但保留凭据与历史内容', async () => {
  const repo = stubRepo((sql) => {
    if (sql.startsWith('SELECT * FROM po_sources')) return [{ id: 's-fb', platform: 'facebook', config: JSON.stringify({ baseUrl: 'https://www.facebook.com/old-page' }) }];
    if (sql.startsWith('SELECT * FROM po_accounts')) return [{ id: 'a-fb' }];
    return { affectedRows: 1 };
  });
  await repo.updateSource('s-fb', { enabled: true, baseUrl: 'https://www.facebook.com/new-page' });
  const sql = repo.calls.map(call => call.sql);
  assert.ok(sql.some(value => value.includes("auth_status='unconfigured'") && value.includes('collect_requested_at=NULL')));
  assert.ok(sql.some(value => value.startsWith('UPDATE po_accounts SET platform_account_id=') && value.includes('profile_url=NULL') && value.includes('last_full_sync_at=NULL')));
  assert.ok(sql.some(value => value.startsWith('UPDATE po_sync_runs') && value.includes('error_code=?') && value.includes("status IN ('queued','running')")));
  assert.ok(sql.some(value => value.startsWith('UPDATE po_source_schedule_state') && value.includes('next_scheduled_at=NULL') && value.includes('lease_epoch=lease_epoch+1')));
  assert.ok(sql.some(value => value.startsWith('DELETE FROM po_source_capabilities') && value.includes('capability IN (?,?,?,?)')));
  assert.ok(sql.some(value => value.startsWith('DELETE cp FROM po_sync_checkpoints')));
  assert.ok(!sql.some(value => /po_credentials|po_contents|po_quality_candidates|po_alerts/.test(value)));
  const accountReset = repo.calls.find(call => call.sql.startsWith('UPDATE po_accounts SET platform_account_id='));
  assert.deepEqual(accountReset.params, ['pending:a-fb', 'a-fb']);
});

test('Facebook baseUrl 规范化后未变化不误清授权、能力或 checkpoint', async () => {
  const repo = stubRepo((sql) => sql.startsWith('SELECT * FROM po_sources')
    ? [{ id: 's-fb', platform: 'facebook', config: JSON.stringify({ baseUrl: 'https://facebook.com/same-page/?utm_source=legacy' }) }]
    : { affectedRows: 1 });
  await repo.updateSource('s-fb', { enabled: true, baseUrl: 'https://www.facebook.com/same-page' });
  assert.ok(!repo.calls.some(call => call.sql.includes("auth_status='unconfigured'")));
  assert.ok(!repo.calls.some(call => call.sql.includes('po_source_capabilities')));
  assert.ok(!repo.calls.some(call => call.sql.includes('po_sync_checkpoints')));
  const sourceUpdate = repo.calls.find(call => call.sql.startsWith('UPDATE po_sources SET enabled=COALESCE'));
  assert.equal(sourceUpdate.params[0], 1);
});

test('Facebook baseUrl 安全失效任一步失败时原子回滚', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  const conn = {
    async query(sql) {
      executed.push(sql);
      if (sql.startsWith('SELECT * FROM po_sources')) return [[{ id: 's-fb', platform: 'facebook', config: '{"baseUrl":"https://www.facebook.com/old-page"}' }]];
      if (sql.startsWith('SELECT * FROM po_accounts')) return [[{ id: 'a-fb' }]];
      if (sql.startsWith('DELETE FROM po_source_capabilities')) throw new Error('capability reset failed');
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { executed.push('BEGIN'); }, async commit() { executed.push('COMMIT'); }, async rollback() { executed.push('ROLLBACK'); }, release() {}
  };
  repo.pool = { async getConnection() { return conn; } };
  await assert.rejects(() => repo.updateSource('s-fb', { baseUrl: 'https://www.facebook.com/new-page' }), /capability reset failed/);
  assert.ok(executed.includes('ROLLBACK'));
  assert.ok(!executed.includes('COMMIT'));
});

test('Facebook configuration 端点使用同一目标失效状态机且不删除 Token', async () => {
  const repo = stubRepo((sql) => {
    if (sql.startsWith('SELECT * FROM po_sources')) return [{ id: 's-fb', platform: 'facebook', config: '{"baseUrl":"https://www.facebook.com/old-page"}' }];
    if (sql.startsWith('SELECT * FROM po_accounts')) return [{ id: 'a-fb', metadata: '{}' }];
    return { affectedRows: 1 };
  });
  repo.listAccounts = async () => [{ id: 'a-fb', platform_account_id: 'pending:a-fb' }];
  await repo.updateSourceConfiguration('s-fb', { displayName: 'Facebook', baseUrl: 'https://www.facebook.com/new-page', frequencySeconds: 3600, syncMode: 'incremental', historyStart: null, enabled: true });
  const sourceWrite = repo.calls.find(call => call.sql.startsWith('UPDATE po_sources SET display_name='));
  assert.equal(sourceWrite.params[1], 0, '地址变化必须覆盖请求中的 enabled=true');
  assert.ok(repo.calls.some(call => call.sql.startsWith('UPDATE po_sync_runs') && call.params[0] === 'FACEBOOK_TARGET_CHANGED'));
  assert.ok(repo.calls.some(call => call.sql.startsWith('DELETE cp FROM po_sync_checkpoints')));
  assert.ok(!repo.calls.some(call => call.sql.includes('DELETE FROM po_credentials')));
});

test('Facebook 同地址写入新 Token 时 fail-close，但保留 Page 身份与 checkpoint', async () => {
  const repo = stubRepo((sql) => {
    if (sql.startsWith('SELECT * FROM po_sources')) return [{ id: 's-fb', platform: 'facebook', config: '{"baseUrl":"https://www.facebook.com/same-page"}' }];
    if (sql.startsWith('SELECT * FROM po_accounts')) return [{ id: 'a-fb', platform_account_id: 'page-123', metadata: '{}' }];
    return { affectedRows: 1 };
  });
  repo.listAccounts = async () => [{ id: 'a-fb', platform_account_id: 'page-123' }];
  await repo.updateSourceConfiguration('s-fb', { displayName: 'Facebook', baseUrl: 'https://facebook.com/same-page/?utm_source=admin', frequencySeconds: 3600, syncMode: 'incremental', historyStart: null, enabled: true, credential: { credentialType: 'api_token' }, credentialCipher: 'NEW-CIPHER' });
  const sourceWrite = repo.calls.find(call => call.sql.startsWith('UPDATE po_sources SET display_name='));
  assert.equal(sourceWrite.params[1], 1, '配置主写保持调用参数，随后 fail-close 写在同一事务');
  assert.ok(repo.calls.some(call => call.sql.startsWith('INSERT INTO po_credentials') && call.params.at(-1) === 'NEW-CIPHER'));
  assert.ok(repo.calls.some(call => call.sql.startsWith('UPDATE po_sources SET enabled=0')));
  assert.ok(repo.calls.some(call => call.sql.startsWith('UPDATE po_accounts SET auth_status=') && !call.sql.includes('platform_account_id')));
  assert.ok(repo.calls.some(call => call.sql.startsWith('UPDATE po_sync_runs') && call.params[0] === 'FACEBOOK_CREDENTIAL_CHANGED'));
  assert.ok(repo.calls.some(call => call.sql.startsWith('DELETE FROM po_source_capabilities')));
  assert.ok(!repo.calls.some(call => call.sql.startsWith('DELETE cp FROM po_sync_checkpoints')));
  assert.ok(!repo.calls.some(call => call.sql.startsWith('UPDATE po_accounts SET platform_account_id=')));
});

test('Facebook 目标变化终止旧 run 后旧 worker 的后续入库被 lease/status 栅栏拒绝', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  let runActive = true; const executed = [];
  const conn = {
    async query(sql) {
      executed.push(sql);
      if (sql.startsWith('SELECT * FROM po_sources')) return [[{ id: 's-fb', platform: 'facebook', config: '{"baseUrl":"https://www.facebook.com/old-page"}' }]];
      if (sql.startsWith('SELECT * FROM po_accounts')) return [[{ id: 'a-fb' }]];
      if (sql.startsWith('UPDATE po_sync_runs')) { runActive = false; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('SELECT r.id FROM po_sync_runs')) return [runActive ? [{ id: 'run-old' }] : []];
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { executed.push('BEGIN'); }, async commit() { executed.push('COMMIT'); }, async rollback() { executed.push('ROLLBACK'); }, release() {}
  };
  repo.pool = { async getConnection() { return conn; } };
  repo.query = async sql => sql.startsWith('SELECT * FROM po_sources') ? [{ id: 's-fb' }] : [];
  await repo.updateSource('s-fb', { baseUrl: 'https://www.facebook.com/new-page' });
  await assert.rejects(() => repo.upsertContentPage({ account: { id: 'a-fb', source_id: 's-fb' }, syncRunId: 'run-old', syncScope: 'posts', leaseOwner: 'old-worker', items: [{ externalId: 'should-not-write' }] }), error => error.code === 'SYNC_RUN_LEASE_LOST');
  assert.ok(!executed.some(sql => sql.startsWith('INSERT INTO po_contents')));
});

test('upsertCredential 无记录时插入密文、不落明文', async () => {
  const repo = stubRepo((sql) => (sql.includes('FROM po_credentials WHERE source_id') && sql.startsWith('SELECT') ? [] : { affectedRows: 1 }));
  // 让 getCredential 第一次返回 null（无记录），插入后再 getCredential 返回空
  const cipher = JSON.stringify({ v: 1, iv: 'x', tag: 'y', cipher: 'z' });
  await repo.upsertCredential('s1', { secretCipher: cipher, status: 'active' });
  const ins = repo.calls.find(c => c.sql.startsWith('INSERT INTO po_credentials'));
  assert.ok(ins, '应插入凭据');
  assert.equal(ins.params[2], ''); // secret_ref 兼容空
  assert.equal(ins.params[3], cipher); // secret_cipher 存密文
  assert.ok(!cipher.includes('password'), '密文中不出现明文');
});

test('upsertCredential 已有时走 UPDATE 并清空 failure_reason', async () => {
  let selectN = 0;
  const repo = stubRepo((sql) => {
    if (sql.startsWith('SELECT') && sql.includes('FROM po_credentials')) { selectN += 1; return selectN === 1 ? [{ id: 'cr1', source_id: 's1' }] : [{ id: 'cr1', source_id: 's1', status: 'active' }]; }
    return { affectedRows: 1 };
  });
  await repo.upsertCredential('s1', { secretCipher: 'ENC', status: 'active' });
  const upd = repo.calls.find(c => c.sql.startsWith('UPDATE po_credentials'));
  assert.ok(upd, '应走 UPDATE 而非重复 INSERT');
  assert.match(upd.sql, /failure_reason=NULL/);
  assert.equal(upd.params[0], 'ENC');
});

test('upsertAccountCredential uses account/type unique key for idempotent writes', async () => {
  const repo = stubRepo((sql) => {
    if (sql.startsWith('SELECT source_id FROM po_accounts')) return [{ source_id: 's1' }];
    if (sql.startsWith('SELECT id, platform FROM po_sources')) return [{ id: 's1', platform: 'bigplayer_h5' }];
    if (sql.startsWith('SELECT * FROM po_accounts')) return [{ id: 'a1', source_id: 's1', platform: 'bigplayer_h5' }];
    if (sql.startsWith('SELECT id, account_id, credential_type')) return [{ id: 'cr1', account_id: 'a1', credential_type: 'api_token' }];
    return { affectedRows: 1 };
  });
  const row = await repo.upsertAccountCredential('a1', { credentialType: 'api_token', secretCipher: 'ENC' });
  assert.equal(row.id, 'cr1');
  const write = repo.calls.find(c => c.sql.startsWith('INSERT INTO po_credentials'));
  assert.ok(write, '应使用 INSERT ... ON DUPLICATE KEY UPDATE');
  assert.match(write.sql, /ON DUPLICATE KEY UPDATE/);
  assert.match(write.sql, /failure_reason=NULL/);
  assert.equal(write.params[1], 'a1');
  assert.equal(write.params[2], 's1');
});

test('upsertAccountCredential 的 Facebook Token 公共入口同事务 fail-close 且保留 Page/checkpoint', async () => {
  const repo = stubRepo((sql) => {
    if (sql.startsWith('SELECT source_id FROM po_accounts')) return [{ source_id: 's-fb' }];
    if (sql.startsWith('SELECT id, platform FROM po_sources')) return [{ id: 's-fb', platform: 'facebook' }];
    if (sql.startsWith('SELECT * FROM po_accounts')) return [{ id: 'a-fb', source_id: 's-fb', platform: 'facebook', platform_account_id: 'page-123' }];
    if (sql.startsWith('SELECT id, account_id, credential_type')) return [{ id: 'cr-fb', account_id: 'a-fb', credential_type: 'api_token', status: 'active' }];
    return { affectedRows: 1 };
  });
  const row = await repo.upsertAccountCredential('a-fb', { credentialType: 'api_token', secretCipher: 'NEW-CIPHER' });
  assert.equal(row.id, 'cr-fb');
  assert.ok(repo.calls.some(call => call.sql.startsWith('INSERT INTO po_credentials')));
  assert.ok(repo.calls.some(call => call.sql.startsWith('UPDATE po_sources SET enabled=0')));
  assert.ok(repo.calls.some(call => call.sql.startsWith('UPDATE po_sync_runs') && call.params[0] === 'FACEBOOK_CREDENTIAL_CHANGED'));
  assert.ok(repo.calls.some(call => call.sql.startsWith('UPDATE po_source_schedule_state') && call.params[0] === 'FACEBOOK_CREDENTIAL_CHANGED'));
  assert.ok(repo.calls.some(call => call.sql.startsWith('DELETE FROM po_source_capabilities')));
  assert.ok(!repo.calls.some(call => call.sql.startsWith('DELETE cp FROM po_sync_checkpoints')));
  assert.ok(!repo.calls.some(call => call.sql.startsWith('UPDATE po_accounts SET platform_account_id=')));
});

test('credential lookup is redacted by default and explicit internal lookup includes secret', async () => {
  const repo = stubRepo((sql) => [{ id: 'cr1', ...(sql.includes('secret_cipher') ? { secret_cipher: 'ENC' } : {}) }]);
  const safe = await repo.getCredentialByAccount('a1', 'api_token');
  assert.equal(safe.secret_cipher, undefined);
  assert.doesNotMatch(repo.calls[0].sql, /secret_cipher/);
  const internal = await repo.getCredentialByAccount('a1', 'api_token', { includeSecret: true });
  assert.equal(internal.secret_cipher, 'ENC');
  assert.match(repo.calls[1].sql, /secret_cipher/);
});

test('account CRUD/default account uses game-scoped identity', async () => {
  const repo = stubRepo((sql) => sql.startsWith('SELECT * FROM po_accounts WHERE id=') ? [{ id: 'a1' }] : []);
  const account = await repo.createAccount({ gameId: 'g1', sourceId: 's1', platform: 'h5', platformAccountId: 'u1', accountName: 'official' });
  assert.equal(account.id, 'a1');
  const insert = repo.calls.find(c => c.sql.startsWith('INSERT INTO po_accounts'));
  assert.equal(insert.params[1], 'g1');
  assert.equal(insert.params[2], null);
  assert.equal(insert.params[5], 'u1');
  await repo.getDefaultAccount({ gameId: 'g1', platform: 'h5' });
  assert.match(repo.calls.at(-1).sql, /enabled=\?/);
  assert.match(repo.calls.at(-1).sql, /ORDER BY a\.updated_at DESC, a\.id ASC/);
});

test('claim checkpoint is atomic and lease based', async () => {
  const repo = stubRepo((sql) => sql.startsWith('SELECT * FROM po_sync_checkpoints') ? [{ id: 'cp1', status: 'running', lease_owner: 'worker-1' }] : { affectedRows: 1 });
  const row = await repo.claimSyncCheckpoint({ accountId: 'a1', syncScope: 'posts', leaseOwner: 'worker-1', leaseSeconds: 60 });
  assert.equal(row.status, 'running');
  assert.match(repo.calls[0].sql, /INSERT IGNORE/);
  assert.match(repo.calls[1].sql, /lease_until/);
  assert.doesNotMatch(repo.calls[1].sql, /'paused'/);
});

test('checkpoint identity isolates exact collection windows and preserves same-window resume', async () => {
  const rows = new Map();
  const repo = stubRepo((sql, params) => {
    if (sql.startsWith('INSERT IGNORE')) {
      const key = params.slice(1, 8).join('|');
      if (!rows.has(key)) rows.set(key, { id: `cp-${rows.size + 1}`, status: 'idle', cursor: null });
      return { affectedRows: 1 };
    }
    if (sql.startsWith('UPDATE po_sync_checkpoints SET status=')) {
      const key = params.slice(3, 10).join('|');
      const row = rows.get(key); row.status = 'running'; row.lease_owner = params[0]; return { affectedRows: 1 };
    }
    if (sql.startsWith('SELECT * FROM po_sync_checkpoints')) return [rows.get(params.join('|'))];
    return { affectedRows: 1 };
  });
  const base = { accountId: 'a1', taskKind: 'q1_feed', taskKey: 'home', syncScope: 'posts', leaseOwner: 'worker-1' };
  const first = await repo.claimSyncCheckpoint({ ...base, windowStart: '2026-09-04T16:00:00.000Z', windowEnd: '2026-09-05T16:00:00.000Z' });
  rows.get('a1|q1_feed|home|posts||2026-09-04T16:00:00.000Z|2026-09-05T16:00:00.000Z').cursor = 'page-2';
  const resumed = await repo.claimSyncCheckpoint({ ...base, windowStart: '2026-09-04T16:00:00.000Z', windowEnd: '2026-09-05T16:00:00.000Z' });
  const nextDate = await repo.claimSyncCheckpoint({ ...base, windowStart: '2026-09-05T16:00:00.000Z', windowEnd: '2026-09-06T16:00:00.000Z' });
  assert.equal(resumed.id, first.id);
  assert.equal(resumed.cursor, 'page-2');
  assert.notEqual(nextDate.id, first.id);
  assert.equal(nextDate.cursor, null);
});

test('checkpoint release remains fenced against a stale owner', async () => {
  const repo = stubRepo(sql => sql.startsWith('UPDATE') ? { affectedRows: 0 } : [{ id: 'cp1', status: 'running', lease_owner: 'current-owner' }]);
  const row = await repo.releaseSyncCheckpoint('cp1', { status: 'completed', leaseOwner: 'stale-owner' });
  assert.equal(row.lease_owner, 'current-owner');
  assert.match(repo.calls[0].sql, /WHERE id=\? AND lease_owner=\?/);
  assert.equal(repo.calls[0].params.at(-1), 'stale-owner');
});

test('reply checkpoints are historical only and cannot be claimed or listed as active status', async () => {
  const repo = stubRepo(() => []);
  const claimed = await repo.claimSyncCheckpoint({ accountId: 'a1', syncScope: 'replies', leaseOwner: 'worker-1' });
  assert.equal(claimed, null);
  assert.equal(repo.calls.length, 0, '不得创建或更新 replies checkpoint');

  await repo.getSyncStatus({ accountId: 'a1' });
  assert.match(repo.calls[0].sql, /sync_scope<>'replies'/);
  await repo.getSyncStatus({ accountId: 'a1', syncScope: 'replies' });
  assert.equal(repo.calls.length, 1, '显式查询 replies 也不得暴露历史状态');
});

test('listSyncParents only schedules comments from posts', async () => {
  const repo = stubRepo(() => []);
  await repo.listSyncParents('a1', 'comments');
  assert.match(repo.calls[0].sql, /content_depth=0/);
  const replies = await repo.listSyncParents('a1', 'replies');
  assert.deepEqual(replies, []);
  assert.equal(repo.calls.length, 1, '不得为 replies 主动查询调度父节点');
});

test('listContentTree includes root content and uses analysis alias filters', async () => {
  const repo = stubRepo(() => []);
  await repo.listContentTree({ rootContentId: 'p1', sentiment: 'negative', severity: 'urgent' });
  assert.match(repo.calls[0].sql, /\(c\.id=\? OR c\.root_content_id=\?\)/);
  assert.match(repo.calls[0].sql, /an\.sentiment=\?/);
  assert.match(repo.calls[0].sql, /an\.severity=\?/);
  assert.deepEqual(repo.calls[0].params.slice(0, 7), ['sentiment-v1', 'translation-v1', 'translation-v1', 'urgent', 'negative', 'p1', 'p1']);
});

test('listContentTree sorts post and comment tabs globally by publish time', async () => {
  const repo = stubRepo(() => []);

  await repo.listContentTree({ contentType: 'post' });
  await repo.listContentTree({ contentType: 'comment' });

  for (const call of repo.calls) {
    assert.match(call.sql, /ORDER BY c\.published_at IS NULL, c\.published_at DESC, c\.id DESC LIMIT/);
    assert.doesNotMatch(call.sql, /ORDER BY COALESCE\(c\.root_content_id,c\.id\), c\.content_depth/);
  }
});

test('listContentTree keeps thread ordering when content type is not specified', async () => {
  const repo = stubRepo(() => []);

  await repo.listContentTree({ rootContentId: 'p1' });

  assert.match(repo.calls[0].sql, /ORDER BY COALESCE\(c\.root_content_id,c\.id\), c\.content_depth, c\.published_at IS NULL, c\.published_at DESC LIMIT/);
});

test('listContentTree applies region filtering consistently with the flat content list', async () => {
  const repo = stubRepo(() => []);
  await repo.listContentTree({ regionCode: 'overseas', gameId: 'g1', rootContentId: 'p1' });
  const call = repo.calls[0];
  assert.match(call.sql, /JOIN po_games g ON g\.id=c\.game_id/);
  assert.match(call.sql, /g\.region_code=\?/);
  assert.deepEqual(call.params.slice(0, 6), ['sentiment-v1', 'translation-v1', 'translation-v1', 'g1', 'overseas', 'p1']);
});

test('listContentTree filters content by community ownership', async () => {
  const repo = stubRepo(() => []);

  await repo.listContentTree({ gameId: 'game-1', communityId: 'community-1', rootContentId: 'post-1' });

  const call = repo.calls[0];
  assert.match(call.sql, /c\.game_id=\?/);
  assert.match(call.sql, /c\.community_id=\?/);
  assert.deepEqual(call.params.slice(0, 7), ['sentiment-v1', 'translation-v1', 'translation-v1', 'game-1', 'community-1', 'post-1', 'post-1']);
});

test('upsertContentPage validates active sync-run lease before writing content', async () => {
  const repo = stubRepo(sql => {
    if (sql.includes('FROM po_sync_runs') && sql.includes('FOR UPDATE')) return [];
    return { affectedRows: 1 };
  });
  await assert.rejects(() => repo.upsertContentPage({
    account: { id: 'a1', game_id: 'g1', source_id: 's1' }, syncRunId: 'run-1', syncScope: 'posts', leaseOwner: 'worker-1', items: []
  }), error => error.code === 'SYNC_RUN_LEASE_LOST');
  assert.equal(repo.calls.filter(call => call.sql.startsWith('INSERT INTO po_contents')).length, 0);
  const lease = repo.calls.find(call => call.sql.includes('FROM po_sync_runs'));
  assert.match(lease.sql, /r\.account_id=\?/);
  assert.match(lease.sql, /a\.source_id=\?/);
  assert.match(lease.sql, /r\.status='running'/);
  assert.match(lease.sql, /r\.lease_owner=\?/);
  assert.match(lease.sql, /r\.lease_until>NOW\(\)/);
  assert.match(lease.sql, /FOR UPDATE/);
  assert.deepEqual(lease.params, ['run-1', 'a1', 's1', 'worker-1']);
});
test('upsertContentPage commits content before checkpoint advancement', async () => {
  const executed = [];
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const conn = {
    async query(sql, params) { executed.push({ sql, params }); if (sql.startsWith('INSERT INTO po_contents')) return { affectedRows: 1 }; if (sql.startsWith('SELECT * FROM po_contents')) return [[{ id: 'c1' }]]; return { affectedRows: 1 }; },
    async beginTransaction() { executed.push({ sql: 'BEGIN' }); }, async commit() { executed.push({ sql: 'COMMIT' }); }, async rollback() { executed.push({ sql: 'ROLLBACK' }); }, release() {}
  };
  repo.pool = { async getConnection() { return conn; }, async query() { return [[{ id: 'cp1', status: 'completed' }]]; } };
  const result = await repo.upsertContentPage({ account: { id: 'a1', game_id: 'g1', source_id: 's1' }, syncScope: 'posts', checkpointId: 'cp1', leaseOwner: 'worker-1', items: [{ externalId: 'p1', title: 't', body: 'b', fingerprint: 'fp' }], hasMore: false });
  assert.equal(result.storedCount, 1);
  assert.equal(result.contents[0].change, 'inserted');
  assert.equal(result.contents[0].content.id, 'c1');
  assert.ok(executed.findIndex(c => c.sql.startsWith('INSERT INTO po_contents')) < executed.findIndex(c => c.sql.startsWith('UPDATE po_sync_checkpoints')));
  assert.equal(executed.at(-1).sql, 'COMMIT');
});

test('upsertContentPage persists explicit comment root parent and depth', async () => {
  const executed = [];
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const byExternalId = { post1: { id: 'post-db' }, comment1: { id: 'comment-db' } };
  const conn = {
    async query(sql, params = []) {
      executed.push({ sql, params });
      if (sql.startsWith('SELECT * FROM po_contents')) return [[]];
      if (sql.startsWith('SELECT id FROM po_contents')) return [[byExternalId[params[1]] || null].filter(Boolean)];
      if (sql.startsWith('INSERT INTO po_contents')) return { affectedRows: 1 };
      return { affectedRows: 1 };
    },
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}
  };
  repo.pool = { async getConnection() { return conn; }, async query() { return [[]]; } };
  await repo.upsertContentPage({
    account: { id: 'a1', game_id: 'g1', community_id: 'community-1', source_id: 's1' },
    syncScope: 'comments',
    rootPlatformContentId: 'post1',
    items: [{ externalId: 'reply1', rootPlatformContentId: 'post1', platformParentId: 'comment1', contentDepth: 2, body: 'nested' }]
  });
  const insert = executed.find(call => call.sql.startsWith('INSERT INTO po_contents'));
  assert.equal(insert.params[8], 'post-db');
  assert.equal(insert.params[9], 'comment-db');
  assert.equal(insert.params[10], 'comment1');
  assert.equal(insert.params[11], 2);
  assert.equal(insert.params.length, 22);
  assert.match(insert.sql, /VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,NOW\(\),NOW\(\)\)/);
});
test('upsertContentPage updates content type when an existing external ID is reclassified', async () => {
  const executed = [];
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  let contentRead = 0;
  const conn = {
    async query(sql, params = []) {
      executed.push({ sql, params });
      if (sql.startsWith('SELECT * FROM po_contents')) {
        contentRead += 1;
        return contentRead === 1
          ? [[{ id: 'content-1', external_id: '909853', content_type: 'comment', content_depth: 0, body: '签到', published_at: '2026-08-19 02:30:57', source_url: '', engagement: '{}', fingerprint: 'old' }]]
          : [[{ id: 'content-1', external_id: '909853', content_type: 'post' }]];
      }
      return { affectedRows: 1 };
    },
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}
  };
  repo.pool = { async getConnection() { return conn; }, async query() { return [[]]; } };

  const result = await repo.upsertContentPage({
    account: { id: 'a1', game_id: 'g1', source_id: 's1' },
    syncScope: 'posts',
    items: [{ externalId: '909853', contentType: 'post', contentDepth: 0, body: '签到', publishedAt: '2026-08-19T02:30:57Z', fingerprint: 'new' }]
  });

  const write = executed.find(call => call.sql.startsWith('INSERT INTO po_contents'));
  assert.match(write.sql, /content_type=VALUES\(content_type\)/);
  assert.equal(result.contents[0].change, 'changed');
});

function contentIntegrityHarness() {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  let row = null;
  const conn = {
    async query(sql, params = []) {
      if (sql.startsWith('SELECT * FROM po_contents')) return row ? [[{ ...row }]] : [[]];
      if (sql.startsWith('INSERT INTO po_contents')) {
        row = {
          id: row?.id || params[0],
          game_id: params[1],
          source_id: params[2],
          account_id: params[3],
          external_id: params[4],
          content_type: params[5],
          platform_author_id: params[6],
          root_content_id: params[7],
          parent_content_id: params[8],
          platform_parent_id: params[9],
          content_depth: params[10],
          is_deleted: params[11],
          author_name: params[12],
          title: params[13],
          body: params[14],
          media: JSON.parse(params[15]),
          published_at: params[16],
          source_url: params[17],
          engagement: JSON.parse(params[18]),
          fingerprint: params[19],
          raw_payload: params[20] == null ? null : JSON.parse(params[20])
        };
        return { affectedRows: 1 };
      }
      return { affectedRows: 1 };
    },
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}
  };
  repo.pool = { async getConnection() { return conn; } };
  return { repo, stored: () => row };
}

test('upsertContentPage does not downgrade detail-enriched content when a later detail request falls back', async () => {
  const { repo, stored } = contentIntegrityHarness();
  const account = { id: 'account-1', game_id: 'game-1', source_id: 'source-1' };
  const enrichedPayload = {
    id: 916457,
    content: [{ type: 0, data: '完整正文' }, { type: 1, data: 'https://opsoss.q1.com/posts/916457/full.jpg' }],
    _contentIntegrity: { status: 'detail_enriched' }
  };

  await repo.upsertContentPage({
    account,
    syncScope: 'posts',
    items: [{
      externalId: '916457', contentType: 'post', title: '帖子标题', body: '完整正文',
      media: ['https://opsoss.q1.com/posts/916457/full.jpg'], engagement: { views: 10 }, rawPayload: enrichedPayload
    }]
  });
  const fallback = await repo.upsertContentPage({
    account,
    syncScope: 'posts',
    items: [{
      externalId: '916457', contentType: 'post', title: '帖子标题', body: '列表摘要',
      media: ['https://opsoss.q1.com/posts/916457/summary.jpg'], engagement: { views: 11 },
      rawPayload: { id: 916457, content: [{ type: 0, data: '列表摘要' }], _contentIntegrity: { status: 'summary_fallback', code: 'DETAIL_FETCH_FAILED' } }
    }]
  });

  assert.equal(stored().body, '完整正文');
  assert.deepEqual(stored().media, ['https://opsoss.q1.com/posts/916457/full.jpg']);
  assert.deepEqual(stored().raw_payload, enrichedPayload);
  assert.deepEqual(stored().engagement, { views: 11 });
  assert.equal(fallback.contents[0].change, 'changed');
});

test('upsertContentPage allows a later detail-enriched payload to replace an earlier enriched version', async () => {
  const { repo, stored } = contentIntegrityHarness();
  const account = { id: 'account-1', game_id: 'game-1', source_id: 'source-1' };
  const firstPayload = { id: 916457, content: [{ type: 0, data: '完整正文 v1' }], _contentIntegrity: { status: 'detail_enriched' } };
  const secondPayload = { id: 916457, content: [{ type: 0, data: '完整正文 v2' }], _contentIntegrity: { status: 'detail_enriched' } };

  await repo.upsertContentPage({
    account,
    syncScope: 'posts',
    items: [{ externalId: '916457', contentType: 'post', body: '完整正文 v1', media: ['v1.jpg'], engagement: { views: 10 }, rawPayload: firstPayload }]
  });
  const updated = await repo.upsertContentPage({
    account,
    syncScope: 'posts',
    items: [{ externalId: '916457', contentType: 'post', body: '完整正文 v2', media: ['v2.jpg'], engagement: { views: 12 }, rawPayload: secondPayload }]
  });

  assert.equal(stored().body, '完整正文 v2');
  assert.deepEqual(stored().media, ['v2.jpg']);
  assert.deepEqual(stored().raw_payload, secondPayload);
  assert.deepEqual(stored().engagement, { views: 12 });
  assert.equal(updated.contents[0].change, 'changed');
});

test('importContentBatch commits comments one depth at a time', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  repo.query = async sql => sql.startsWith('SELECT * FROM po_sources')
    ? [{ id: 's1', game_id: 'g1', platform: 'q1', enabled: 1 }]
    : [];
  repo.getAccount = async () => ({ id: 'a1', source_id: 's1', game_id: 'g1' });
  const calls = [];
  repo.upsertContentPage = async input => {
    calls.push(input);
    return { contents: input.items.map(item => ({ change: 'unchanged', content: item })) };
  };

  const result = await repo.importContentBatch({
    sourceId: 's1',
    accountId: 'a1',
    items: [
      { externalId: 'reply-2', contentType: 'comment', contentDepth: 2, platformParentId: 'comment-1' },
      { externalId: 'post-1', contentType: 'post', contentDepth: 0 },
      { externalId: 'comment-1', contentType: 'comment', contentDepth: 1 },
      { externalId: 'reply-3', contentType: 'comment', contentDepth: 3, platformParentId: 'reply-2' }
    ]
  });

  assert.deepEqual(calls.map(call => call.items.map(item => item.externalId)), [
    ['post-1'],
    ['comment-1'],
    ['reply-2'],
    ['reply-3']
  ]);
  assert.deepEqual(calls.map(call => call.syncScope), ['posts', 'comments', 'comments', 'comments']);
  assert.equal(result.batches, 4);
  assert.equal(result.unchanged, 4);
});

test('upsertContentPage retries a rolled-back deadlock without duplicating returned counters', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects', SYNC_UPSERT_MAX_RETRIES: 3, SYNC_UPSERT_RETRY_BASE_MS: 0 });
  let connectionCount = 0; let rollbackCount = 0; let releaseCount = 0;
  const makeConnection = shouldDeadlock => {
    let contentReads = 0;
    return {
      async query(sql) {
        if (sql.startsWith('SELECT * FROM po_contents')) {
          contentReads += 1;
          return contentReads === 1 ? [[]] : [[{ id: 'content-1', external_id: 'post-1' }]];
        }
        return { affectedRows: 1 };
      },
      async beginTransaction() {},
      async commit() {
        if (shouldDeadlock) { const error = new Error('deadlock'); error.code = 'ER_LOCK_DEADLOCK'; throw error; }
      },
      async rollback() { rollbackCount += 1; },
      release() { releaseCount += 1; }
    };
  };
  repo.pool = { async getConnection() { connectionCount += 1; return makeConnection(connectionCount === 1); } };

  const result = await repo.upsertContentPage({
    account: { id: 'account-1', game_id: 'game-1', source_id: 'source-1' },
    syncScope: 'posts',
    items: [{ externalId: 'post-1', title: 'title', body: 'body' }]
  });

  assert.equal(connectionCount, 2);
  assert.equal(rollbackCount, 1);
  assert.equal(releaseCount, 2);
  assert.equal(result.storedCount, 1);
  assert.equal(result.contents.length, 1);
});

test('upsertContentPage locks content in stable external-id order while preserving result order', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const insertedExternalIds = [];
  const conn = {
    async query(sql, params = []) {
      if (sql.startsWith('SELECT * FROM po_contents')) {
        const externalId = params[1];
        return insertedExternalIds.includes(externalId) ? [[{ id: `content-${externalId}`, external_id: externalId }]] : [[]];
      }
      if (sql.startsWith('INSERT INTO po_contents')) insertedExternalIds.push(params[4]);
      return { affectedRows: 1 };
    },
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}
  };
  repo.pool = { async getConnection() { return conn; } };

  const result = await repo.upsertContentPage({
    account: { id: 'account-1', game_id: 'game-1', source_id: 'source-1' },
    syncScope: 'posts',
    items: [{ externalId: 'post-b' }, { externalId: 'post-a' }]
  });

  assert.deepEqual(insertedExternalIds, ['post-a', 'post-b']);
  assert.deepEqual(result.contents.map(entry => entry.content.id), ['content-post-b', 'content-post-a']);
});

test('upsertContentPage does not retry non-lock transaction errors', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects', SYNC_UPSERT_MAX_RETRIES: 4, SYNC_UPSERT_RETRY_BASE_MS: 0 });
  let attempts = 0;
  repo._upsertContentPageAttempt = async () => { attempts += 1; const error = new Error('lease lost'); error.code = 'SYNC_RUN_LEASE_LOST'; throw error; };

  await assert.rejects(() => repo.upsertContentPage({}), error => error.code === 'SYNC_RUN_LEASE_LOST');
  assert.equal(attempts, 1);
});

test('upsertContentPage surfaces lock errors after the configured attempt limit', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects', SYNC_UPSERT_MAX_RETRIES: 3, SYNC_UPSERT_RETRY_BASE_MS: 0 });
  let attempts = 0;
  repo._upsertContentPageAttempt = async () => { attempts += 1; const error = new Error('lock wait timeout'); error.code = 'ER_LOCK_WAIT_TIMEOUT'; throw error; };

  await assert.rejects(() => repo.upsertContentPage({}), error => error.code === 'ER_LOCK_WAIT_TIMEOUT');
  assert.equal(attempts, 3);
});


test('createSourceWithAccount 在同一事务创建源与默认账号', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  const conn = {
    async query(sql, params) { executed.push({ sql, params }); return [{ affectedRows: 1 }]; },
    async beginTransaction() { executed.push({ sql: 'BEGIN' }); }, async commit() { executed.push({ sql: 'COMMIT' }); }, async rollback() { executed.push({ sql: 'ROLLBACK' }); }, release() {}
  };
  repo.pool = { async getConnection() { return conn; }, async query(sql) { if (sql.includes('FROM po_sources')) return [[{ id: 's1' }]]; if (sql.includes('FROM po_accounts')) return [[{ id: 'a1' }]]; return [[]]; } };
  const result = await repo.createSourceWithAccount({ gameId: 'g1', platform: 'douyin', displayName: '官方号', repliesApiUrl: 'https://legacy.example/replies', frequencySeconds: 1800, metadata: { syncMode: 'incremental' } });
  assert.equal(result.source.id, 's1'); assert.equal(result.account.id, 'a1');
  const sourceInsert = executed.find(call => call.sql.startsWith('INSERT INTO po_sources'));
  assert.ok(sourceInsert);
  assert.ok(!JSON.parse(sourceInsert.params[7]).repliesApiUrl, '新源不得创建 replies 配置');
  const accountInsert = executed.find(call => call.sql.startsWith('INSERT INTO po_accounts'));
  assert.match(accountInsert.params[4], /^pending:/);
  assert.ok(!executed.some(call => call.sql.startsWith('UPDATE po_sources SET default_account_id=')), '旧 schema 不写新字段');
  assert.ok(!executed.some(call => call.sql.startsWith('INSERT INTO po_source_schedule_state')), '旧 schema 不写调度表');
  assert.equal(executed.at(-1).sql, 'COMMIT');
});

test('createSourceWithAccount 在 migration 023 后原子回写默认账号和调度状态', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  const conn = {
    async query(sql, params = []) {
      executed.push({ sql, params });
      if (sql.includes('unified_scheduler_ready')) return [[{ unified_scheduler_ready: 1 }]];
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { executed.push({ sql: 'BEGIN' }); }, async commit() { executed.push({ sql: 'COMMIT' }); }, async rollback() { executed.push({ sql: 'ROLLBACK' }); }, release() {}
  };
  repo.pool = { async getConnection() { return conn; }, async query(sql) { if (sql.includes('FROM po_sources')) return [[{ id: 's-new' }]]; if (sql.includes('FROM po_accounts')) return [[{ id: 'a-new' }]]; return [[]]; } };
  await repo.createSourceWithAccount({ sourceId: 's-new', accountId: 'a-new', gameId: 'g1', communityId: 'c1', platform: 'bigplayer_h5', displayName: 'BigPlayer' });
  const defaultAccount = executed.find(call => call.sql.startsWith('UPDATE po_sources SET default_account_id='));
  assert.deepEqual(defaultAccount.params, ['a-new', 's-new']);
  const scheduleState = executed.find(call => call.sql.startsWith('INSERT INTO po_source_schedule_state'));
  assert.deepEqual(scheduleState.params, ['s-new']);
  assert.ok(executed.findIndex(call => call.sql.startsWith('INSERT INTO po_accounts')) < executed.findIndex(call => call.sql.startsWith('UPDATE po_sources SET default_account_id=')));
  assert.equal(executed.at(-1).sql, 'COMMIT');
});

test('createSourceWithAccount 账号插入失败时回滚源创建', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  const conn = {
    async query(sql) { executed.push({ sql }); if (sql.startsWith('INSERT INTO po_accounts')) throw new Error('account insert failed'); return [{ affectedRows: 1 }]; },
    async beginTransaction() { executed.push({ sql: 'BEGIN' }); }, async commit() { executed.push({ sql: 'COMMIT' }); }, async rollback() { executed.push({ sql: 'ROLLBACK' }); }, release() {}
  };
  repo.pool = { async getConnection() { return conn; } };
  await assert.rejects(() => repo.createSourceWithAccount({ gameId: 'g1', platform: 'douyin', displayName: '官方号', frequencySeconds: 1800 }), /account insert failed/);
  assert.ok(executed.some(call => call.sql === 'ROLLBACK'));
  assert.ok(!executed.some(call => call.sql === 'COMMIT'));
});

test('updateSourceConfiguration rolls back source and credential writes together', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  const conn = {
    async query(sql) { executed.push({ sql }); if (sql.startsWith('INSERT INTO po_credentials')) throw new Error('credential write failed'); if (sql.startsWith('SELECT * FROM po_sources')) return [[{ id: 's1', config: '{}' }]]; if (sql.startsWith('SELECT * FROM po_accounts')) return [[{ id: 'a1', metadata: '{}' }]]; return { affectedRows: 1 }; },
    async beginTransaction() { executed.push({ sql: 'BEGIN' }); }, async commit() { executed.push({ sql: 'COMMIT' }); }, async rollback() { executed.push({ sql: 'ROLLBACK' }); }, release() {}
  };
  repo.pool = { async getConnection() { return conn; } };
  repo.query = async sql => sql.includes('FROM po_sources') ? [{ id: 's1' }] : [];
  repo.listAccounts = async () => [{ id: 'a1' }];
  await assert.rejects(() => repo.updateSourceConfiguration('s1', { displayName: '新', baseUrl: 'https://x', frequencySeconds: 60, syncMode: 'incremental', enabled: false, credential: { credentialType: 'api_token' }, credentialCipher: 'ENC' }), /credential write failed/);
  assert.ok(executed.some(call => call.sql === 'ROLLBACK'));
  assert.ok(!executed.some(call => call.sql === 'COMMIT'));
});
test('replaceKeywordRules 出错回滚事务', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  const conn = {
    async query(sql) { if (sql.startsWith('INSERT')) throw new Error('insert boom'); executed.push({ sql }); return [{ affectedRows: 1 }]; },
    async beginTransaction() { executed.push({ sql: 'BEGIN' }); },
    async commit() { executed.push({ sql: 'COMMIT' }); },
    async rollback() { executed.push({ sql: 'ROLLBACK' }); },
    release() {}
  };
  repo.pool = { async getConnection() { return conn; }, async end() {} };
  await assert.rejects(() => repo.replaceKeywordRules('g1', [{ keyword: 'x' }]), /insert boom/);
  assert.ok(executed.some(c => c.sql === 'ROLLBACK'));
  assert.ok(!executed.some(c => c.sql === 'COMMIT'));
});


test('listKeywordRulesRaw 按游戏拉全量原始规则', async () => {
  const repo = stubRepo(() => [{ id: 'r1', keyword: '崩溃' }]);
  const rules = await repo.listKeywordRulesRaw('g1');
  assert.equal(rules[0].keyword, '崩溃');
  assert.match(repo.calls[0].sql, /FROM po_keyword_rules WHERE game_id=\?/);
  assert.deepEqual(repo.calls[0].params, ['g1']);
});

// ── 实时同步运行与明细 ──

test('checkpoint identity includes task kind and task key', async () => {
  const repo = stubRepo((sql) => sql.startsWith('SELECT * FROM po_sync_checkpoints') ? [{ id: 'cp1', status: 'running', lease_owner: 'worker-1' }] : { affectedRows: 1 });
  await repo.claimSyncCheckpoint({ accountId: 'a1', taskKind: 'source_sync', taskKey: 'run-1', syncScope: 'posts', leaseOwner: 'worker-1' });
  assert.match(repo.calls[0].sql, /task_kind, task_key/);
  assert.deepEqual(repo.calls[0].params.slice(1, 4), ['a1', 'source_sync', 'run-1']);
  assert.match(repo.calls[1].sql, /task_kind=\? AND task_key=\?/);
  assert.deepEqual(repo.calls[1].params.slice(3, 6), ['a1', 'source_sync', 'run-1']);
});

function manualSyncHarness(overrides = {}) {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  const source = { id: 's1', game_id: 'g1', community_id: 'c1', platform: 'bigplayer_h5', enabled: 1, auth_status: 'authorized', source_auth_expired: 0, admission_anchor: '2026-09-11 08:30:00.000', default_account_id: 'a1', game_enabled: 1, community_status: 'enabled', ...(overrides.source || {}) };
  const account = { id: 'a1', source_id: 's1', game_id: 'g1', community_id: 'c1', platform: 'bigplayer_h5', enabled: 1, auth_status: 'authorized', account_auth_expired: 0, ...(overrides.account || {}) };
  const credential = { id: 'credential-1', status: 'active', credential_expired: 0, has_secret_cipher: 1, ...(overrides.credential || {}) };
  const schema = { migration_table_ready: 1, default_account_ready: 1, source_schedule_columns_ready: 1, checkpoint_window_columns_ready: 1, checkpoint_window_index_ready: 1, run_source_ready: 1, run_trigger_ready: 1, run_schedule_column_ready: 1, run_window_columns_ready: 1, run_slot_ready: 1, run_trigger_constraint_ready: 1, run_source_fk_ready: 1, schedule_state_ready: 1, schedule_state_columns_ready: 1, schedule_state_fk_ready: 1, ...(overrides.schema || {}) };
  const conn = {
    async query(sql, params = []) {
      executed.push({ sql, params });
      if (overrides.schemaError && sql.includes('information_schema')) throw overrides.schemaError;
      if (sql.includes('information_schema')) return [[schema]];
      if (sql === 'SHOW CREATE TABLE po_sync_runs') return [[{ 'Create Table': overrides.checkDdl || "CREATE TABLE po_sync_runs (CONSTRAINT po_sync_runs_trigger_slot_chk CHECK ((trigger_type IN ('legacy','manual') AND scheduled_at IS NULL) OR (trigger_type IN ('scheduled','scheduled_catchup') AND scheduled_at IS NOT NULL)))" }]];
      if (sql.startsWith('SELECT version FROM po_schema_migrations')) return [overrides.migrationMissing ? [] : [{ version: '023_unified_source_scheduling.sql' }]];
      if (sql.includes('FROM po_sources s LEFT JOIN')) return [[source]];
      if (sql.includes('FROM po_accounts a WHERE a.id=')) return [[overrides.accountMissing ? undefined : account].filter(Boolean)];
      if (sql.includes('FROM po_credentials WHERE source_id=')) return [[overrides.credentialMissing ? undefined : credential].filter(Boolean)];
      if (sql.startsWith('SELECT source_id, lease_owner')) return [[overrides.scheduleMissing ? undefined : { source_id: 's1', lease_active: overrides.leaseActive ? 1 : 0 }].filter(Boolean)];
      if (sql.startsWith('SELECT * FROM po_sync_runs WHERE source_id=')) return [[overrides.manualRun].filter(Boolean)];
      if (sql.startsWith('SELECT id FROM po_sync_runs WHERE source_id=')) return [[overrides.activeRun || overrides.manualRun].filter(Boolean)];
      if (sql.startsWith('SELECT cp.id FROM po_sync_checkpoints')) return [[overrides.activeCheckpoint].filter(Boolean)];
      if (sql.startsWith('SELECT * FROM po_sync_runs WHERE id=')) return [[{ id: params[0], source_id: 's1', account_id: 'a1', trigger_type: 'manual', status: 'queued', sync_mode: params[0] ? (overrides.createdMode || 'incremental') : 'incremental' }]];
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { executed.push({ sql: 'BEGIN', params: [] }); },
    async commit() { executed.push({ sql: 'COMMIT', params: [] }); },
    async rollback() { executed.push({ sql: 'ROLLBACK', params: [] }); },
    release() { executed.push({ sql: 'RELEASE', params: [] }); }
  };
  repo.pool = { async getConnection() { return conn; } };
  return { repo, executed };
}

test('createSyncRun accepts only queued legacy work and delegates to the locked enqueue boundary', async () => {
  const repo = stubRepo(() => ({ affectedRows: 1 }));
  const delegated = [];
  repo.enqueueSyncRun = async input => { delegated.push(input); return { id: 'run-1', trigger_type: 'legacy' }; };
  await assert.rejects(() => repo.createSyncRun({ accountId: 'a1', triggerType: 'legacy' }), error => error.code === 'INVALID_INPUT');
  await assert.rejects(() => repo.createSyncRun({ sourceId: 's1', accountId: 'a1', triggerType: 'scheduled' }), error => error.code === 'INVALID_INPUT');
  await assert.rejects(() => repo.createSyncRun({ sourceId: 's1', accountId: 'a1', triggerType: 'manual' }), error => error.code === 'INVALID_INPUT');
  await assert.rejects(() => repo.createSyncRun({ sourceId: 's1', accountId: 'a1', triggerType: 'legacy', status: 'running' }), error => error.code === 'INVALID_INPUT');
  const run = await repo.createSyncRun({ sourceId: 's1', accountId: 'a1', syncMode: 'incremental', status: 'queued', triggerType: 'legacy' });
  assert.equal(run.id, 'run-1');
  assert.deepEqual(delegated, [{ sourceId: 's1', accountId: 'a1', syncMode: 'incremental' }]);
  assert.equal(repo.calls.length, 0, 'createSyncRun 不得直接写 po_sync_runs');
});

test('enqueueSyncRun locks the source and active runs before one legacy insert', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  let activeRun = null;
  let leaseActive = false;
  const conn = {
    async query(sql, params = []) {
      executed.push({ sql, params });
      if (sql.startsWith('SELECT id FROM po_sources')) return [[{ id: 's1' }]];
      if (sql.includes("table_name='po_source_schedule_state'")) return [[{ scheduler_state_ready: 1 }]];
      if (sql.startsWith('SELECT source_id, lease_until')) return [[{ source_id: 's1', lease_active: leaseActive ? 1 : 0 }]];
      if (sql.startsWith('SELECT id FROM po_accounts')) return [[{ id: 'a1' }]];
      if (sql.startsWith('SELECT * FROM po_sync_runs WHERE source_id=')) return [[activeRun].filter(Boolean)];
      if (sql.startsWith('SELECT * FROM po_sync_runs WHERE id=')) return [[{ id: params[0], source_id: 's1', account_id: 'a1', trigger_type: 'legacy', status: 'queued' }]];
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { executed.push({ sql: 'BEGIN' }); }, async commit() { executed.push({ sql: 'COMMIT' }); }, async rollback() { executed.push({ sql: 'ROLLBACK' }); }, release() {}
  };
  repo.pool = { async getConnection() { return conn; } };
  const run = await repo.enqueueSyncRun({ sourceId: 's1', accountId: 'a1' });
  assert.equal(run.trigger_type, 'legacy');
  assert.match(executed.find(call => call.sql.startsWith('SELECT id FROM po_sources')).sql, /FOR UPDATE/);
  assert.match(executed.find(call => call.sql.startsWith('SELECT \* FROM po_sync_runs WHERE source_id=')).sql, /FOR UPDATE/);
  const insert = executed.find(call => call.sql.startsWith('INSERT INTO po_sync_runs'));
  assert.deepEqual(insert.params.slice(1, 4), ['s1', 'a1', 'incremental']);
  assert.equal(executed.at(-1).sql, 'COMMIT');

  activeRun = { id: 'run-existing', source_id: 's1', account_id: 'a1', trigger_type: 'manual', status: 'queued' };
  executed.length = 0;
  const reused = await repo.enqueueSyncRun({ sourceId: 's1', accountId: 'a1' });
  assert.equal(reused.id, 'run-existing');
  assert.ok(!executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')));
  assert.equal(executed.at(-1).sql, 'COMMIT');

  activeRun = null; leaseActive = true; executed.length = 0;
  await assert.rejects(() => repo.enqueueSyncRun({ sourceId: 's1', accountId: 'a1' }), error => error.code === 'SOURCE_SCHEDULE_LEASE_ACTIVE');
  const scheduleLock = executed.find(call => call.sql.startsWith('SELECT source_id, lease_until'));
  assert.match(scheduleLock.sql, /lease_until>UTC_TIMESTAMP\(3\)/);
  assert.match(scheduleLock.sql, /FOR UPDATE/);
  assert.ok(!executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')));
  assert.ok(executed.some(call => call.sql === 'ROLLBACK'));
});

test('enqueueSyncRun preserves the pre-023 legacy insert when scheduler state table is absent', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  const conn = {
    async query(sql, params = []) {
      executed.push({ sql, params });
      if (sql.startsWith('SELECT id FROM po_sources')) return [[{ id: 's1' }]];
      if (sql.includes("table_name='po_source_schedule_state'")) return [[{ scheduler_state_ready: 0 }]];
      if (sql.startsWith('SELECT id FROM po_accounts')) return [[{ id: 'a1' }]];
      if (sql.startsWith('SELECT r.* FROM po_sync_runs')) return [[]];
      if (sql.startsWith('SELECT * FROM po_sync_runs WHERE id=')) return [[{ id: params[0], account_id: 'a1', status: 'queued' }]];
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}
  };
  repo.pool = { async getConnection() { return conn; } };
  await repo.enqueueSyncRun({ sourceId: 's1', accountId: 'a1' });
  const insert = executed.find(call => call.sql.startsWith('INSERT INTO po_sync_runs'));
  assert.match(insert.sql, /^INSERT INTO po_sync_runs \(id, account_id, status, sync_mode, started_at\)/);
  assert.doesNotMatch(insert.sql, /source_id|trigger_type/);
  assert.ok(!executed.some(call => call.sql.startsWith('SELECT source_id, lease_until')));
});

test('startSourceSync locks the source/default account and creates exactly one queued manual run', async () => {
  const { repo, executed } = manualSyncHarness();
  const result = await repo.startSourceSync({ sourceId: 's1', syncMode: 'incremental', metadata: { crawlScope: 'incremental' } });
  assert.equal(result.reused, false);
  assert.equal(result.run.trigger_type, 'manual');
  const sourceLock = executed.find(call => call.sql.includes('FROM po_sources s LEFT JOIN'));
  assert.match(sourceLock.sql, /FOR UPDATE/);
  const schemaCheck = executed.find(call => call.sql.includes('information_schema'));
  assert.match(schemaCheck.sql, /columns_list='source_id,scheduled_at'/);
  assert.match(schemaCheck.sql, /po_sync_runs_trigger_slot_chk/);
  assert.match(schemaCheck.sql, /po_sync_runs_source_fk/);
  const accountLock = executed.find(call => call.sql.includes('FROM po_accounts a WHERE a.id='));
  assert.deepEqual(accountLock.params, ['a1']);
  const metadataUpdate = executed.find(call => call.sql.startsWith('UPDATE po_accounts SET metadata='));
  assert.match(metadataUpdate.sql, /JSON_MERGE_PATCH/);
  const insert = executed.find(call => call.sql.startsWith('INSERT INTO po_sync_runs'));
  assert.match(insert.sql, /source_id, account_id, trigger_type, status, sync_mode/);
  assert.deepEqual(insert.params.slice(1, 4), ['s1', 'a1', 'incremental']);
  assert.ok(!executed.some(call => /UPDATE po_sources SET enabled=1|collect_requested_at=NOW/.test(call.sql)));
  assert.equal(executed.at(-2).sql, 'COMMIT');
});

test('startBoundedSourceBackfill stores one exact UTC window without mutating account metadata or checkpoints', async () => {
  const { repo, executed } = manualSyncHarness({ createdMode: 'backfill' });
  const result = await repo.startBoundedSourceBackfill({
    sourceId: 's1',
    publishedFrom: '2026-09-04T08:30:00.000Z',
    publishedTo: '2026-09-11T08:30:00.000Z'
  });
  assert.equal(result.reused, false);
  const insert = executed.find(call => call.sql.startsWith('INSERT INTO po_sync_runs'));
  assert.match(insert.sql, /window_start, window_end/);
  assert.deepEqual(insert.params.slice(1), [
    's1', 'a1', 'backfill', '2026-09-04 08:30:00.000', '2026-09-11 08:30:00.000'
  ]);
  assert.ok(!executed.some(call => call.sql.startsWith('UPDATE po_accounts SET metadata=')));
  assert.ok(!executed.some(call => call.sql.startsWith('UPDATE po_sync_checkpoints')));
  assert.ok(!executed.some(call => /frequency_seconds/.test(call.sql)));
  const sourceLock = executed.find(call => call.sql.includes('FROM po_sources s LEFT JOIN'));
  assert.match(sourceLock.sql, /UTC_TIMESTAMP\(3\) AS admission_anchor/);
});

test('BigPlayer bounded backfill accepts a window shorter than seven days against the fixed database UTC anchor', async () => {
  const { repo, executed } = manualSyncHarness({ createdMode: 'backfill' });
  await repo.startBoundedSourceBackfill({
    sourceId: 's1',
    publishedFrom: '2026-09-10T08:30:00.000Z',
    publishedTo: '2026-09-11T08:30:00.000Z'
  });
  const insert = executed.find(call => call.sql.startsWith('INSERT INTO po_sync_runs'));
  assert.deepEqual(insert.params.slice(-2), ['2026-09-10 08:30:00.000', '2026-09-11 08:30:00.000']);
});

test('BigPlayer bounded backfill rejects historical and future windows without persistent writes', async () => {
  for (const [publishedFrom, publishedTo] of [
    ['2026-09-04T08:29:59.999Z', '2026-09-05T08:30:00.000Z'],
    ['2026-09-11T08:29:59.999Z', '2026-09-11T08:30:00.001Z']
  ]) {
    const { repo, executed } = manualSyncHarness({ createdMode: 'backfill' });
    await assert.rejects(
      () => repo.startBoundedSourceBackfill({ sourceId: 's1', publishedFrom, publishedTo }),
      error => error.code === 'INVALID_INPUT'
    );
    assert.match(executed.find(call => call.sql.includes('FROM po_sources s LEFT JOIN')).sql, /UTC_TIMESTAMP\(3\) AS admission_anchor/);
    assert.ok(!executed.some(call => /^(INSERT|UPDATE|DELETE)\b/.test(call.sql)), 'rejected window must not persist run, metadata, checkpoint, or schedule changes');
    assert.ok(!executed.some(call => /frequency_seconds/.test(call.sql)));
    assert.ok(executed.some(call => call.sql === 'ROLLBACK'));
    assert.ok(!executed.some(call => call.sql === 'COMMIT'));
  }
});

test('startRecentSourceBackfill derives and persists one exact seven-day window from the transaction DB anchor', async () => {
  const { repo, executed } = manualSyncHarness({ createdMode: 'backfill' });
  const result = await repo.startRecentSourceBackfill({ sourceId: 's1', lookbackDays: 7 });
  const insert = executed.find(call => call.sql.startsWith('INSERT INTO po_sync_runs'));
  assert.deepEqual(insert.params.slice(-2), ['2026-09-04 08:30:00.000', '2026-09-11 08:30:00.000']);
  assert.deepEqual(result.window, { publishedFrom: '2026-09-04T08:30:00.000Z', publishedTo: '2026-09-11T08:30:00.000Z' });
  assert.equal(Date.parse(result.window.publishedTo) - Date.parse(result.window.publishedFrom), 7 * 24 * 60 * 60 * 1000);
  assert.match(executed.find(call => call.sql.includes('FROM po_sources s LEFT JOIN')).sql, /UTC_TIMESTAMP\(3\) AS admission_anchor/);
});

test('startRecentSourceBackfill reuses the active run persisted window instead of recomputing it', async () => {
  const existing = {
    id: 'run-existing', source_id: 's1', account_id: 'a1', trigger_type: 'manual', status: 'running', sync_mode: 'backfill',
    window_start: '2026-09-04 08:29:59.000', window_end: '2026-09-11 08:29:59.000'
  };
  const { repo, executed } = manualSyncHarness({ manualRun: existing, source: { admission_anchor: '2026-09-11 08:30:00.000' } });
  const result = await repo.startRecentSourceBackfill({ sourceId: 's1', lookbackDays: 7 });
  assert.equal(result.reused, true);
  assert.equal(result.run.id, existing.id);
  assert.deepEqual(result.window, { publishedFrom: '2026-09-04T08:29:59.000Z', publishedTo: '2026-09-11T08:29:59.000Z' });
  assert.ok(!executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')));
  assert.match(executed.find(call => call.sql.startsWith('SELECT * FROM po_sync_runs WHERE source_id=')).sql, /window_start IS NOT NULL AND window_end IS NOT NULL/);
});

test('startRecentSourceBackfill does not reuse an active bounded window shorter than seven days', async () => {
  const existing = {
    id: 'run-existing-short', source_id: 's1', account_id: 'a1', trigger_type: 'manual', status: 'running', sync_mode: 'backfill',
    window_start: '2026-09-10 08:30:00.000', window_end: '2026-09-11 08:30:00.000'
  };
  const { repo, executed } = manualSyncHarness({ manualRun: existing });
  await assert.rejects(
    () => repo.startRecentSourceBackfill({ sourceId: 's1', lookbackDays: 7 }),
    error => error.code === 'PREVIOUS_RUN_ACTIVE'
  );
  const reuseLookup = executed.find(call => call.sql.startsWith('SELECT * FROM po_sync_runs WHERE source_id='));
  assert.match(reuseLookup.sql, /TIMESTAMPDIFF\(MICROSECOND,window_start,window_end\)=\?/);
  assert.equal(reuseLookup.params.at(-1), 7 * 24 * 60 * 60 * 1000 * 1000);
  assert.ok(!executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')));
});

test('startRecentSourceBackfill accepts only lookbackDays 7 for BigPlayer', async () => {
  for (const lookbackDays of [1, 6, 8, 'bad']) {
    const { repo, executed } = manualSyncHarness({ createdMode: 'backfill' });
    await assert.rejects(() => repo.startRecentSourceBackfill({ sourceId: 's1', lookbackDays }), error => error.code === 'INVALID_INPUT');
    assert.equal(executed.length, 0);
  }
  const { repo, executed } = manualSyncHarness({ source: { platform: 'douyin' } });
  await assert.rejects(() => repo.startRecentSourceBackfill({ sourceId: 's1', lookbackDays: 7 }), error => error.code === 'INVALID_INPUT');
  assert.ok(!executed.some(call => /^(INSERT|UPDATE|DELETE)\b/.test(call.sql)));
});

test('validateBoundedSourceBackfillWindow uses DB UTC and returns the normalized fixed window', async () => {
  const repo = stubRepo(() => [{ id: 's1', platform: 'bigplayer_h5', admission_anchor: '2026-09-11 08:30:00.000' }]);
  const window = await repo.validateBoundedSourceBackfillWindow({ sourceId: 's1', publishedFrom: '2026-09-10T08:30:00Z', publishedTo: '2026-09-11T08:30:00Z' });
  assert.deepEqual(window, { publishedFrom: '2026-09-10T08:30:00.000Z', publishedTo: '2026-09-11T08:30:00.000Z' });
  assert.match(repo.calls[0].sql, /UTC_TIMESTAMP\(3\) AS admission_anchor/);
});

test('requestCollect rejects legacy BigPlayer backfill atomically but keeps incremental and other platforms compatible', async () => {
  const run = async row => {
    const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
    const executed = [];
    const conn = {
      async query(sql, params = []) {
        executed.push({ sql, params });
        if (sql.includes('FROM po_sources s LEFT JOIN po_accounts')) return [[row]];
        return [{ affectedRows: 1 }];
      },
      async beginTransaction() { executed.push({ sql: 'BEGIN' }); },
      async commit() { executed.push({ sql: 'COMMIT' }); },
      async rollback() { executed.push({ sql: 'ROLLBACK' }); },
      release() {}
    };
    repo.pool = { async getConnection() { return conn; } };
    return { repo, executed };
  };
  for (const row of [
    { id: 's1', platform: 'bigplayer_h5', config: JSON.stringify({ syncMode: 'backfill', historyStart: '2026-01-01' }), account_metadata: '{}' },
    { id: 's1', platform: 'bigplayer_h5', config: '{}', account_metadata: JSON.stringify({ syncMode: 'backfill', historyStart: '2026-01-01' }) }
  ]) {
    const { repo, executed } = await run(row);
    await assert.rejects(() => repo.requestCollect('s1'), error => error.code === 'INVALID_INPUT');
    assert.ok(!executed.some(call => call.sql.startsWith('UPDATE po_sources')));
    assert.ok(executed.some(call => call.sql === 'ROLLBACK'));
  }
  for (const row of [
    { id: 's1', platform: 'bigplayer_h5', config: JSON.stringify({ syncMode: 'incremental', historyStart: null }), account_metadata: '{}' },
    { id: 's1', platform: 'douyin', config: JSON.stringify({ syncMode: 'backfill', historyStart: '2026-01-01' }), account_metadata: '{}' }
  ]) {
    const { repo, executed } = await run(row);
    await repo.requestCollect('s1');
    assert.ok(executed.some(call => call.sql.startsWith('UPDATE po_sources SET collect_requested_at=UTC_TIMESTAMP(3)')));
    assert.ok(executed.some(call => call.sql === 'COMMIT'));
  }
});

test('requestCollect checks the same newest enabled account used by source authorization', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  const conn = {
    async query(sql, params = []) {
      executed.push({ sql, params });
      if (sql.includes('FROM po_sources s LEFT JOIN po_accounts')) {
        const usesNewestEnabledAccount = /a\.enabled=1/.test(sql) && /ORDER BY a\.updated_at DESC, a\.id ASC LIMIT 1/.test(sql);
        return [[{
          id: 's1', platform: 'bigplayer_h5', config: '{}',
          account_metadata: usesNewestEnabledAccount ? JSON.stringify({ syncMode: 'backfill', historyStart: '2026-09-01' }) : null
        }]];
      }
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { executed.push({ sql: 'BEGIN' }); },
    async commit() { executed.push({ sql: 'COMMIT' }); },
    async rollback() { executed.push({ sql: 'ROLLBACK' }); },
    release() {}
  };
  repo.pool = { async getConnection() { return conn; } };

  await assert.rejects(() => repo.requestCollect('s1'), error => error.code === 'INVALID_INPUT');
  const selection = executed.find(call => call.sql.includes('FROM po_sources s LEFT JOIN po_accounts'));
  assert.match(selection.sql, /a\.enabled=1/);
  assert.match(selection.sql, /ORDER BY a\.updated_at DESC, a\.id ASC LIMIT 1/);
  assert.ok(!executed.some(call => call.sql.startsWith('UPDATE po_sources')));
  assert.ok(executed.some(call => call.sql === 'ROLLBACK'));
});

test('BigPlayer backfill fails closed without a complete UTC window and rejects windows over seven days', async () => {
  for (const input of [
    { sourceId: 's1', syncMode: 'backfill', metadata: { historyStart: '2026-09-04T08:30:00Z' } },
    { sourceId: 's1', publishedFrom: '2026-09-04T08:30:00.000Z' },
    { sourceId: 's1', publishedFrom: '2026-09-04T08:30:00+08:00', publishedTo: '2026-09-11T08:30:00.000Z' },
    { sourceId: 's1', publishedFrom: '2026-09-11T08:30:00.000Z', publishedTo: '2026-09-11T08:30:00.000Z' },
    { sourceId: 's1', publishedFrom: '2026-09-04T08:29:59.999Z', publishedTo: '2026-09-11T08:30:00.000Z' }
  ]) {
    const { repo, executed } = manualSyncHarness();
    const operation = Object.hasOwn(input, 'syncMode')
      ? () => repo.startSourceSync(input)
      : () => repo.startBoundedSourceBackfill(input);
    await assert.rejects(operation, error => error.code === 'INVALID_INPUT');
    assert.ok(!executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')));
    assert.ok(!executed.some(call => call.sql.startsWith('UPDATE po_sync_checkpoints')));
  }
});

test('bounded manual backfill reuses only the same active source window', async () => {
  const same = manualSyncHarness({ manualRun: { id: 'run-existing', source_id: 's1', account_id: 'a1', trigger_type: 'manual', status: 'running', sync_mode: 'backfill', window_start: '2026-09-04 08:30:00.000', window_end: '2026-09-11 08:30:00.000' } });
  const reused = await same.repo.startBoundedSourceBackfill({ sourceId: 's1', publishedFrom: '2026-09-04T08:30:00.000Z', publishedTo: '2026-09-11T08:30:00.000Z' });
  assert.equal(reused.reused, true);
  const sameWindowLookup = same.executed.find(call => call.sql.startsWith('SELECT * FROM po_sync_runs WHERE source_id='));
  assert.match(sameWindowLookup.sql, /window_start=\? AND window_end=\?/);
  assert.deepEqual(sameWindowLookup.params.slice(-2), ['2026-09-04 08:30:00.000', '2026-09-11 08:30:00.000']);
  assert.ok(!same.executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')));

  const different = manualSyncHarness({ activeRun: { id: 'run-other-window' } });
  await assert.rejects(
    () => different.repo.startBoundedSourceBackfill({ sourceId: 's1', publishedFrom: '2026-09-05T08:30:00.000Z', publishedTo: '2026-09-10T08:30:00.000Z' }),
    error => error.code === 'PREVIOUS_RUN_ACTIVE'
  );
  assert.ok(!different.executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')));
});

test('startSourceSync reuses only the same active manual source and mode without mutation', async () => {
  const manualRun = { id: 'run-existing', source_id: 's1', account_id: 'a1', trigger_type: 'manual', status: 'running', sync_mode: 'incremental' };
  const { repo, executed } = manualSyncHarness({ manualRun });
  const result = await repo.startSourceSync({ sourceId: 's1', syncMode: 'incremental', metadata: { changed: true } });
  assert.equal(result.reused, true);
  assert.equal(result.run.id, 'run-existing');
  assert.ok(!executed.some(call => /^(INSERT|UPDATE)/.test(call.sql)));
  assert.ok(executed.some(call => call.sql === 'COMMIT'));
});

test('manual sync rejects disabled or unauthorized source/default account without mutation', async () => {
  const cases = [
    [{ source: { enabled: 0 } }, 'SOURCE_DISABLED'],
    [{ source: { game_enabled: 0 } }, 'GAME_DISABLED'],
    [{ source: { community_status: 'disabled' } }, 'COMMUNITY_DISABLED'],
    [{ source: { auth_status: 'unconfigured' } }, 'SOURCE_UNAUTHORIZED'],
    [{ source: { source_auth_expired: 1 } }, 'SOURCE_AUTH_EXPIRED'],
    [{ source: { default_account_id: null } }, 'ACCOUNT_NOT_FOUND'],
    [{ account: { enabled: 0 } }, 'ACCOUNT_DISABLED'],
    [{ account: { auth_status: 'unconfigured' } }, 'ACCOUNT_UNAUTHORIZED'],
    [{ account: { account_auth_expired: 1 } }, 'ACCOUNT_AUTH_EXPIRED'],
    [{ account: { source_id: 'other' } }, 'OWNERSHIP_MISMATCH']
  ];
  for (const [overrides, code] of cases) {
    const { repo, executed } = manualSyncHarness(overrides);
    await assert.rejects(() => repo.startSourceSync({ sourceId: 's1' }), error => error.code === code, code);
    assert.ok(executed.some(call => call.sql === 'ROLLBACK'), code);
    assert.ok(!executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')), code);
    assert.ok(!executed.some(call => /UPDATE po_sources SET enabled=1/.test(call.sql)), code);
  }
});

test('BigPlayer manual sync locks and validates the account api_token credential', async () => {
  for (const [overrides, code] of [
    [{ credentialMissing: true }, 'CREDENTIAL_NOT_FOUND'],
    [{ credential: { status: 'unconfigured' } }, 'CREDENTIAL_INACTIVE'],
    [{ credential: { credential_expired: 1 } }, 'CREDENTIAL_EXPIRED'],
    [{ credential: { has_secret_cipher: 0 } }, 'CREDENTIAL_SECRET_MISSING']
  ]) {
    const { repo, executed } = manualSyncHarness(overrides);
    await assert.rejects(() => repo.startSourceSync({ sourceId: 's1' }), error => error.code === code, code);
    const credentialLock = executed.find(call => call.sql.includes('FROM po_credentials WHERE source_id='));
    assert.match(credentialLock.sql, /credential_type='api_token'/);
    assert.match(credentialLock.sql, /FOR UPDATE/);
    assert.match(credentialLock.sql, /AS has_secret_cipher/);
    assert.doesNotMatch(credentialLock.sql, /SELECT \*/i, '只查询密文存在性，不读取整行密文');
    assert.ok(!executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')));
  }
});

test('manual sync fails closed for old or unverifiable unified scheduler schema', async () => {
  for (const [overrides, code] of [
    [{ schema: { run_source_ready: 0 } }, 'UNIFIED_SCHEDULER_SCHEMA_NOT_READY'],
    [{ schema: { checkpoint_window_columns_ready: 0 } }, 'UNIFIED_SCHEDULER_SCHEMA_NOT_READY'],
    [{ schema: { checkpoint_window_index_ready: 0 } }, 'UNIFIED_SCHEDULER_SCHEMA_NOT_READY'],
    [{ schema: { run_window_columns_ready: 0 } }, 'UNIFIED_SCHEDULER_SCHEMA_NOT_READY'],
    [{ schema: { run_slot_ready: 0 } }, 'UNIFIED_SCHEDULER_SCHEMA_NOT_READY'],
    [{ schema: { run_trigger_constraint_ready: 0 } }, 'UNIFIED_SCHEDULER_SCHEMA_NOT_READY'],
    [{ schema: { run_source_fk_ready: 0 } }, 'UNIFIED_SCHEDULER_SCHEMA_NOT_READY'],
    [{ checkDdl: "CREATE TABLE po_sync_runs (CONSTRAINT po_sync_runs_trigger_slot_chk CHECK (trigger_type IN ('legacy','manual')))" }, 'UNIFIED_SCHEDULER_SCHEMA_NOT_READY'],
    [{ migrationMissing: true }, 'UNIFIED_SCHEDULER_SCHEMA_NOT_READY'],
    [{ schemaError: Object.assign(new Error('denied'), { code: 'ER_ACCESS_DENIED_ERROR' }) }, 'UNIFIED_SCHEDULER_SCHEMA_CHECK_FAILED']
  ]) {
    const { repo, executed } = manualSyncHarness(overrides);
    await assert.rejects(() => repo.startSourceSync({ sourceId: 's1' }), error => error.code === code, code);
    assert.ok(executed.some(call => call.sql === 'ROLLBACK'));
    assert.ok(!executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')));
  }
});

test('manual sync rejects competing run, checkpoint, and scheduler lease with stable codes', async () => {
  for (const [overrides, code] of [
    [{ activeRun: { id: 'run-other' } }, 'PREVIOUS_RUN_ACTIVE'],
    [{ activeCheckpoint: { id: 'cp-running' } }, 'SYNC_CHECKPOINT_ACTIVE'],
    [{ leaseActive: true }, 'SOURCE_SCHEDULE_LEASE_ACTIVE']
  ]) {
    const { repo, executed } = manualSyncHarness(overrides);
    await assert.rejects(() => repo.startSourceSync({ sourceId: 's1' }), error => error.code === code, code);
    assert.ok(executed.some(call => call.sql === 'ROLLBACK'));
    assert.ok(!executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')));
  }
});

test('resetSourceSync resets every historical source checkpoint only after no active checkpoint remains', async () => {
  const { repo, executed } = manualSyncHarness({ createdMode: 'backfill', source: { platform: 'douyin' }, account: { platform: 'douyin' } });
  const result = await repo.resetSourceSync({ sourceId: 's1', metadata: { historyStart: '2026-09-01' } });
  assert.equal(result.reset, true);
  assert.equal(result.reused, false);
  const checkpointReset = executed.find(call => call.sql.startsWith('UPDATE po_sync_checkpoints cp JOIN po_accounts'));
  assert.ok(checkpointReset);
  assert.deepEqual(checkpointReset.params, ['s1']);
  assert.doesNotMatch(checkpointReset.sql, /WHERE[^]*cp\.status=/, '无活动 checkpoint 后重置该 source 的全部历史 checkpoint');
  const insert = executed.find(call => call.sql.startsWith('INSERT INTO po_sync_runs'));
  assert.equal(insert.params[3], 'backfill');
  assert.ok(!executed.some(call => call.sql.startsWith('UPDATE po_sync_runs SET status=')));
  assert.ok(!executed.some(call => /UPDATE po_sources SET enabled=1/.test(call.sql)));

  const blocked = manualSyncHarness({ activeCheckpoint: { id: 'cp-running' }, source: { platform: 'douyin' }, account: { platform: 'douyin' } });
  await assert.rejects(() => blocked.repo.resetSourceSync({ sourceId: 's1' }), error => error.code === 'SYNC_CHECKPOINT_ACTIVE');
  assert.ok(!blocked.executed.some(call => call.sql.startsWith('UPDATE po_sync_checkpoints cp JOIN po_accounts')));
});

test('resetSourceSync never reuses an active manual run, including a different historyStart', async () => {
  const manualRun = { id: 'run-from-start', source_id: 's1', account_id: 'a1', trigger_type: 'manual', status: 'queued', sync_mode: 'backfill' };
  for (const historyStart of ['2026-09-01', '2026-08-01']) {
    const { repo, executed } = manualSyncHarness({ manualRun, source: { platform: 'douyin' }, account: { platform: 'douyin' } });
    await assert.rejects(() => repo.resetSourceSync({ sourceId: 's1', metadata: { historyStart } }), error => error.code === 'PREVIOUS_RUN_ACTIVE');
    assert.ok(!executed.some(call => call.sql.startsWith('UPDATE po_sync_checkpoints cp JOIN po_accounts')));
    assert.ok(!executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')));
  }
});

test('sync run reads are scoped through account and source', async () => {
  const repo = stubRepo(() => [{ id: 'run-1', sequence_no: 11 }]);
  await repo.getSyncRun('run-1', { accountId: 'a1', sourceId: 's1' });
  assert.match(repo.calls[0].sql, /JOIN po_accounts/);
  assert.match(repo.calls[0].sql, /r\.account_id=\?/);
  assert.match(repo.calls[0].sql, /a\.source_id=\?/);
  assert.deepEqual(repo.calls[0].params, ['run-1', 'a1', 's1']);

  await repo.listSyncRunContents('run-1', { accountId: 'a1', sourceId: 's1', after: 10, limit: 500 });
  assert.match(repo.calls[1].sql, /c\.account_id=a\.id AND c\.source_id=a\.source_id/);
  assert.match(repo.calls[1].sql, /rc\.sequence_no>\?/);
  assert.deepEqual(repo.calls[1].params, ['run-1', 'posts', 10, 'a1', 's1', 100]);
});

test('sync run reads enforce full region game community source and account scope with authoritative content ownership', async () => {
  const repo = stubRepo(() => [{ id: 'run-1' }]);
  const scope = { accountId: 'account-1', sourceId: 'source-1', regionCode: 'overseas', gameId: 'game-1', communityId: 'community-1' };

  await repo.getSyncRun('run-1', scope);
  const run = repo.calls[0];
  assert.match(run.sql, /JOIN po_accounts a ON a\.id=r\.account_id/);
  assert.match(run.sql, /JOIN po_sources s ON s\.id=a\.source_id/);
  assert.match(run.sql, /JOIN po_games g ON g\.id=a\.game_id/);
  assert.match(run.sql, /LEFT JOIN po_communities c ON c\.id=a\.community_id/);
  assert.match(run.sql, /r\.account_id=\?/);
  assert.match(run.sql, /a\.source_id=\?/);
  assert.match(run.sql, /a\.game_id=\?/);
  assert.match(run.sql, /a\.community_id=\?/);
  assert.match(run.sql, /g\.region_code=\?/);
  assert.deepEqual(run.params, ['run-1', 'account-1', 'source-1', 'game-1', 'community-1', 'overseas']);

  await repo.listSyncRunContents('run-1', { ...scope, syncScope: 'comments', after: 9, limit: 40 });
  const contents = repo.calls[1];
  assert.match(contents.sql, /c\.account_id=a\.id/);
  assert.match(contents.sql, /c\.source_id=a\.source_id/);
  assert.match(contents.sql, /c\.game_id=a\.game_id/);
  assert.match(contents.sql, /\(c\.community_id<=>a\.community_id\)/);
  assert.match(contents.sql, /a\.community_id=\?/);
  assert.match(contents.sql, /g\.region_code=\?/);
  assert.deepEqual(contents.params, ['run-1', 'comments', 9, 'account-1', 'source-1', 'game-1', 'community-1', 'overseas', 40]);
});

test('latest source run prioritizes queued or running work', async () => {
  const repo = stubRepo(() => [{ id: 'run-active' }]);
  const run = await repo.getLatestSyncRunForSource('s1', { accountId: 'a1' });
  assert.equal(run.id, 'run-active');
  assert.match(repo.calls[0].sql, /CASE WHEN r\.status IN \('queued','running'\) THEN 0 ELSE 1 END/);
  assert.deepEqual(repo.calls[0].params, ['s1', 'a1']);
});

test('finishSyncRun preserves accumulated counters and enforces lease ownership', async () => {
  const repo = stubRepo((sql) => sql.startsWith('SELECT r.') ? [{ id: 'run-1', fetched_count: 9 }] : { affectedRows: 1 });
  const run = await repo.finishSyncRun('run-1', { status: 'completed_full', leaseOwner: 'worker-1' });
  const update = repo.calls[0];
  assert.match(update.sql, /discovered_count=COALESCE\(\?,discovered_count\)/);
  assert.doesNotMatch(update.sql, /fetched_count=/);
  assert.match(update.sql, /WHERE id=\? AND lease_owner=\?/);
  assert.deepEqual(update.params, ['completed_full', null, null, null, null, 'run-1', 'worker-1']);
  assert.equal(run.fetched_count, 9);
});

test('finishSyncRun returns null when stale worker no longer owns the lease', async () => {
  const repo = stubRepo(sql => sql.startsWith('UPDATE') ? { affectedRows: 0 } : [{ id: 'run-1', status: 'completed_full' }]);
  assert.equal(await repo.finishSyncRun('run-1', { status: 'completed_full', leaseOwner: 'worker-stale' }), null);
  assert.equal(repo.calls.length, 1, 'stale owner must not read another worker final result');
});
test('upsertContentPage records sync-run progress and links content idempotently', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  let associationCount = 0;
  const conn = {
    async query(sql, params = []) {
      executed.push({ sql, params });
      if (sql.startsWith('SELECT r.id FROM po_sync_runs')) return [[{ id: 'run-1' }]];
      if (sql.startsWith('SELECT * FROM po_contents')) return sql.includes('external_id') && executed.filter(c => c.sql.startsWith('SELECT * FROM po_contents')).length === 1 ? [[]] : [[{ id: 'c1', external_id: 'p1' }]];
      if (sql.startsWith('INSERT IGNORE INTO po_sync_run_contents')) { associationCount += 1; return { affectedRows: associationCount === 1 ? 1 : 0 }; }
      return { affectedRows: 1 };
    },
    async beginTransaction() { executed.push({ sql: 'BEGIN' }); }, async commit() { executed.push({ sql: 'COMMIT' }); }, async rollback() { executed.push({ sql: 'ROLLBACK' }); }, release() {}
  };
  repo.pool = { async getConnection() { return conn; }, async query() { return [[{ id: 'cp1' }]]; } };
  const input = { account: { id: 'a1', game_id: 'g1', source_id: 's1' }, syncRunId: 'run-1', syncScope: 'posts', checkpointId: 'cp1', leaseOwner: 'worker-1', lastItemAt: '2026-08-12 10:00:00', items: [{ externalId: 'p1', body: 'body', engagement: { comments: 4 } }] };
  await repo.upsertContentPage(input);
  const scopeCheck = executed.find(call => call.sql.startsWith('SELECT r.id FROM po_sync_runs'));
  assert.ok(scopeCheck);
  assert.match(scopeCheck.sql, /FOR UPDATE/);
  const runUpdate = executed.find(call => call.sql.startsWith('UPDATE po_sync_runs SET fetched_count'));
  assert.ok(runUpdate);
  assert.deepEqual(runUpdate.params.slice(0, 7), [1, 1, 0, 0, 4, 1, 1]);
  const checkpointUpdate = executed.find(call => call.sql.startsWith('UPDATE po_sync_checkpoints SET `cursor`'));
  assert.equal(checkpointUpdate.params[4], '2026-08-12 10:00:00');
  assert.ok(executed.findIndex(call => call.sql.startsWith('INSERT IGNORE INTO po_sync_run_contents')) < executed.findIndex(call => call.sql.startsWith('UPDATE po_sync_runs SET fetched_count')));
  assert.equal(executed.at(-1).sql, 'COMMIT');
});


test('upsertContentPage excludes comment rows from post progress counters', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  const existing = { id: 'comment-1', external_id: 'reply-1', content_type: 'comment', platform_author_id: null, root_content_id: 'post-1', parent_content_id: 'post-1', platform_parent_id: 'post-external', content_depth: 1, is_deleted: 0, author_name: '回复人', title: null, body: '回复', published_at: null, source_url: 'urn:comment:reply-1', engagement: {}, fingerprint: null, raw_payload: null };
  const conn = {
    async query(sql, params = []) {
      executed.push({ sql, params });
      if (sql.startsWith('SELECT r.id FROM po_sync_runs')) return [[{ id: 'run-1' }]];
      if (sql.startsWith('SELECT id FROM po_contents')) return [[{ id: 'post-1' }]];
      if (sql.startsWith('SELECT * FROM po_contents')) return [[existing]];
      if (sql.startsWith('INSERT IGNORE INTO po_sync_run_contents')) return { affectedRows: 1 };
      return { affectedRows: 1 };
    },
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}
  };
  repo.pool = { async getConnection() { return conn; } };
  await repo.upsertContentPage({ account: { id: 'a1', game_id: 'g1', source_id: 's1' }, syncRunId: 'run-1', syncScope: 'comments', rootPlatformContentId: 'post-external', leaseOwner: 'worker-1', items: [{ externalId: 'reply-1', contentType: 'comment', authorName: '回复人', body: '回复', sourceUrl: 'urn:comment:reply-1' }] });
  const runUpdate = executed.find(call => call.sql.startsWith('UPDATE po_sync_runs SET fetched_count'));
  assert.deepEqual(runUpdate.params.slice(0, 7), [0, 0, 0, 0, 0, 0, 0]);
  assert.ok(executed.some(call => call.sql.startsWith('INSERT IGNORE INTO po_sync_run_contents')));
});

test('upsertContentPage treats equivalent DB dates and JSON key order as unchanged', async () => {
  async function classify(body) {
    const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
    const executed = [];
    const existing = { id: 'c1', external_id: 'p1', content_type: 'post', platform_author_id: 'u1', root_content_id: null, parent_content_id: null, platform_parent_id: null, content_depth: 0, is_deleted: 0, author_name: '作者', title: '标题', body: '正文', published_at: '2026-08-13 01:10:39', source_url: 'https://club.q1.com/post/p1', engagement: { views: 6, likes: 3, comments: 2 }, fingerprint: 'fp1', raw_payload: null };
    const conn = {
      async query(sql, params = []) {
        executed.push({ sql, params });
        if (sql.startsWith('SELECT r.id FROM po_sync_runs')) return [[{ id: 'run-1' }]];
        if (sql.startsWith('SELECT * FROM po_contents')) return [[existing]];
        if (sql.startsWith('INSERT IGNORE INTO po_sync_run_contents')) return { affectedRows: 1 };
        return { affectedRows: 1 };
      },
      async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}
    };
    repo.pool = { async getConnection() { return conn; } };
    const result = await repo.upsertContentPage({ account: { id: 'a1', game_id: 'g1', source_id: 's1' }, syncRunId: 'run-1', syncScope: 'posts', leaseOwner: 'worker-1', items: [{ externalId: 'p1', contentType: 'post', platformAuthorId: 'u1', authorName: '作者', title: '标题', body, publishedAt: new Date('2026-08-13T01:10:39Z'), sourceUrl: 'https://club.q1.com/post/p1', engagement: { comments: 2, likes: 3, views: 6 }, fingerprint: 'fp1' }] });
    return { change: result.contents[0].change, runUpdate: executed.find(call => call.sql.startsWith('UPDATE po_sync_runs SET fetched_count')) };
  }

  const unchanged = await classify('正文');
  assert.equal(unchanged.change, 'unchanged');
  assert.deepEqual(unchanged.runUpdate.params.slice(0, 7), [1, 0, 0, 1, 2, 1, 0]);

  const changed = await classify('正文已修改');
  assert.equal(changed.change, 'changed');
  assert.deepEqual(changed.runUpdate.params.slice(0, 7), [1, 0, 1, 0, 2, 1, 1]);
});

test('upsertContentPage rejects a run outside the account/source scope as lease loss and rolls back', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  let beganTransaction = false; let rolledBack = false;
  const conn = {
    async query(sql) { if (sql.startsWith('SELECT r.id FROM po_sync_runs')) return [[]]; return { affectedRows: 1 }; },
    async beginTransaction() { beganTransaction = true; }, async commit() {}, async rollback() { rolledBack = true; }, release() {}
  };
  repo.pool = { async getConnection() { return conn; } };
  await assert.rejects(() => repo.upsertContentPage({ account: { id: 'a1', source_id: 's1' }, syncRunId: 'run-other', syncScope: 'posts' }), error => error.code === 'SYNC_RUN_LEASE_LOST');
  assert.equal(beganTransaction, true);
  assert.equal(rolledBack, true);
});

test('releaseSyncCheckpoint distinguishes omitted cursor from explicit clear', async () => {
  const repo = stubRepo(() => ({ affectedRows: 1 }));
  await repo.releaseSyncCheckpoint('cp1', { status: 'failed', leaseOwner: 'worker-1' });
  assert.doesNotMatch(repo.calls[0].sql, /`cursor`=\?/);
  assert.equal(repo.calls[0].params[1], null); // last_item_at remains the second value

  repo.calls.length = 0;
  await repo.releaseSyncCheckpoint('cp1', { status: 'idle', cursor: null, leaseOwner: 'worker-1' });
  assert.match(repo.calls[0].sql, /`cursor`=\?/);
  assert.equal(repo.calls[0].params[1], null); // explicit NULL clears cursor
});

test('listContents uses linked and provider comment totals in both query paths', async () => {
  // comment_count 已拆为主查询后按 id 批量补查：主查询返回行，补查询返回本地评论数
  const repo = stubRepo(sql => {
    if (sql.includes('content_type=\'comment\' AND is_deleted=0 GROUP BY root_content_id')) return [{ root_content_id: 'post-1', cnt: 3 }];
    if (sql.includes('FROM po_analysis_jobs j WHERE j.content_id IN')) return [];
    return [{ id: 'post-1', content_type: 'post', engagement: '{"comment":1}' }];
  });

  const rows = await repo.listContents({});
  assert.equal(rows[0].comment_count, 3);
  // 本地评论数补查：同表按 root_content_id 聚合
  const commentSql = repo.calls.find(call => call.sql.includes('GROUP BY root_content_id')).sql;
  assert.match(commentSql, /root_content_id IN \(\?\)/);
  assert.match(commentSql, /content_type='comment'/);
  assert.match(commentSql, /is_deleted=0/);
  // engagement 口径：大于本地计数时取 engagement（与原 GREATEST 一致）
  assert.deepEqual(repo.calls.find(call => call.sql.includes('GROUP BY root_content_id')).params, ['post-1']);

  repo.calls.length = 0;
  await repo.listContents({ sourceId: 'source-1' });
  assert.match(repo.calls[0].sql, /FROM po_contents c/);
  assert.deepEqual(repo.calls[0].params.slice(-3), ['source-1', 20, 0]);
});

test('countContents applies tree filters and excludes deleted content by default', async () => {
  const repo = stubRepo(() => [{ total: 12 }]);
  const total = await repo.countContents({ accountId: 'account-1', contentType: 'post' });
  assert.equal(total, 12);
  assert.match(repo.calls[0].sql, /c\.account_id=\?/);
  assert.match(repo.calls[0].sql, /c\.content_type=\?/);
  assert.match(repo.calls[0].sql, /c\.is_deleted=0/);
  assert.deepEqual(repo.calls[0].params, ['account-1', 'post']);

  repo.calls.length = 0;
  await repo.countContents({ contentType: 'comment', includeDeleted: true });
  assert.doesNotMatch(repo.calls[0].sql, /c\.is_deleted=0/);
  assert.deepEqual(repo.calls[0].params, ['comment']);
});

test('listContentTree exposes actual breakdown and compatible total comment count', async () => {
  const repo = stubRepo(() => []);
  await repo.listContentTree({ rootContentId: 'p1' });
  assert.match(repo.calls[0].sql, /top_level_comment_count/);
  assert.match(repo.calls[0].sql, /content_depth=1/);
  assert.match(repo.calls[0].sql, /reply_count/);
  assert.match(repo.calls[0].sql, /content_depth>1/);
  assert.match(repo.calls[0].sql, /GREATEST\(/);
  assert.match(repo.calls[0].sql, /JSON_EXTRACT\(c\.engagement,'\$\.comments'\)/);
  assert.match(repo.calls[0].sql, /AS comment_count/);
  assert.match(repo.calls[0].sql, /AS total_comment_count/);
});

test('quality candidate upsert is deep-only, idempotent, and preserves review fields', async () => {
  const repo = stubRepo(sql => {
    if (sql.startsWith('SELECT * FROM po_quality_candidates')) return [{ id: 'q1', home_review_status: 'accepted' }];
    if (sql.startsWith('DELETE FROM po_quality_candidates')) return { affectedRows: 1 };
    return { affectedRows: 1 };
  });
  assert.equal(await repo.upsertQualityCandidate('c1', { body: '短内容', qualityScore: 0.79, recommendHome: true }), null);
  assert.equal(repo.calls.length, 1);
  const longBody = '这是一段长度足够的正文，用于验证深度分析产生的优质内容候选可以正常写入并保留审核字段。'.repeat(2);
  const candidate = await repo.upsertQualityCandidate('c1', { body: longBody, qualityScore: 0.9, recommendHome: true, qualityReason: 'high value', analysisVersion: 'deep-v2', modelName: 'model', contentFingerprint: 'fp' });
  assert.equal(candidate.id, 'q1');
  assert.match(repo.calls[1].sql, /ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(repo.calls[1].sql, /home_review_status=VALUES|home_adopted=VALUES|reviewer_id=VALUES/);
  assert.deepEqual(repo.calls[1].params.slice(1), ['c1', 0.9, 1, 0, 0, 'high value', 'deep-v2', 'model', 'fp']);
});

test('quality candidate upsert removes negative candidates and stale recommendations', async () => {
  const repo = stubRepo(sql => sql.startsWith('DELETE FROM po_quality_candidates') ? { affectedRows: 1 } : []);
  assert.equal(await repo.upsertQualityCandidate('negative-1', { sentiment: 'negative', recommendHome: true }), null);
  assert.equal(repo.calls.length, 1);
  assert.match(repo.calls[0].sql, /DELETE FROM po_quality_candidates/);
});

test('quality candidate upsert removes negative candidates and stale recommendations', async () => {
  const repo = stubRepo(sql => sql.startsWith('DELETE FROM po_quality_candidates') ? { affectedRows: 1 } : []);
  assert.equal(await repo.upsertQualityCandidate('negative-1', { sentiment: 'negative', recommendHome: true }), null);
  assert.equal(repo.calls.length, 1);
  assert.match(repo.calls[0].sql, /DELETE FROM po_quality_candidates/);
});

test('quality content queries enforce scope, recommendation review, date, and pagination', async () => {
  const repo = stubRepo(sql => sql.startsWith('SELECT COUNT') ? [{ total: 3 }] : [{ id: 'q1' }]);
  const filters = { regionCode: 'domestic', gameId: 'g1', communityId: 'cm1', sourceId: 's1', recommendationType: 'home', reviewStatus: 'pending', publishedFrom: '2026-08-01', publishedTo: '2026-08-21', page: 2, pageSize: 10 };
  const items = await repo.listQualityContents(filters);
  const total = await repo.countQualityContents(filters);
  const detail = await repo.getQualityContent('q1', { regionCode: 'domestic', gameId: 'g1', communityId: 'cm1', sourceId: 's1' });
  assert.equal(items[0].id, 'q1'); assert.equal(total, 3); assert.equal(detail.id, 'q1');
  assert.match(repo.calls[0].sql, /q\.recommend_home=1/); assert.match(repo.calls[0].sql, /q\.home_review_status=\?/);
  assert.match(repo.calls[0].sql, /CHAR_LENGTH\(TRIM\(COALESCE\(c\.body/);
  assert.match(repo.calls[0].sql, /q\.quality_score >= 0\.8/);
  assert.match(repo.calls[0].sql, /ORDER BY c\.published_at DESC, q\.quality_score DESC, q\.id DESC/);
  assert.deepEqual(repo.calls[0].params, ['g1', 'cm1', 's1', 'domestic', '2026-08-01', '2026-08-21', 'pending', 10, 10]);
  assert.deepEqual(repo.calls[2].params, ['q1', 'g1', 'cm1', 's1', 'domestic']);
});

test('upsertQualityCandidate rejects low-score recommendations', async () => {
  const repo = stubRepo(() => ({ affectedRows: 1 }));
  assert.equal(await repo.upsertQualityCandidate('low', { body: '这是一个长度足够的正文，包含完整信息和上下文，应该可以通过正文长度校验。', qualityScore: 0.79, recommendHome: true, sentiment: 'positive' }), null);
  assert.equal(repo.calls.filter(call => call.sql.startsWith('DELETE FROM po_quality_candidates')).length, 1);
});
test('quality review update maps only requested fields and records reviewer', async () => {
  const repo = stubRepo(sql => sql.startsWith('UPDATE po_quality_candidates') ? { affectedRows: 1 } : [{ id: 'q1', home_review_status: 'accepted', home_adopted: 1 }]);
  const updated = await repo.updateQualityCandidate('q1', { homeReviewStatus: 'accepted', homeAdopted: true, reviewNote: 'approved' }, 'reviewer-1');
  assert.equal(updated.id, 'q1');
  const update = repo.calls.find(call => call.sql.startsWith('UPDATE po_quality_candidates'));
  assert.match(update.sql, /home_review_status=\?, home_adopted=\?, review_note=\?/);
  assert.doesNotMatch(update.sql, /pin_review_status|feature_review_status/);
  assert.deepEqual(update.params, ['accepted', 1, 'approved', 'reviewer-1', 'q1']);
  await assert.rejects(() => repo.updateQualityCandidate('q1', { unknown: true }), error => error.code === 'INVALID_INPUT');
});

test('listSyncRuns uses bounded pagination, joined safe fields, and parameterized filters', async () => {
  const repo = stubRepo(sql => sql.startsWith('SELECT COUNT') ? [{ total: 7 }] : [{ id: 'run-1' }]);
  const result = await repo.listSyncRuns({ gameId: 'g1', platform: 'douyin', status: 'failed', syncMode: 'backfill', page: 2, pageSize: 500 });
  assert.equal(result.total, 7); assert.equal(result.pageSize, 100); assert.equal(result.items[0].id, 'run-1');
  assert.match(repo.calls[1].sql, /JOIN po_sources/); assert.match(repo.calls[1].sql, /JOIN po_games/);
  assert.doesNotMatch(repo.calls[1].sql, /secret|raw_payload|config/);
  assert.deepEqual(repo.calls[1].params, ['g1', 'douyin', 'failed', 'backfill', 100, 100]);
});

test('deleteSyncRun protects shared alert quality and ancestor content and audits atomically', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' }); const executed = [];
  const protections = {
    'delete-me': { shared: 0, alert_protected: 0, quality_protected: 0, ancestor_protected: 0 },
    shared: { shared: 1, alert_protected: 0, quality_protected: 0, ancestor_protected: 0 },
    alerted: { shared: 0, alert_protected: 1, quality_protected: 0, ancestor_protected: 0 },
    quality: { shared: 0, alert_protected: 0, quality_protected: 1, ancestor_protected: 0 },
    parent: { shared: 0, alert_protected: 0, quality_protected: 0, ancestor_protected: 1 }
  };
  const conn = { async query(sql, params = []) { executed.push({ sql, params }); if (sql.startsWith('SELECT r.id')) return [[{ id: 'run-abcdef', status: 'failed', account_id: 'a1', game_id: 'g1', source_id: 's1' }]]; if (sql.startsWith('SELECT DISTINCT content_id')) return [[...Object.keys(protections).map(content_id => ({ content_id }))]]; if (sql.startsWith('SELECT id FROM po_contents')) return [[{ id: params[0] }]]; if (sql.startsWith('SELECT EXISTS')) return [[protections[params[0]]]]; return { affectedRows: 1 }; }, async beginTransaction() { executed.push({ sql: 'BEGIN' }); }, async commit() { executed.push({ sql: 'COMMIT' }); }, async rollback() { executed.push({ sql: 'ROLLBACK' }); }, release() {} };
  repo.pool = { async getConnection() { return conn; } };
  const result = await repo.deleteSyncRun('run-abcdef', 'abcdef');
  assert.equal(result.deletedContentCount, 1); assert.equal(result.retainedSharedCount, 1); assert.equal(result.alertProtectedCount, 1); assert.equal(result.qualityProtectedCount, 1); assert.equal(result.ancestorProtectedCount, 1); assert.deepEqual(executed.filter(c => c.sql.startsWith('DELETE FROM po_contents')).map(c => c.params[0]), ['delete-me']);
  const audit = executed.find(c => c.sql.startsWith('INSERT INTO po_audit_events')); assert.ok(audit.params.includes('system')); assert.match(audit.params.at(-1), /"alertProtectedCount":1/); assert.match(audit.params.at(-1), /"qualityProtectedCount":1/); assert.equal(executed.at(-1).sql, 'COMMIT');
});

test('upsertContentPage writes feed membership in the same transaction', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  let contentSelects = 0;
  const conn = {
    async query(sql, params = []) {
      executed.push({ sql, params });
      if (sql.startsWith('SELECT * FROM po_contents')) return contentSelects++ === 0 ? [[]] : [[{ id: 'c1', external_id: 'p1' }]];
      if (sql.startsWith('INSERT INTO po_contents')) return { affectedRows: 1 };
      if (sql.startsWith('SELECT id FROM po_contents')) return [[]];
      return { affectedRows: 1 };
    },
    async beginTransaction() { executed.push({ sql: 'BEGIN' }); },
    async commit() { executed.push({ sql: 'COMMIT' }); },
    async rollback() { executed.push({ sql: 'ROLLBACK' }); },
    release() {}
  };
  repo.pool = { async getConnection() { return conn; }, async query() { return [[]]; } };
  await repo.upsertContentPage({
    account: { id: 'a1', game_id: 'g1', source_id: 's1' },
    syncScope: 'posts',
    feed: { feedKey: 'home', pageKind: 'home' },
    items: [{ externalId: 'p1', contentType: 'post', body: 'body' }]
  });
  const membership = executed.find(call => call.sql.startsWith('INSERT INTO po_content_feed_memberships'));
  assert.ok(membership);
  assert.match(membership.sql, /ON DUPLICATE KEY UPDATE/);
  assert.ok(executed.findIndex(call => call.sql.startsWith('INSERT INTO po_contents')) < executed.findIndex(call => call.sql.startsWith('INSERT INTO po_content_feed_memberships')));
  assert.equal(executed.at(-1).sql, 'COMMIT');
});
