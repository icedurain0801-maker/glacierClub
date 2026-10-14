const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const policy = require('../../../server/src/services/riskSeverityNormalizer');
const { AiAnalyzer } = require('../../../server/src/integrations/aiAnalyzer');
const { withContentHandling } = require('../../../server/src/services/contentHandling');
const crash = 'Hey all. So when I start rally’s to alliance boss my game crashes maybe like 1 out of 10 times. Pretty annoying cause loose time reconnecting and end up out of sync with other players. Is this a common thing or my phone issue?';
const base = { sentiment: 'negative', severity: 'urgent', negativeScore: 0.2, gameComplaint: false };
const env = { AI_ANALYSIS_ENABLED: 'true', AI_ANALYSIS_URL: 'http://127.0.0.1', AI_ANALYSIS_TOKEN: 'isolated-test', AI_ANALYSIS_MODEL: 'fixture' };
function parse(body, value) {
  const ai = new AiAnalyzer(env);
  const result = { i: 0, s: 'negative', v: 'urgent', n: 0.2, c: 0.1, gx: true, gc: false, ge: '', ui: 'none', ue: '', ...value };
  return ai.parseResponse({ choices: [{ message: { content: JSON.stringify([result]) } }] }, 1, ai.profiles.light, [], [{ body }])[0];
}
test('基准崩溃反馈有故障和影响，问句结尾、低分、模型误标咨询或紧急均为负面待处理', () => {
  for (const sentiment of ['negative', 'neutral']) for (const score of [0.1, 0.5, 0.6, 0.99]) {
    assert.equal(policy.normalizeSeverity({ ...base, sentiment, negativeScore: score, body: crash }).severity, 'negative');
  }
  assert.equal(parse(crash).severity, 'negative');
  assert.equal(parse(crash).gameComplaint, true);
});
test('负面强度严格50%边界，普通咨询、解决方法、正面分享、已解决和假设不因故障词升级', () => {
  for (const negativeScore of [0.499, 0.5, 0.501]) {
    assert.equal(policy.normalizeSeverity({ ...base, severity: 'attention', negativeScore, body: '感觉不太好玩' }).severity, negativeScore > 0.5 ? 'negative' : 'attention');
  }
  for (const body of ['请问崩溃反馈入口在哪？', 'Where is the crash FAQ?', 'My game does not crash', 'My game crashes were fixed', 'If my game crashes every time, what should I do?']) {
    assert.equal(policy.normalizeSeverity({ ...base, severity: 'attention', body }).severity, 'attention');
  }
  assert.equal(policy.normalizeSeverity({ ...base, sentiment: 'positive', body: crash }).severity, 'normal');
  assert.equal(policy.normalizeSeverity({ ...base, sentiment: 'neutral', body: '收到，谢谢' }).severity, 'normal');
});
test('紧急必须同时有严重影响原文、负面候选资格和AI严重决定，四类影响支持中英文', () => {
  const cases = [
    ['service_blocked', '连续3小时无法登录游戏'],
    ['service_blocked', 'I cannot play for hours'],
    ['widespread_outage', '全服宕机无法登录'],
    ['widespread_outage', 'All servers are down'],
    ['asset_loss', '全部道具丢失了'],
    ['asset_loss', 'All my items are gone'],
    ['account_security', '我的账号被盗'],
    ['account_security', 'My account was hacked']
  ];
  for (const [urgentImpact, body] of cases) {
    const input = { ...base, gameComplaint: true, body, urgentImpact, urgentEvidence: body };
    assert.equal(policy.normalizeSeverity(input).severity, 'urgent', body);
    assert.equal(policy.normalizeSeverity({ ...input, gameComplaint: false }).severity, 'urgent', body);
    assert.equal(policy.normalizeSeverity({ ...input, urgentImpact: 'none', gameComplaint: false }).severity, 'negative', body);
    assert.equal(policy.normalizeSeverity({ ...input, severity: 'attention' }).severity, 'negative');
    assert.equal(parse(body, { gc: true, ge: body, ui: urgentImpact, ue: body }).severity, 'urgent');
  }
});
test('高分、辱骂、虚构证据、错误影响类别、假设/否定/已解决及父帖证据不能升级紧急', () => {
  assert.equal(policy.normalizeSeverity({ ...base, negativeScore: 1, body: '很难玩，气死了', likes: 99999 }).severity, 'negative');
  assert.equal(parse(crash, { ui: 'account_security', ue: 'my game crashes' }).severity, 'negative');
  assert.equal(parse(crash, { ui: 'widespread_outage', ue: 'All servers are down' }).severity, 'negative');
  assert.equal(parse('奖励没到账', { gc: true, ge: '奖励没到账', ui: 'unknown', ue: '奖励没到账' }).severity, 'negative');
  for (const body of ['如果我的账号被盗会怎么办', '我的账号没有被盗', 'My account was hacked but it is now fixed', 'All servers are down? No, this was resolved.']) {
    const input = { ...base, gameComplaint: true, body, urgentImpact: 'account_security', urgentEvidence: body };
    assert.notEqual(policy.normalizeSeverity(input).severity, 'urgent', body);
  }
  assert.equal(policy.normalizeSeverity({ ...base, negativeScore: 0.9, body: '我只是回复收到', parentBody: '全服宕机无法登录' }).severity, 'negative');
});
test('轻量/深度提示词基准一致，新缓存版本与旧版不同；持久化和重复归一化保留严重证据', () => {
  const ai = new AiAnalyzer(env);
  for (const profile of Object.values(ai.profiles)) {
    const system = ai.buildMessages([{ body: crash }], profile)[0].content;
    for (const text of ['每十次崩溃一次', '不能当成普通咨询', 'urgent_evidence', '最高等级互斥单选']) assert(system.includes(text));
  }
  const first = parse('我的账号被盗', { gc: true, ge: '我的账号被盗', ui: 'account_security', ue: '我的账号被盗' });
  const twice = policy.normalizeAnalysisResult(first);
  assert.equal(twice.severity, 'urgent');
  const stored = { sentiment: 'negative', severity: 'urgent', negative_score: 0.2, risk_context: JSON.stringify({ gameComplaint: twice.gameComplaint, rawAnalysis: twice.rawAnalysis, originalSeverity: twice.originalSeverity }) };
  assert.equal(policy.normalizeAnalysisResult(stored).severity, 'urgent');
  assert.equal(policy.normalizeAnalysisResult(stored, { body: '只是普通回复' }).severity, 'negative');
  assert.equal(policy.normalizeAnalysisResult(parse(crash)).severity, 'negative');
  assert.equal(first.riskPolicyVersion, 'game-impact-evidence-v7');
});
test('Worker、数据库落库及缓存再次归一化保留已验证严重证据，崩溃反馈保持负面', async () => {
  const { normalizePersistedAnalysis } = require('../../../worker/src/worker');
  const { Repository } = require('../../../server/src/db/repository');
  const rows = [];
  const conn = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async (sql, args) => {
      if (sql.startsWith('SELECT game_id')) return [[{ fingerprint: 'test', body: '我的账号被盗' }]];
      if (sql.startsWith('SELECT *')) return [[]];
      rows.push({ sql, args }); return [{ affectedRows: 1 }];
    }
  };
  const repo = Object.create(Repository.prototype); repo.pool = { getConnection: async () => conn };
  const modelResult = parse('我的账号被盗', { gc: true, ge: '我的账号被盗', ui: 'account_security', ue: '我的账号被盗' });
  const workerResult = normalizePersistedAnalysis(modelResult);
  assert.equal(workerResult.severity, 'urgent');
  let written;
  await repo.writeAnalysisWithAudit('content', workerResult, async (_, result) => { written = result; });
  assert.equal(written.severity, 'urgent');
  const context = JSON.parse(rows.find(row => row.sql.startsWith('UPDATE po_analyses')).args[0]);
  assert.equal(context.rawAnalysis.verifiedEvidenceText, '我的账号被盗');
  const persisted = { sentiment: 'negative', severity: 'urgent', negative_score: 0.2, risk_context: JSON.stringify(context) };
  assert.equal(normalizePersistedAnalysis(persisted).severity, 'urgent');
  rows.length = 0;
  await repo.writeAnalysisWithAudit(null, { ...written, cacheKey: 'cache' }, async (_, result) => { assert.equal(result.severity, 'urgent'); });
  assert(rows.some(row => row.sql.startsWith('UPDATE po_analysis_cache')));
  assert.equal(normalizePersistedAnalysis(parse(crash)).severity, 'negative');
});
test('关键词告警入口不能绕过等级判定；有真实账号安全证据才可进入紧急告警链路', async () => {
  const { AlertEngine } = require('../../../server/src/pipeline/alertEngine');
  let linked = 0;
  const repo = { findOpenAlert: async () => ({ id: 'existing', ding_talk_status: 'not_sent' }), linkAlertContent: async () => { linked++; } };
  const engine = new AlertEngine(repo, { send: async () => { throw new Error('no external message permitted'); } });
  const game = { id: 'game', community_id: 'community' };
  const content = { id: 'content', game_id: 'game', community_id: 'community', body: crash };
  assert.deepEqual(await engine.process({ game, content, hit: { needAI: true, matchedKeywords: ['crash'] }, analysis: parse(crash) }), []);
  assert.equal(linked, 0);
  const body = '我的账号被盗';
  const urgent = parse(body, { gc: true, ge: body, ui: 'account_security', ue: body });
  assert.equal((await engine.processAiUrgent({ game, content: { ...content, body }, analysis: urgent })).length, 1);
  assert.equal(linked, 1);
});
test('真实本地HTTP分析接口与有界面浏览器：四档同表显示、处理选择过滤和详情', async t => {
  const bodies = ['请问崩溃反馈入口在哪？', crash, '全服宕机无法登录', '分享游戏闪退已修复的方法'];
  const values = [
    { s: 'neutral', v: 'normal', n: 0.1, gx: true, gc: false, ge: '', ui: 'none', ue: '' },
    { s: 'negative', v: 'urgent', n: 0.1, gx: true, gc: false, ge: '', ui: 'none', ue: '' },
    { s: 'negative', v: 'urgent', n: 0.2, gx: true, gc: true, ge: bodies[2], ui: 'widespread_outage', ue: bodies[2] },
    { s: 'positive', v: 'attention', n: 0.1, gx: false, gc: false, ge: '', ui: 'none', ue: '' }
  ];
  let calls = 0;
  const server = http.createServer(async (req, res) => {
    let bytes = ''; for await (const chunk of req) bytes += chunk;
    const request = JSON.parse(bytes); assert(request.messages[0].content.includes('每十次崩溃一次'));
    calls++; res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(values.map((v, i) => ({ i, c: 0.1, d: false, r: '隔离分析证据场景', t: [], m: bodies[i].slice(0, 20), ...v }))) } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const ai = new AiAnalyzer({ ...env, AI_ANALYSIS_URL: `http://127.0.0.1:${server.address().port}`, AI_ANALYSIS_BATCH_SIZE: '10' });
    const outputs = await ai.analyzeBatch(bodies.map(body => ({ body })));
    assert.equal(calls, 1); assert.deepEqual(outputs.map(o => o.severity), ['attention', 'negative', 'urgent', 'normal']);
    const rows = await withContentHandling({ query: async () => [] }, outputs.map((o, i) => ({ ...o, id: `11111111-1111-4111-8111-11111111111${i}`, body: bodies[i], content_type: 'post', analysis_status: 'completed', analysis_level: 'light', published_at: '2026-10-11 09:35:20' })));
    assert.deepEqual(rows.map(r => r.handling_status), ['pending', 'pending', 'pending', 'not_required']);
    if (process.env.PO_RISK_V7_BROWSER_TEST === '1') {
      const { chromium } = require('playwright');
      const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false });
      try {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } }), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/api/public-opinion/contents**', async route => {
          const url = new URL(route.request().url());
          const data = url.pathname.endsWith('/stats') ? { post: 4, comment: 0, negative: 1, attention: 1 } : rows;
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data, meta: { total: 4 } }) });
        });
        await page.goto('https://lfy3001.dev.q1op.com/admin/PublicOpinion/content.html?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=discord', { waitUntil: 'domcontentloaded' });
        await page.locator('[data-handling-id]').first().waitFor();
        assert.deepEqual(await page.locator('tbody .severity').allTextContents(), ['关注', '负面待处理', '紧急', '正常']);
        assert.equal(await page.locator('[data-handling-id]:disabled').count(), 1);
        await page.locator('#handlingSelectAll').check(); assert.equal(await page.locator('[data-handling-id]:checked').count(), 3);
        await page.locator('#batchHandleBtn').click(); assert.equal(await page.locator('#handlingDialogCount').innerText(), '将处理已勾选的 3 条内容');
        await page.locator('#handlingCancel').click();
        await page.screenshot({ path: path.resolve(__dirname, '../../../../../.temp/risk-algorithm-v7-browser.png') });
        assert.deepEqual(errors, []);
        t.diagnostic('Edge有界面四档场景和全选过滤通过；内容数据为实际新算法对隔离HTTP分析响应的结果，未写正式业务库');
      } finally { await browser.close(); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
