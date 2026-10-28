const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { dispatch } = require('../src/baasDingTalkRunner');
const { messages: renderMessages, notificationWindow, deliveryDate } = require('../src/collectionDingTalk');
const messages = (run, rows, failed, pushType = 'urgent', sentAt = Date.parse('2026-10-15T08:00:00Z')) => renderMessages(run, rows, failed, pushType, sentAt);
const root = path.resolve(__dirname, '../../../../.temp/collection-dingtalk-tests');
const route = { gameId: 'game', communityId: 'community', enabled: true, robot: 'robot', enabledAt: '2026-10-14T00:00:00Z' };
const run = { id: 'run', status: 'completed', finished_at: '2026-10-15 12:00:00', source_id: 'source', account_id: 'account', game_id: 'game', community_id: 'community', game_name: 'X-Clash', community_name: '位面' };
const content = { published_at: '2026-10-15 00:00:00', id: 'content', fingerprint: 'fp', content_fingerprint: 'fp', severity: 'negative', sentiment: 'negative', body: '网页卡死，无法领奖', analysis_reason: '网页卡死影响领奖', content_type: 'comment', analysis_pending: 0, analysis_failed: 0 };

test('all DingTalk categories include the source platform in title and body', () => {
  for (const [platform, label] of [['bigplayer_h5', 'BigPlayer'], ['facebook', 'Facebook']]) {
    for (const pushType of ['urgent', 'attention', 'quality']) {
      const card = messages({ ...run, platform }, [{ ...content, quality_reason: '分享具体通关步骤供玩家参考' }], 0, pushType)[0];
      assert(card.title.includes(` · ${label} · `));
      assert(card.text.includes(`平台：${label}`));
      assert(card.text.includes('网页卡死'));
    }
  }
  const legacy = messages(run, [content], 0)[0];
  assert(legacy.title.includes('未知平台'));
});
test('Facebook source override sends once to its own group and disabled override blocks inheritance', async t => {
  const f = await fixture(t); f.state.config.sourceRoutes = { source: { ...route, sourceId:'source', robot:'fb-group' } };
  await f.send(); assert.equal(f.state.sent.length,1); assert.equal(f.state.sent[0].robot,'fb-group');
  const disabled = await fixture(t); disabled.state.config.sourceRoutes = { source: { ...route, sourceId:'source', enabled:false } };
  await disabled.send(); assert.equal(disabled.state.sent.length,0);
});
test('all push categories link to the hosted exact content detail', () => {
  for (const pushType of ['urgent', 'attention', 'quality']) {
    const card = messages({ ...run, region_code: 'overseas' }, [{ ...content, quality_reason: '分享具体通关步骤供玩家参考' }], 0, pushType)[0];
    const url = new URL(card.text.match(/\[查看内容及完整分析\]\(([^)]+)\)/)[1]);
    assert.equal(url.origin, 'https://chat.q1.com');
    assert.equal(url.pathname, '/apps/public-opinion/admin/PublicOpinion/content.html');
    assert.equal(url.searchParams.get('contentId'), content.id);
    assert.equal(url.searchParams.get('communityId'), run.community_id);
    assert.equal(url.searchParams.get('regionCode'), 'overseas');
    assert.equal(url.searchParams.get('publishedFrom'), '2026-10-15');
    assert.equal(url.searchParams.get('publishedTo'), '2026-10-15');
  }
});
async function fixture(t, rows = [content]) {
  const directory = path.join(root, crypto.randomUUID()); await fs.mkdir(directory, { recursive: true });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const state = { rows, runs: [run], sent: [], audit: [], queries: [], config: { communityRoutes: { 'game:community': { ...route } } } };
  const service = { directory, read: async () => state.config, token: () => 'test-token', request: async (_, method, endpoint, payload) => { state.sent.push(payload); if (state.error) throw Object.assign(new Error('timeout'), { code: 'BAAS_DINGTALK_TIMEOUT' }); return { ok: true, robot: payload.robot }; } };
  const repo = { query: async (sql, params) => {
    state.queries.push({ sql, params });
    if (sql.includes('SELECT r.id')) return state.runs;
    if (sql.includes('SELECT DISTINCT c.id')) return state.rows;
    if (sql.startsWith('SELECT alert_id')) return state.links || [];
    if (sql.startsWith('INSERT')) { state.audit.push(params); return []; }
    throw new Error('Unexpected SQL');
  } };
  const send = () => dispatch({ repo, service, pause: async () => {}, now: () => state.now ?? Date.parse('2026-10-15T00:00:00Z') });
  return { state, service, send, directory };
}
test('only finished root runs and their changed contents are scanned, matching community and activation time', async t => {
  const f = await fixture(t); const r = await f.send(); assert.equal(r.sent, 1);
  const q = f.state.queries[0]; assert(q.sql.includes('r.parent_run_id IS NULL')); assert(q.sql.includes('r.finished_at>=?')); assert(q.sql.includes('NOT EXISTS')); assert(q.sql.includes('s.game_id=? AND s.community_id=?')); assert.deepEqual(q.params.slice(1, 3), ['game', 'community']); assert.equal(q.params[0].toISOString(), '2026-10-14T12:00:00.000Z');
  const contentSql = f.state.queries[1].sql; assert(contentSql.includes('UNION ALL SELECT id FROM po_sync_runs WHERE parent_run_id=? AND id<>?')); assert(contentSql.includes('STRAIGHT_JOIN po_sync_run_contents rc ON rc.run_id=member.id')); assert(contentSql.includes("rc.change_type IN ('inserted','changed')")); assert(contentSql.includes('j.content_fingerprint=c.fingerprint')); assert(contentSql.includes("'pending','running','retryable'"));
});
test('pending, retrying or missing analysis postpones only that content and retains the run', async t => {
  for (const row of [{ ...content, analysis_pending: 1 }, { ...content, content_fingerprint: 'old' }, { ...content, content_fingerprint: null }]) {
    const f = await fixture(t, [content, { ...row, id: 'waiting' }]); const first = await f.send(); assert.equal(first.waiting, 1); assert.equal(first.sent, 1); assert.equal(first.completedRuns, 0);
    assert.equal((await f.send()).sent, 0);
    f.state.rows = [content, { ...content, id: 'waiting' }]; assert.equal((await f.send()).sent, 1); assert.equal(f.state.sent.length, 2);
    assert.equal((await f.send()).sent, 0);
  }
});

test('unrelated pending positive analysis cannot block finished urgent content; own deep review still waits',async t=>{
  const f=await fixture(t,[content,{...content,id:'positive',severity:'normal',sentiment:'positive',analysis_pending:1},{...content,id:'deep-review',severity:'urgent',analysis_pending:1}]);
  const first=await f.send();assert.equal(first.sent,1);assert.equal(first.waiting,1);assert(!f.state.sent[0].markdown.text.includes('deep-review'));
  f.state.rows=[content,{...content,id:'positive',severity:'normal',sentiment:'positive'},{...content,id:'deep-review',severity:'urgent'}];
  assert.equal((await f.send()).sent,1);assert.equal((await f.send()).sent,0);
});
test('page negative and urgent risks summarize together; positive and attention are excluded', async t => {
  const f = await fixture(t, [content, { ...content, id: 'urgent', severity: 'urgent' }, { ...content, id: 'attention', severity: 'attention' }, { ...content, id: 'positive', sentiment: 'positive' }]);
  assert.equal((await f.send()).sent, 2); assert.equal(f.state.sent.length, 2); const text = f.state.sent[0].markdown.text;
  assert(text.includes('**位面**　评论')); assert(!text.includes('1 / 2')); assert(text.includes('**AI 分析原因**\n\n网页卡死影响领奖')); assert.equal(f.state.audit.length, 2);
  await f.send(); assert.equal(f.state.sent.length, 2);
});
test('partial collection sends available risks without analysis failure counts', async t => {
  const f = await fixture(t, [content, { ...content, id: 'failed', content_fingerprint: null, analysis_failed: 1 }]); f.state.runs = [{ ...run, status: 'partial' }];
  assert.equal((await f.send()).sent, 1); const text = f.state.sent[0].markdown.text; assert(text.includes('采集部分完成')); assert(!text.includes('条内容分析失败')); assert(text.includes('### 紧急告警｜'));
});

test('a settled run containing failed analyses is revisited after successful retry without replaying previous messages',async t=>{
 const f=await fixture(t,[content,{...content,id:'retry',content_fingerprint:null,analysis_failed:1}]);
 assert.equal((await f.send()).sent,1);
 assert.equal((await f.send()).sent,0);
 f.state.rows=[content,{...content,id:'retry'}];
 assert.equal((await f.send()).sent,1);assert.equal((await f.send()).sent,0);
 assert.equal(f.state.sent.length,2);
});
test('notifications preserve saved windows and derive bounded legacy windows',async t=>{
 const f=await fixture(t);f.state.runs=[{...run,window_start:'2026-10-14 16:00:00',window_end:'2026-10-15 18:00:00'}];await f.send();
 const q=f.state.queries.find(q=>q.sql.includes('SELECT DISTINCT c.id'));
 assert(q.sql.includes('c.published_at>=?'));assert(q.sql.includes('c.published_at<?'));
 assert.deepEqual(q.params.slice(-2),['2026-10-14 16:00:00.000','2026-10-15 18:00:00.000']);
 const legacy=await fixture(t);await legacy.send();assert.deepEqual(legacy.state.queries.find(q=>q.sql.includes('SELECT DISTINCT')).params.slice(-2),['2026-10-13 16:00:00.000','2026-10-15 12:00:00.000']);
});
test('legacy windows use Beijing previous midnight, with invalid or incomplete windows withheld',()=>{
 assert.deepEqual(notificationWindow({started_at:'2026-10-15 16:00:00',finished_at:'2026-10-16 01:00:00'}),{start:'2026-10-14 16:00:00.000',end:'2026-10-15 16:00:00.000'});
 assert.equal(notificationWindow({window_start:'2026-10-15 16:00:00'}),null);
 assert.equal(notificationWindow({started_at:'invalid'}),null);
 assert.equal(notificationWindow({window_start:'2026-10-16',window_end:'2026-10-15'}),null);
});
test('no risks sends nothing and settles run, restarts do not resend', async t => {
  const f = await fixture(t, [{ ...content, severity: 'normal' }]); assert.equal((await f.send()).completedRuns, 1); await f.send(); assert.equal(f.state.sent.length, 0);
});
test('completion markers from the old risk contract are rechecked while delivery receipts still deduplicate',async t=>{
 const f=await fixture(t);const folder=path.join(f.directory,'collection-deliveries');await fs.mkdir(folder,{recursive:true});
 const name=crypto.createHash('sha256').update(`${run.id}:${route.robot}:${route.enabledAt}`).digest('hex');
 await fs.writeFile(path.join(folder,`run-${name}.json`),JSON.stringify({runId:run.id,status:'settled',analysisFailed:0}));
 assert.equal((await f.send()).sent,1);assert.equal((await f.send()).sent,0);
 const marker=JSON.parse(await fs.readFile(path.join(folder,`run-${name}.json`),'utf8'));assert.equal(marker.deliveryVersion,'combined-risk-settled-v2');
});
test('dedupe across runs and restarts; a genuinely changed fingerprint can send again', async t => {
  const f = await fixture(t); await f.send(); await f.send(); f.state.runs = [{ ...run, id: 'next' }]; await f.send(); assert.equal(f.state.sent.length, 1);
  f.state.runs = [{ ...run, id: 'changed' }]; f.state.rows = [{ ...content, fingerprint: 'fp2', content_fingerprint: 'fp2' }]; await f.send(); assert.equal(f.state.sent.length, 2);
});
test('ambiguous timeout is journaled and not blindly retried, including later runs', async t => {
  const f = await fixture(t); f.state.error = true; assert.equal((await f.send()).failed, 1); await f.send(); f.state.runs = [{ ...run, id: 'next' }]; await f.send(); assert.equal(f.state.sent.length, 1); assert.equal(f.state.audit[0][6], 'failed');
});
test('manual summaries and legacy event delivery journals are respected', async t => {
  for (const record of [{ robot: 'robot', contentIds: ['content'], status: 'sent' }, { robot: 'robot', alertId: 'alert', status: 'sending' }]) {
    const f = await fixture(t); const folder = path.join(f.directory, 'deliveries'); await fs.mkdir(folder); await fs.writeFile(path.join(folder, 'old.json'), JSON.stringify(record)); f.state.links = [{ alert_id: 'alert' }]; await f.send(); assert.equal(f.state.sent.length, 0);
  }
});
test('disabled route skips DB and expired auth stops delivery', async t => {
  const f = await fixture(t); f.state.config.communityRoutes['game:community'].enabled = false; await f.send(); assert.equal(f.state.queries.length, 0);
  f.state.config.communityRoutes['game:community'].enabled = true; f.service.token = () => { throw Object.assign(new Error(), { code: 'BAAS_DINGTALK_AUTH_EXPIRED' }); }; await assert.rejects(f.send(), { code: 'BAAS_DINGTALK_AUTH_EXPIRED' }); assert.equal(f.state.sent.length, 0);
});
test('route changes during scan stop delivery', async t => {
  const f = await fixture(t); let n = 0; f.service.read = async () => ++n === 1 ? f.state.config : { communityRoutes: {} }; await f.send(); assert.equal(f.state.sent.length, 0);
});
test('one bounded message per content keeps original, reason, IDs and detail', () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ ...content, id: String(i), external_id: `external${i}`, author_name: `用户${i}`, platform_author_id: `author${i}`, published_at: '2026-10-15 01:02:03', body: '原文'.repeat(600), analysis_reason: '原因'.repeat(800) }));
  const cards = messages(run, rows, 0);
  assert.equal(cards.length, 50);
  for (const [i, card] of cards.entries()) {
    assert.deepEqual(card.rows, [rows[i]]);
    assert(card.text.includes('**位面**　评论'));
    assert(!card.text.includes(`评论 · ${i + 1} / 50`));
    assert(card.text.includes('发布时间：2026/10/15 09:02:03'));
    assert(card.text.includes('**原文**'));
    assert(card.text.includes('**AI 分析原因**'));
    assert(card.text.includes(`contentId=${i}&communityId=community&publishedFrom=2026-10-15&publishedTo=2026-10-15`));
    assert(!card.text.includes('批次：'));
    assert(card.text.includes(`发布人ID：author${i}`));
    assert(card.text.includes(`评论ID：external${i}`));
    assert(Buffer.byteLength(card.text, 'utf8') < 10000);
  }
});

test('title uses community name and a single alert has no ordinal', () => {
  const card = messages({ ...run, platform: 'facebook' }, [content], 0)[0];
  assert.equal(card.title, '位面 · Facebook · 紧急告警');
  assert(card.text.includes('**位面**　评论'));
  assert(!card.text.includes('1 / 1'));
});

test('user Markdown cannot inject headings, links, images or separators', () => {
  const original = { ...content, title: '# 大标题', body: '# 标题\n---\n![图片](https://evil.example) *粗体* `代码`', author_name: '[点我](evil)', analysis_reason: '## 原因\n---\n[链接](evil)' };
  const text = messages(run, [original], 0)[0].text;
  assert(text.startsWith('### 紧急告警｜\\# 标题'));
  assert(!text.startsWith('### 紧急告警｜摘录\n'));
  assert(!text.includes('大标题'));
  assert(text.includes('\\!\\[图片\\]\\(https://evil\\.example\\)'));
  assert(text.includes('\\*粗体\\*'));
  assert.equal((text.match(/^### /gm) || []).length, 1);
  assert(!text.includes('\n---'));
  assert.equal(original.displayText, undefined);
});

test('timestamps accept database UTC, Date and timezone-qualified values; missing fields degrade safely', () => {
  for (const published_at of ['2026-10-15 01:02:03', '2026-10-15T01:02:03Z', '2026-10-15T09:02:03+08:00', new Date('2026-10-15T01:02:03Z')]) {
    assert(messages(run, [{ ...content, published_at }], 0)[0].text.includes('发布时间：2026/10/15 09:02:03'));
  }
  const text = messages(run, [{ id: 'empty', published_at: 'bad' }], 0)[0].text;
  assert(text.includes('暂无文字内容')); assert(text.includes('暂无AI分析原因')); assert(text.includes('发布时间：-'));
  assert.deepEqual(messages(run, [], 0), []);
});


test('post notification includes post and platform author IDs', () => {
  const text = messages(run, [{ ...content, id: 'internal123', external_id: 'post123', content_type: 'post', platform_author_id: 'player456' }], 0)[0].text;
  assert(text.includes('帖子ID：post123')); assert(text.includes('发布人ID：player456'));
});

test('heading quotes body, while display ID never falls back to internal UUID', () => {
  const text = messages(run, [{ ...content, id: 'internal-uuid', title: 'different title', body: '原文内容', external_id: 'platform789', platform_author_id: 'player789' }], 0)[0].text;
  assert(text.startsWith('### 紧急告警｜原文内容\n')); assert(text.includes('评论ID：platform789'));
  assert(!text.includes('评论ID：internal')); assert(text.includes('contentId=internal-uuid'));
  const missing = messages(run, [{ ...content, id: 'internal-uuid' }], 0)[0].text;
  assert(missing.includes('评论ID：原平台未提供')); assert(missing.includes('发布人ID：原平台未提供'));
});

test('Chinese translation reuses current translated body, preserving original and reason sections', () => {
  const text = messages({ ...run, region_code: 'overseas' }, [{ ...content, body: 'cannot login', translated_body: '无法登录', analysis_reason: '具体分析依据' }], 0)[0].text;
  assert(text.includes('**原文**\n\n> cannot login'));
  assert(text.includes('**中文翻译**\n\n无法登录'));
  assert(text.includes('**AI 分析原因**\n\n具体分析依据'));
  assert(text.indexOf('**原文**') < text.indexOf('**中文翻译**'));
  const pending = messages({ ...run, region_code: 'overseas' }, [content], 0)[0].text;
  assert(pending.includes('翻译暂未完成'));
  assert(!messages({ ...run, region_code: 'domestic' }, [content], 0)[0].text.includes('**中文翻译**'));
});

test('dispatch joins only matching Chinese translation version and content fingerprint', async t => {
  const f = await fixture(t, [{ ...content, translated_body: '已翻译内容' }]);
  await f.send(); const q = f.state.queries.find(q => q.sql.includes('SELECT DISTINCT c.id'));
  assert(q.sql.includes("tr.target_language='zh-CN'"));
  assert(q.sql.includes('tr.translation_version=? AND tr.content_fingerprint=c.fingerprint'));
  assert.deepEqual(q.params.slice(0, 3), ['run', 'run', 'run']);
  assert.equal(q.params[3], process.env.AI_TRANSLATION_VERSION || 'translation-v1');
  assert(f.state.sent[0].markdown.text.includes('已翻译内容'));
});


test('selected attention and quality types use separate templates, activation and dedupe', async t => {
  const f = await fixture(t, [content, { ...content, id: 'attention', severity: 'attention' }, { ...content, id: 'quality', severity: 'normal', sentiment: 'positive', quality_eligible: 1, quality_reason: '有详细阵容与通关步骤' }]);
  const r = f.state.config.communityRoutes['game:community'];
  r.pushTypes = ['attention', 'quality'];
  r.pushTypeEnabledAt = { attention: '2026-10-14T22:00:00Z', quality: '2026-10-14T23:00:00Z' };
  assert.equal((await f.send()).sent, 2);
  assert(f.state.sent[0].markdown.text.includes('🟠 关注级'));
  assert(f.state.sent[1].markdown.text.includes('☀️ 社区亮点'));
  assert(f.state.sent[1].markdown.text.includes('AI 推荐理由'));
  assert(f.state.sent[1].markdown.text.includes('有详细阵容与通关步骤'));
  const scans = f.state.queries.filter(q => q.sql.includes('SELECT r.id'));
  assert(scans.every(q => q.sql.includes('AND r.started_at>=?')));
  assert.equal(scans[0].params[1].toISOString(), new Date(r.pushTypeEnabledAt.attention).toISOString());
  await f.send(); f.state.runs = [{ ...run, id: 'another' }]; await f.send();
  assert.equal(f.state.sent.length, 2);
});

test('overseas quality notification includes current Chinese translation and publisher identity', () => {
  const quality = {
    ...content,
    content_type: 'post',
    external_id: 'overseas-post-42',
    body: 'The matchmaking queue is too long',
    translated_title: '匹配队列等待时间过长',
    translated_body: '匹配队列等待时间过长，玩家建议优化匹配机制。',
    author_name: 'NightOwl',
    platform_author_id: 'steam-7788',
    quality_reason: '内容包含具体问题和可执行建议，具有社区参考价值',
  };
  const card = messages({ ...run, region_code: 'overseas' }, [quality], 0, 'quality')[0];
  assert(card.text.includes('☀️ 社区亮点'));
  assert(card.text.includes('**原文**\n\n> The matchmaking queue is too long'));
  assert(card.text.includes('**中文翻译**\n\n匹配队列等待时间过长，玩家建议优化匹配机制。'));
  assert(card.text.includes('发布人昵称：NightOwl'));
  assert(card.text.includes('发布人ID：steam\\-7788'));
  assert(card.text.includes('帖子ID：overseas\\-post\\-42'));
  assert(card.text.includes('**AI 推荐理由**'));
});

test('new types without activation fail closed and ordinary positive content is excluded', async t => {
  const f = await fixture(t, [{ ...content, sentiment: 'positive', severity: 'normal' }]);
  const r = f.state.config.communityRoutes['game:community']; r.pushTypes = ['quality'];
  assert.equal((await f.send()).sent, 0); assert.equal(f.state.queries.length, 0);
  r.pushTypeEnabledAt = { quality: '2026-10-14T23:00:00Z' };
  assert.equal((await f.send()).sent, 0);
  const sql = f.state.queries.find(q => q.sql.includes('SELECT DISTINCT')).sql;
  assert(sql.includes('q.content_fingerprint=c.fingerprint'));
  assert(sql.includes('q.quality_score >='));
});
test('notification link carries exact content community and Beijing publication day',()=>{const card=messages({...run,region_code:'overseas'},[{...content,quality_reason:'分享具体通关步骤供玩家参考',published_at:'2026-10-13 17:06:34',community_id:'other'}],0,'quality')[0];const link=card.text.match(/\[查看内容及完整分析\]\(([^)]+)\)/)[1];const url=new URL(link);assert.equal(url.searchParams.get('communityId'),'community');assert.equal(url.searchParams.get('regionCode'),'overseas');assert.equal(url.searchParams.get('publishedFrom'),'2026-10-14');assert.equal(url.searchParams.get('contentId'),'content');});

test('missing and placeholder quality reasons wait without settling or blocking other types; repaired reasons send once',async t=>{
  for(const quality_reason of ['', 'TypeSafe结构化质量及推荐判断']) {
    const good={...content,id:'good',quality_eligible:1,sentiment:'positive',severity:'normal',quality_reason:'分享前后排搭配与输出时机供卡关玩家参考'};
    const pending={...good,id:'pending',quality_reason};
    assert.throws(()=>messages(run,[pending],0,'quality'),{code:'QUALITY_REASON_REQUIRED'});
    const f=await fixture(t,[content,good,pending]);const route=f.state.config.communityRoutes['game:community'];
    route.pushTypes=['urgent','quality'];route.pushTypeEnabledAt={quality:'2026-10-14T23:00:00Z'};
    const first=await f.send();assert.equal(first.sent,2);assert.equal(first.waiting,1);
    assert(!f.state.sent.some(v=>v.markdown.text.includes('TypeSafe结构化')));
    const second=await f.send();assert.equal(second.sent,0);assert.equal(second.waiting,1);
    f.state.rows=[content,good,{...pending,quality_reason:good.quality_reason}];
    assert.equal((await f.send()).sent,1);assert.equal((await f.send()).sent,0);assert.equal(f.state.sent.length,3);
  }
});

test('delivery dates use Beijing midnight, rejecting older, future and invalid publication times', () => {
  const now = Date.parse('2026-10-15T16:00:00Z'); // Beijing 10/16 00:00
  assert.equal(deliveryDate('2026-10-14 15:59:59.999', now).eligible, false);
  assert.deepEqual(deliveryDate('2026-10-14 16:00:00', now), { eligible: true, backfill: true, day: '2026-10-15' });
  assert.deepEqual(deliveryDate(new Date(now), now), { eligible: true, backfill: false, day: '2026-10-16' });
  assert.equal(deliveryDate('2026-10-16T00:00:00+08:00', now).eligible, true);
  assert.equal(deliveryDate('2026-10-15 16:00:00.001', now).eligible, false);
  for (const value of [null, '', 'bad']) assert.equal(deliveryDate(value, now).eligible, false);
});

test('all push types reject historical backlog and mark only yesterday as backfill, retaining dedupe', async t => {
  for (const pushType of ['urgent', 'attention', 'quality']) {
    const base = { ...content, severity: pushType === 'attention' ? 'attention' : 'negative', quality_eligible: 1,
      sentiment: pushType === 'quality' ? 'positive' : 'negative', quality_reason: '分享具体阵容搭配与通关技巧供玩家参考' };
    const f = await fixture(t, [
      { ...base, id: 'old', published_at: '2026-10-13 15:59:59', analysis_pending: 1 },
      { ...base, id: 'yesterday', published_at: '2026-10-13 16:00:00' },
      { ...base, id: 'today', published_at: '2026-10-14 16:00:00' },
      { ...base, id: 'future', published_at: '2026-10-16 00:00:00' },
      { ...base, id: 'invalid', published_at: null },
    ]);
    const route = f.state.config.communityRoutes['game:community'];
    route.pushTypes = [pushType]; route.pushTypeEnabledAt = { [pushType]: route.enabledAt };
    const result = await f.send(); assert.equal(result.sent, 2); assert.equal(result.waiting, 0);
    assert(f.state.sent[0].markdown.title.startsWith('【补推 2026-10-14】'));
    assert(f.state.sent[0].markdown.text.includes('**补推说明：本条为 2026-10-14 发布的内容。**'));
    assert(!f.state.sent[1].markdown.title.includes('补推')); assert(!f.state.sent[1].markdown.text.includes('补推'));
    assert.equal((await f.send()).sent, 0);
  }
});

test('sending rechecks freshness and backfill label when a throttled batch crosses Beijing midnight', async t => {
  const f = await fixture(t, [
    { ...content, id: 'first', published_at: '2026-10-13 16:00:00' },
    { ...content, id: 'expires', published_at: '2026-10-13 17:00:00' },
    { ...content, id: 'becomes-yesterday', published_at: '2026-10-14 16:00:00' },
  ]);
  f.state.now = Date.parse('2026-10-15T15:59:59Z');
  const request = f.service.request;
  f.service.request = async (...args) => { const result = await request(...args); f.state.now = Date.parse('2026-10-15T16:00:00Z'); return result; };
  assert.equal((await f.send()).sent, 2);
  assert(f.state.sent[0].markdown.title.includes('补推 2026-10-14'));
  assert(f.state.sent[1].markdown.title.includes('补推 2026-10-15'));
  assert(f.state.sent[1].markdown.text.includes('contentId=becomes-yesterday'));
});
