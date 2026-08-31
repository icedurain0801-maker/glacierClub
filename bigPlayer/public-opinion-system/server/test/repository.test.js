const test = require('node:test');
const assert = require('node:assert/strict');
const { Repository, isWithinActiveWindow } = require('../src/db/repository');

// 构造一个不会真正连库的 Repository：覆盖 query 记录 SQL/params，返回预设行。
function stubRepo(handler) {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  repo.pool = { async query() { throw new Error('pool.query should not be called in unit test'); }, async end() {} };
  repo.calls = [];
  repo.query = async (sql, params = []) => { repo.calls.push({ sql, params }); return handler ? handler(sql, params) : []; };
  return repo;
}

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
    if (/FROM po_alerts WHERE id=\?/.test(sql)) return [{ id: 'a1', title: '告警' }];
    if (/FROM po_alert_contents ac/.test(sql)) return related;
    return [];
  });

  const alert = await repo.getAlert('a1');

  assert.equal(alert.id, 'a1');
  assert.deepEqual(alert.related_contents, related);
  assert.equal(alert.related_contents[0].body, longBody);
  assert.equal(alert.related_contents[0].author_id, 'author-post');
  assert.equal(alert.related_contents[1].author_id, 'author-comment');
  assert.equal(repo.calls.length, 2);
  assert.match(repo.calls[1].sql, /c\.platform_author_id AS author_id/);
  assert.match(repo.calls[1].sql, /JOIN po_contents c ON c\.id=ac\.content_id/);
  assert.doesNotMatch(repo.calls[1].sql, /LEFT\s*\(|SUBSTRING\s*\(/i);
  assert.deepEqual(repo.calls[1].params, ['a1']);
});

test('getAlert 不存在时不查询关联内容，无关联时返回空数组', async () => {
  const missing = stubRepo(() => []);
  assert.equal(await missing.getAlert('missing'), null);
  assert.equal(missing.calls.length, 1);

  const empty = stubRepo(sql => /FROM po_alerts WHERE id=\?/.test(sql) ? [{ id: 'a-empty' }] : []);
  assert.deepEqual((await empty.getAlert('a-empty')).related_contents, []);
  assert.equal(empty.calls.length, 2);
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
  const repo = stubRepo(sql => sql.startsWith('INSERT IGNORE') ? { affectedRows: 1 } : [{ id: 'content-1' }]);
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
    if (/DATE\(c\.collected_at\)/.test(sql)) return [{ date: '2026-08-07', negative: 2, total: 5 }];
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

  const trend = repo.calls.find(({ sql }) => /DATE\(c\.collected_at\)/.test(sql));
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
  const repo = stubRepo((sql) => sql.startsWith('SELECT id, account_id, credential_type') ? [{ id: 'cr1', account_id: 'a1', credential_type: 'api_token' }] : { affectedRows: 1 });
  const row = await repo.upsertAccountCredential('a1', { credentialType: 'api_token', secretCipher: 'ENC' });
  assert.equal(row.id, 'cr1');
  const write = repo.calls.find(c => c.sql.startsWith('INSERT INTO po_credentials'));
  assert.ok(write, '应使用 INSERT ... ON DUPLICATE KEY UPDATE');
  assert.match(write.sql, /ON DUPLICATE KEY UPDATE/);
  assert.match(write.sql, /failure_reason=NULL/);
  assert.equal(write.params.at(-1), 'a1');
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
  assert.equal(insert.params[4], 'u1');
  await repo.getDefaultAccount({ gameId: 'g1', platform: 'h5' });
  assert.match(repo.calls.at(-1).sql, /enabled=\?/);
});

test('claim checkpoint is atomic and lease based', async () => {
  const repo = stubRepo((sql) => sql.startsWith('SELECT * FROM po_sync_checkpoints') ? [{ id: 'cp1', status: 'running', lease_owner: 'worker-1' }] : { affectedRows: 1 });
  const row = await repo.claimSyncCheckpoint({ accountId: 'a1', syncScope: 'posts', leaseOwner: 'worker-1', leaseSeconds: 60 });
  assert.equal(row.status, 'running');
  assert.match(repo.calls[0].sql, /INSERT IGNORE/);
  assert.match(repo.calls[1].sql, /lease_until/);
  assert.doesNotMatch(repo.calls[1].sql, /'paused'/);
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
  assert.deepEqual(repo.calls[0].params.slice(0, 5), ['sentiment-v1', 'urgent', 'negative', 'p1', 'p1']);
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
  assert.deepEqual(call.params.slice(0, 4), ['sentiment-v1', 'g1', 'overseas', 'p1']);
});

test('listContentTree filters content by community ownership', async () => {
  const repo = stubRepo(() => []);

  await repo.listContentTree({ gameId: 'game-1', communityId: 'community-1', rootContentId: 'post-1' });

  const call = repo.calls[0];
  assert.match(call.sql, /c\.game_id=\?/);
  assert.match(call.sql, /c\.community_id=\?/);
  assert.deepEqual(call.params.slice(0, 5), ['sentiment-v1', 'game-1', 'community-1', 'post-1', 'post-1']);
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
  assert.equal(insert.params.length, 21);
  assert.match(insert.sql, /VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,NOW\(\),NOW\(\)\)/);
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

test('startSourceSync atomically creates a queued run and returns it', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  const conn = {
    async query(sql, params = []) {
      executed.push({ sql, params });
      if (sql.includes('FROM po_sources')) return [[{ id: 's1', enabled: 0, game_enabled: 1 }]];
      if (sql.includes('FROM po_accounts')) return [[{ id: 'a1' }]];
      if (sql.includes("status IN ('queued','running')")) return [[]];
      if (sql.startsWith('SELECT * FROM po_sync_runs WHERE id=')) return [[{ id: params[0], account_id: 'a1', status: 'queued', sync_mode: 'incremental' }]];
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { executed.push({ sql: 'BEGIN' }); }, async commit() { executed.push({ sql: 'COMMIT' }); }, async rollback() { executed.push({ sql: 'ROLLBACK' }); }, release() {}
  };
  repo.pool = { async getConnection() { return conn; } };
  const result = await repo.startSourceSync({ sourceId: 's1', accountId: 'a1', syncMode: 'incremental', metadata: { syncMode: 'incremental' } });
  assert.equal(result.enabled, true);
  assert.equal(result.run.status, 'queued');
  assert.equal(result.run.account_id, 'a1');
  assert.ok(executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')));
  assert.equal(executed.at(-1).sql, 'COMMIT');
});

test('startSourceSync reuses an active run instead of creating a duplicate', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  const executed = [];
  const active = { id: 'run-existing', account_id: 'a1', status: 'running', sync_mode: 'incremental' };
  const conn = {
    async query(sql) {
      executed.push({ sql });
      if (sql.includes('FROM po_sources')) return [[{ id: 's1', enabled: 1, game_enabled: 1 }]];
      if (sql.includes('FROM po_accounts')) return [[{ id: 'a1' }]];
      if (sql.includes("status IN ('queued','running')")) return [[active]];
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}
  };
  repo.pool = { async getConnection() { return conn; } };
  const result = await repo.startSourceSync({ sourceId: 's1', accountId: 'a1' });
  assert.equal(result.run.id, 'run-existing');
  assert.ok(!executed.some(call => call.sql.startsWith('INSERT INTO po_sync_runs')));
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

test('upsertContentPage associates content once and updates run/checkpoint atomically', async () => {
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
  assert.doesNotMatch(scopeCheck.sql, /FOR UPDATE/);
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

test('upsertContentPage rejects a run outside the account/source scope', async () => {
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'test_never_connects' });
  let beganTransaction = false; let rolledBack = false;
  const conn = {
    async query(sql) { if (sql.startsWith('SELECT r.id FROM po_sync_runs')) return [[]]; return { affectedRows: 1 }; },
    async beginTransaction() { beganTransaction = true; }, async commit() {}, async rollback() { rolledBack = true; }, release() {}
  };
  repo.pool = { async getConnection() { return conn; } };
  await assert.rejects(() => repo.upsertContentPage({ account: { id: 'a1', source_id: 's1' }, syncRunId: 'run-other', syncScope: 'posts' }), error => error.code === 'SYNC_RUN_SCOPE_MISMATCH');
  assert.equal(beganTransaction, false);
  assert.equal(rolledBack, false);
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
  const repo = stubRepo(sql => sql.startsWith('SELECT * FROM po_quality_candidates') ? [{ id: 'q1', home_review_status: 'accepted' }] : sql.startsWith('DELETE FROM po_quality_candidates') ? { affectedRows: 1 } : { affectedRows: 1 });
  assert.equal(await repo.upsertQualityCandidate('c1', { body: '短内容', qualityScore: 0.9, recommendHome: true }), null);
  assert.equal(repo.calls.length, 1);
  const candidate = await repo.upsertQualityCandidate('c1', { body: '这是一段长度足够的正文，用于验证深度分析产生的优质内容候选可以正常写入并保留审核字段。', qualityScore: 0.9, recommendHome: true, qualityReason: 'high value', analysisVersion: 'deep-v2', modelName: 'model', contentFingerprint: 'fp' });
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

test('upsertQualityCandidate rejects short or low-score recommendations', async () => {
  const repo = stubRepo(() => ({ affectedRows: 1 }));
  assert.equal(await repo.upsertQualityCandidate('short', { body: '不足五十字', qualityScore: 0.99, recommendHome: true, sentiment: 'positive' }), null);
  assert.equal(await repo.upsertQualityCandidate('low', { body: '这是一个长度足够的正文，包含完整信息和上下文，应该可以通过正文长度校验。', qualityScore: 0.79, recommendHome: true, sentiment: 'positive' }), null);
  assert.equal(repo.calls.filter(call => call.sql.startsWith('DELETE FROM po_quality_candidates')).length, 2);
});
test('quality review update maps only requested fields and records reviewer', async () => {
  const repo = stubRepo(sql => sql.startsWith('UPDATE po_quality_candidates') ? { affectedRows: 1 } : [{ id: 'q1', home_review_status: 'accepted', home_adopted: 1 }]);
  const updated = await repo.updateQualityCandidate('q1', { homeReviewStatus: 'accepted', homeAdopted: true, reviewNote: 'approved' }, 'reviewer-1');
  assert.equal(updated.id, 'q1');
  assert.match(repo.calls[0].sql, /home_review_status=\?, home_adopted=\?, review_note=\?/);
  assert.doesNotMatch(repo.calls[0].sql, /pin_review_status|feature_review_status/);
  assert.deepEqual(repo.calls[0].params, ['accepted', 1, 'approved', 'reviewer-1', 'q1']);
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
