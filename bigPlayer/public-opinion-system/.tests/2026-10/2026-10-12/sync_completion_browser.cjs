const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const origin = 'https://lfy3001.dev.q1op.com';
const sourceId = '4e7cb565-53d8-4bbd-9364-fe5755b9af8f';
const runId = '6c95fe87-aeb5-46f7-ad85-a74176cf0064';
const communityId = '8b1f0000000000000000000000000009';

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false });
  const evidence = { at: new Date().toISOString(), browser: 'Edge', headless: false, realWrites: 0 };
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.url().includes('/sync-runs/') && r.status() >= 400) errors.push(`run API ${r.status()}`); });
    await page.addInitScript(({ sourceId, runId }) => localStorage.setItem('publicOpinionActiveSyncRun', JSON.stringify({ id: runId, sourceId, status: 'queued' })), { sourceId, runId });
    await page.goto(`${origin}/admin/PublicOpinion/sources.html?regionCode=domestic&communityId=${communityId}&syncSourceId=${sourceId}&syncRunId=${runId}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.sync-progress-status').filter({ hasText: '爬取结束（部分完成）' }).waitFor();
    await page.waitForFunction(() => window.PublicOpinionSyncDock?.snapshot()?.status === 'partial');
    const api = await page.request.get(`${origin}/api/public-opinion/sync-runs/${runId}?regionCode=domestic&communityId=${communityId}`);
    assert.equal(api.status(), 200);
    const run = (await api.json()).data;
    assert.equal(run.status, 'partial');
    await page.locator('.sync-progress-value').filter({ hasText: `已采集 ${run.post_count} 条帖子、${run.actual_comment_body_count} 条评论` }).waitFor();
    await page.waitForFunction(({ posts, comments }) => {
      const dock = document.querySelector('#syncRunDock');
      return dock?.innerText.includes(`帖子 ${posts} · 评论 ${comments}`);
    }, { posts: run.post_count, comments: run.actual_comment_body_count });
    const text = await page.locator('.sync-progress').innerText();
    assert(text.includes(`已采集 ${run.post_count} 条帖子、${run.actual_comment_body_count} 条评论`), text);
    assert(text.includes('站点分页上限'));
    assert(!text.includes('99%'));
    assert(!text.includes('评论内容接口暂不支持'));
    assert.equal(await page.locator('#syncRunDock [data-sync-run-action=cancel]').isDisabled(), true);
    await page.screenshot({ path: path.join(__dirname, 'sync_completion_live.png') });
    evidence.live = { status: run.status, postCount: run.post_count, commentCount: run.actual_comment_body_count, dockStatus: 'partial', errors };
    assert.deepEqual(errors, []);

    // Isolated browser fixture: only the clicked sync mutation and its run are mocked.
    // No real collection request or source update is sent.
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const fixture = await context.newPage();
    let phase = 'queued', syncClicks = 0;
    const fixtureRunId = 'browser-fixture-sync-completion';
    const fixtureRun = () => ({ id: fixtureRunId, source_id: sourceId, status: phase, post_count: phase === 'queued' ? 0 : 35,
      fetched_count: phase === 'queued' ? 0 : 35, discovered_count: phase === 'queued' ? 0 : 35,
      actual_comment_body_count: phase === 'completed_authorized_scope' ? 155 : 12 });
    await fixture.route('**/api/public-opinion/**', async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() !== 'GET') {
        assert.equal(url.pathname, `/api/public-opinion/sources/${sourceId}/sync`);
        syncClicks++;
        return route.fulfill({ json: { data: { run: fixtureRun() } } });
      }
      if (url.pathname === `/api/public-opinion/sync-runs/${fixtureRunId}`) {
        assert.equal(url.searchParams.has('platform'), false);
        return route.fulfill({ json: { data: fixtureRun() } });
      }
      if (url.pathname === `/api/public-opinion/sync-runs/${fixtureRunId}/contents`) return route.fulfill({ json: { data: [], meta: { hasMore: false } } });
      return route.continue();
    });
    await fixture.goto(`${origin}/admin/PublicOpinion/sources.html?regionCode=domestic&communityId=${communityId}`, { waitUntil: 'domcontentloaded' });
    await fixture.locator(`[data-sync-source="${sourceId}"]`).click();
    await fixture.locator('.sync-progress-status').filter({ hasText: '等待执行' }).waitFor();
    phase = 'running';
    await fixture.locator('.sync-progress-status').filter({ hasText: '同步中' }).waitFor();
    assert(!((await fixture.locator('.sync-progress').innerText()).includes('99%')));
    assert.equal(await fixture.locator('.sync-progress-bar').getAttribute('aria-valuenow'), null);
    phase = 'completed_authorized_scope';
    await fixture.locator('.sync-progress-status').filter({ hasText: '爬取完成' }).waitFor();
    await fixture.waitForFunction(() => window.PublicOpinionSyncDock?.snapshot()?.status === 'completed_authorized_scope');
    assert.equal(syncClicks, 1);
    assert.equal(await fixture.locator('#syncRunDock [data-sync-run-action=cancel]').isDisabled(), true);
    evidence.fixture = { syncClicks, states: ['queued', 'running', 'completed_authorized_scope'], noFalse99Percent: true, cancelDisabledAtCompletion: true };
    await fixture.screenshot({ path: path.join(__dirname, 'sync_completion_fixture.png') });
    await context.close();
    fs.writeFileSync(path.join(__dirname, 'sync_completion_browser_result.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
