const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseBatchHandling, handleContents, withContentHandling } = require('../../../server/src/services/contentHandling');
const ui = require('../../../../admin/PublicOpinion/assets/content-handling');
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const input = { contentIds: ids, handlingMethod: 'handled', handlingNote: '' };
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

test('批量参数校验覆盖三种方式、必填、200字符、Unicode、去重和非法字段', () => {
  for (const handlingMethod of ['notified', 'handled', 'false_positive']) assert.equal(parseBatchHandling({ ...input, handlingMethod }).handlingMethod, handlingMethod);
  assert.equal(parseBatchHandling({ ...input, contentIds: [...ids, ids[0]] }).contentIds.length, 2);
  assert.equal([...parseBatchHandling({ ...input, handlingNote: '😀'.repeat(200) }).handlingNote].length, 200);
  for (const body of [null, {}, { ...input, contentIds: [] }, { ...input, contentIds: ['bad'] }, { ...input, contentIds: Array(101).fill(ids[0]) }, { ...input, handlingMethod: '' }, { ...input, handlingMethod: 'pending' }, { ...input, handlingNote: 1 }, { ...input, handlingNote: '中'.repeat(201) }, { ...input, extra: 'unsupported' }]) assert.throws(() => parseBatchHandling(body), { code: 'INVALID_INPUT' });
});

test('状态默认待处理，备注10字符边界、悬停全文和HTML转义', () => {
  assert.match(ui.statusHtml({}, esc), /待处理/);
  assert.equal(ui.shortenedNote('一二三四五六七八九十'), '一二三四五六七八九十');
  assert.equal(ui.shortenedNote('一二三四五六七八九十一'), '一二三四五六七八九十...');
  assert.equal(ui.shortenedNote('😀'.repeat(11)), '😀'.repeat(10) + '...');
  const html = ui.statusHtml({ handling_status: 'processed', handling_method: 'notified', handling_note: '处理说明<script>alert(1)</script>' }, esc);
  assert.match(html, /已处理/); assert.match(html, /已通知玩家/); assert.match(html, /title="处理说明&lt;script>/); assert.doesNotMatch(html, /<script>/);
});

test('任一内容越界时整批回滚，不写处理或审计记录', async () => {
  const calls = [];
  const conn = { beginTransaction: async () => calls.push('begin'), query: async (sql, params) => { calls.push(sql); assert.deepEqual(params, [...ids, 'domestic', 'community', 'bigplayer_h5']); return [[{ id: ids[0] }]]; }, commit: async () => calls.push('commit'), rollback: async () => calls.push('rollback'), release: () => calls.push('release') };
  await assert.rejects(handleContents({ pool: { getConnection: async () => conn } }, input, { regionCode: 'domestic', communityId: 'community', platform: 'bigplayer_h5' }), { code: 'CONTENT_SCOPE_MISMATCH' });
  assert.deepEqual(calls.slice(-2), ['rollback', 'release']); assert(!calls.includes('commit')); assert(!calls.some(c => c.startsWith('INSERT')));
});

test('审计失败也回滚处理记录', async () => {
  const calls = [];
  const conn = { beginTransaction: async () => {}, query: async sql => { calls.push(sql); if (sql.startsWith('SELECT')) return [ids.map(id => ({ id }))]; if (sql.includes('po_audit_events')) throw new Error('audit unavailable'); return [{ affectedRows: 2 }]; }, commit: async () => calls.push('commit'), rollback: async () => calls.push('rollback'), release: () => calls.push('release') };
  await assert.rejects(handleContents({ pool: { getConnection: async () => conn } }, input), /audit unavailable/);
  assert(!calls.includes('commit')); assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
});

test('列表批量加载处理状态，无处理记录时默认待处理', async () => {
  const items = ids.map(id => ({ id }));
  const rows = await withContentHandling({ query: async () => [{ content_id: ids[0], handling_method: 'handled', handling_note: '备注' }] }, items);
  assert.equal(rows[0].handling_status, 'processed'); assert.equal(rows[1].handling_status, 'pending'); assert.equal(rows[0].handling_note, '备注');
});

test('真实HTTP接口与隔离MySQL：持久化、重读、三种方式、越界和删除保护', async t => {
  require('../../../server/src/runtimeEnv').loadRuntimeEnv();
  const mysql = require('mysql2/promise');
  const database = 'public_opinion_content_handling_test';
  const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  const config = url ? { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) } : { host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '' };
  const admin = await mysql.createConnection(config);
  await admin.query(`CREATE DATABASE IF NOT EXISTS ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await admin.end();
  process.env.DB_NAME = database;
  if (url) { url.pathname = '/' + database; process.env.DATABASE_URL = url.toString(); }
  const app = require('../../../server/src/app'), repo = app.repo;
  try {
    const [identity] = await repo.query('SELECT DATABASE() AS name'); assert.equal(identity.name, database);
    await repo.query('CREATE TABLE IF NOT EXISTS po_games (id CHAR(36) PRIMARY KEY, region_code VARCHAR(20))');
    await repo.query('CREATE TABLE IF NOT EXISTS po_sources (id CHAR(36) PRIMARY KEY, game_id CHAR(36), platform VARCHAR(40))');
    await repo.query('CREATE TABLE IF NOT EXISTS po_contents (id CHAR(36) PRIMARY KEY, game_id CHAR(36), community_id CHAR(36), source_id CHAR(36), account_id CHAR(36), content_type VARCHAR(20), body TEXT, is_deleted TINYINT DEFAULT 0)');
    await repo.query('CREATE TABLE IF NOT EXISTS po_audit_events (id CHAR(36) PRIMARY KEY,game_id CHAR(36),source_id CHAR(36),account_id CHAR(36),actor_type VARCHAR(30),actor_id VARCHAR(160),event_type VARCHAR(80),outcome VARCHAR(30),detail JSON)');
    await repo.query(fs.readFileSync(path.join(__dirname, '../../../migrations/033_content_handlings.sql'), 'utf8'));
    await repo.query('INSERT IGNORE INTO po_games VALUES (?,?)', [ids[0], 'domestic']);
    await repo.query('INSERT IGNORE INTO po_sources VALUES (?,?,?)', [ids[0], ids[0], 'bigplayer_h5']);
    for (const [index, id] of ids.entries()) await repo.query('INSERT IGNORE INTO po_contents (id,game_id,community_id,source_id,content_type,body) VALUES (?,?,?,?,?,?)', [id, ids[0], ids[0], ids[0], index ? 'comment' : 'post', '隔离测试内容']);
    await repo.query('DELETE FROM po_content_handlings WHERE content_id IN (?,?)', ids);
    const simpleRead = filters => repo.query('SELECT * FROM po_contents WHERE is_deleted=0 AND (? IS NULL OR id=?)', [filters.contentId || null, filters.contentId || null]);
    repo.listContentTree = simpleRead; repo.listContents = simpleRead; repo.getContentTree = id => simpleRead({ contentId: id }); repo.countContents = async () => 2;
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}/api/public-opinion`;
    const post = async (body, scope = 'regionCode=domestic&platform=bigplayer_h5') => { const response = await fetch(`${base}/contents/batch-handle?${scope}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
    for (const handlingMethod of ['notified', 'handled', 'false_positive']) {
      const result = await post({ ...input, handlingMethod, handlingNote: '测试处理备注一二三四五六七八九十' });
      assert.equal(result.status, 200); assert.equal(result.body.data.processedCount, 2);
      const list = await (await fetch(`${base}/contents?contentType=post`)).json();
      assert(list.data.every(item => item.handling_status === 'processed' && item.handling_method === handlingMethod));
      const detail = await (await fetch(`${base}/contents/${ids[0]}`)).json(); assert.equal(detail.data.content.handling_method, handlingMethod);
    }
    const maxNote = await post({ ...input, handlingNote: '😀'.repeat(200) });
    assert.equal(maxNote.status, 200);
    const maxRows = await repo.withContentHandling(ids.map(id => ({ id })));
    assert.equal([...maxRows[0].handling_note].length, 200);
    assert.equal((await post({ ...input, handlingMethod: '' })).status, 400);
    assert.equal((await post({ ...input, handlingNote: '中'.repeat(201) })).status, 400);
    assert.equal((await post(input, 'regionCode=overseas')).status, 409);
    if (process.env.PO_HANDLING_BROWSER_TEST === '1') {
      await repo.query('DELETE FROM po_content_handlings WHERE content_id IN (?,?)', ids);
      repo.resolveCommunityCanonical = async () => ({ regionCode: 'domestic', gameId: ids[0], communityId: ids[0] });
      const { chromium } = require('playwright');
      const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false });
      try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
        let writes = 0, failNext = false;
        page.on('pageerror', error => errors.push(error.message));
        const frontendRoot = path.resolve(__dirname, '../../../../admin/PublicOpinion');
        await page.route('**/admin/PublicOpinion/content.html?**', route => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(frontendRoot, 'content.html'), 'utf8') }));
        for (const file of ['content.js', 'content-handling.js', 'content-handling.css']) await page.route(`**/admin/PublicOpinion/assets/${file}*`, route => route.fulfill({ contentType: file.endsWith('css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(frontendRoot, 'assets', file), 'utf8') }));
        await page.route('**/api/public-opinion/contents**', async route => {
          const request = route.request(), url = new URL(request.url());
          if (url.pathname.endsWith('/batch-handle')) {
            writes += 1;
            if (failNext) { failNext = false; return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { message: '隔离测试：内容范围已变化' } }) }); }
            const response = await fetch(`${base}/contents/batch-handle${url.search}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: request.postData() });
            return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
          }
          if (url.pathname.endsWith('/stats')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { post: 1, comment: 1, negative: 2, attention: 0 } }) });
          const rows = await repo.withContentHandling(await simpleRead({}));
          const data = rows.map(item => ({ ...item, published_at: '2026-10-11 08:00:00', title: item.content_type === 'post' ? '隔离测试帖子' : null, sentiment: 'negative', severity: 'negative', analysis_status: 'completed', analysis_level: 'deep' }));
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data, meta: { total: 2 } }) });
        });
        await page.goto('https://lfy3001.dev.q1op.com/admin/PublicOpinion/content.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5', { waitUntil: 'domcontentloaded' });
        await page.locator('[data-handling-id]').first().waitFor();
        assert.equal(await page.locator('[data-handling-id]').count(), 2);
        assert.equal(await page.locator('#tableContent th').filter({ hasText: '处理状态' }).count(), 1);
        assert.equal(await page.locator('#tableContent th').filter({ hasText: '来源 / 账号' }).count(), 0);
        assert(await page.locator('#batchHandleBtn').isDisabled());
        await page.locator('[data-handling-id]').first().check();
        assert.equal(await page.locator('#handlingSelectAll').evaluate(e => e.indeterminate), true);
        await page.locator('#handlingSelectAll').check();
        await page.locator('#batchHandleBtn').click();
        assert.equal(await page.locator('#handlingMethod').inputValue(), 'handled');
        assert.deepEqual(await page.locator('#handlingMethod option').allTextContents(), ['已通知玩家', '已处理', '误判不予处理']);
        await page.locator('#handlingNote').fill('中'.repeat(201));
        assert.equal([...(await page.locator('#handlingNote').inputValue())].length, 200);
        await page.locator('#handlingNote').fill('');
        await page.locator('#handlingSubmit').click();
        await page.waitForFunction(() => document.querySelectorAll('.handling-status.processed').length === 2);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelectorAll('.handling-status.processed').length === 2);
        const note = '玩家问题已经记录并通知负责人';
        await page.locator('[data-handling-id]').first().check(); await page.locator('#batchHandleBtn').click();
        const beforeInvalid = writes;
        await page.locator('#handlingMethod').evaluate(e => { e.value = ''; }); await page.locator('#handlingSubmit').click();
        assert.equal(writes, beforeInvalid);
        await page.locator('#handlingMethod').selectOption('notified'); await page.locator('#handlingNote').fill(note); await page.locator('#handlingSubmit').click();
        await page.locator('.handling-note').first().waitFor();
        assert.equal(await page.locator('.handling-note').first().innerText(), [...note].slice(0, 10).join('') + '...');
        await page.locator('.handling-note').first().hover(); assert.equal(await page.locator('.handling-note').first().getAttribute('title'), note);
        await page.locator('[data-handling-id]').first().check(); await page.locator('#batchHandleBtn').click(); await page.locator('#handlingMethod').selectOption('false_positive');
        failNext = true; await page.locator('#handlingSubmit').click(); await page.locator('#handlingFormError').filter({ hasText: '处理失败' }).waitFor();
        assert.equal(await page.locator('[data-handling-id]').first().isChecked(), true); assert.equal(await page.locator('#handlingMethod').inputValue(), 'false_positive');
        const beforeCancel = writes; await page.locator('#handlingCancel').click(); assert.equal(writes, beforeCancel);
        await page.locator('[data-date-preset="yesterday"]').click();
        await page.waitForFunction(() => document.querySelector('#handlingSelectionCount').textContent === '已选择 0 条');
        await page.locator('[data-handling-id]').first().waitFor(); await page.locator('[data-handling-id]').first().check(); await page.locator('#batchHandleBtn').click();
        await page.setViewportSize({ width: 375, height: 900 });
        const rect = await page.locator('#batchHandlingDialog').evaluate(e => ({ width: e.getBoundingClientRect().width, client: e.clientWidth, scroll: e.scrollWidth }));
        assert(rect.width <= 375 && rect.scroll <= rect.client + 1);
        await page.screenshot({ path: path.resolve(__dirname, '../../../../../.temp/content-handling-browser-375.png') });
        await page.locator('#handlingCancel').click(); assert.deepEqual(errors, []);
        t.diagnostic('Edge 有界面：完整勾选/保存/刷新重读、必填、备注截断悬停、失败保留选择、取消、筛选清空与375px弹窗通过；所有保存写隔离库');
      } finally { await browser.close(); }
    }
    await repo.query('UPDATE po_contents SET is_deleted=1 WHERE id=?', [ids[1]]);
    assert.equal((await post(input)).status, 409);
    const audits = await repo.query("SELECT COUNT(*) AS count FROM po_audit_events WHERE event_type='content_handled'"); assert(Number(audits[0].count) >= 6);
    t.diagnostic('仅使用 public_opinion_content_handling_test，未写真实业务库');
  } finally {
    await new Promise(resolve => app.server.listening ? app.server.close(resolve) : resolve());
    await repo.query('DELETE FROM po_content_handlings WHERE content_id IN (?,?)', ids);
    await repo.query('DELETE FROM po_audit_events WHERE game_id=?', [ids[0]]);
    await repo.query('DELETE FROM po_contents WHERE id IN (?,?)', ids);
    await repo.query('DELETE FROM po_sources WHERE id=?', [ids[0]]);
    await repo.query('DELETE FROM po_games WHERE id=?', [ids[0]]);
    await repo.pool.end();
  }
});
