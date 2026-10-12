const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const sourceId = '8c690d6e-12ea-4ad3-b434-d941276c4906';
const origin = 'https://club-opinion.q1.com';
(async () => {
  const context = await chromium.launchPersistentContext(process.env.PO_TEST_PROFILE, {
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false,
    serviceWorkers: 'block', viewport: { width: 1920, height: 1080 },
  });
  try {
    if (process.env.PO_SOURCES_CANDIDATE) await context.route('**/assets/sources.js*', route => route.fulfill({ path: process.env.PO_SOURCES_CANDIDATE, contentType: 'application/javascript' }));
    const page = await context.newPage(), errors = [], results = [];
    page.on('pageerror', e => errors.push(e.message));
    const syncPath = `/api/public-opinion/sources/${sourceId}/sync`;
    const conflicts = ['PREVIOUS_RUN_ACTIVE', 'SYNC_CHECKPOINT_ACTIVE', 'SOURCE_SCHEDULE_LEASE_ACTIVE'];
    for (const code of conflicts) {
      await page.route(origin + syncPath + '*', async route => {
        if (route.request().method() === 'POST') await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code, message: 'task active' } }) });
        else await route.continue();
      });
      await page.goto(origin + '/admin/PublicOpinion/sources.html?regionCode=overseas&communityId=8b1f0000000000000000000000100016&platform=bigplayer_h5', { waitUntil: 'networkidle' });
      await page.locator(`[data-sync-source="${sourceId}"]`).click();
      await page.waitForSelector('.sync-progress');
      await page.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('已打开现有任务进度'));
      assert.doesNotMatch(await page.locator('#toast').textContent(), /同步失败/);
      const latest = await page.evaluate(async id => {
        const r = await fetch(`/api/public-opinion/sources/${id}/sync-runs/latest`, { headers: { 'content-type': 'application/json' } });
        const b = await r.json(), run = b.data.run || b.data;
        return { status: r.status, runId: run.id || run.runId, state: run.status, siteTotal: run.siteTotal || run.site_total };
      }, sourceId);
      assert.equal(latest.status, 200);
      assert(['queued', 'running', 'pausing', 'cancelling'].includes(latest.state));
      results.push({ code, progressVisible: true, latest });
      await page.unroute(origin + syncPath + '*');
    }
    if (!process.env.PO_SOURCES_CANDIDATE) {
      await page.goto(origin + '/admin/PublicOpinion/sources.html?regionCode=overseas&communityId=8b1f0000000000000000000000100016&platform=bigplayer_h5', { waitUntil: 'networkidle' });
      const pending = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === syncPath);
      await page.locator(`[data-sync-source="${sourceId}"]`).click();
      const response = await pending, body = await response.json();
      assert(response.status() === 200 || (response.status() === 409 && conflicts.includes(body.error?.code)));
      await page.waitForSelector('.sync-progress');
      assert.doesNotMatch(await page.locator('#toast').textContent(), /同步失败|internal server error/);
      results.push({ realClick: true, status: response.status(), code: body.error?.code || null, progressVisible: true });
    }
    assert.deepEqual(errors, []);
    const phase = process.env.PO_SOURCES_CANDIDATE ? 'preflight' : 'live';
    fs.writeFileSync(path.join(__dirname, `sync-recovery-browser-${phase}.json`), JSON.stringify({ passed: true, phase, errors, results }, null, 2) + '\n');
    if (process.env.PO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PO_SCREENSHOT_DIR, `sync-recovery-${phase}.png`) });
    console.log(JSON.stringify({ passed: true, phase, cases: results.length }));
  } finally { await context.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
