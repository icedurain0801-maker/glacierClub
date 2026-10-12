const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const context = await chromium.launchPersistentContext(process.env.PO_TEST_PROFILE, {
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: false, serviceWorkers: 'block', viewport: { width: 1920, height: 1080 },
  });
  const results = [];
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.log('Browser error: ' + e.message); });
    await page.goto('https://club-opinion.q1.com/admin/PublicOpinion/collection-runs.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.PublicOpinionAuth?.currentUser()?.permissions.manage === true);
    if (process.env.PO_TEST_CANDIDATE === '1') {
      await page.addStyleTag({ path: path.resolve(__dirname, '../../../../admin/PublicOpinion/assets/collection-runs-layout.css') });
    }
    for (const region of ['overseas', 'domestic']) {
      console.log('Testing region: ' + region);
      await page.locator('[data-po-region]').selectOption(region);
      await page.waitForFunction(expected => {
        const scope = window.PublicOpinionScope.selected();
        const cell = document.querySelector('#rows td[data-label="归属范围"]');
        return scope.regionCode === expected && cell?.textContent.includes(scope.regionLabel) && cell?.textContent.includes(scope.communityLabel);
      }, region);
      await page.waitForTimeout(1000);
      const api = await page.evaluate(async () => {
        const q = window.PublicOpinionScope.query();
        const response = await fetch('/api/public-opinion/sync-runs?' + q, { signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/json' } });
        const payload = await response.json();
        const rows = Array.isArray(payload.data) ? payload.data : payload.data.items || payload.data.rows || [];
        return { status: response.status, count: rows.length, hasStartTime: rows.every(r => Boolean(r.startedAt || r.started_at || r.createdAt || r.created_at)) };
      });
      assert.equal(api.status, 200);
      assert(api.count > 0 && api.hasStartTime);
      for (const width of [1920, 1440, 375]) {
        await page.setViewportSize({ width, height: 1080 });
        const layout = await page.evaluate(() => {
          const table = document.querySelector('.table');
          const cells = [...document.querySelectorAll('#rows tr:first-child td')];
          return {
            scope: document.querySelector('#rows td[data-label="归属范围"]').textContent,
            tableWidth: table.getBoundingClientRect().width,
            statusWidth: cells[5].getBoundingClientRect().width,
            statusHeight: Math.max(...[...document.querySelectorAll('#rows td[data-label="状态"]')].map(e => e.getBoundingClientRect().height)),
            cells: cells.length,
            timesVisible: cells.slice(6, 8).every(e => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0),
            startTime: /\d{4}-\d{2}-\d{2}/.test(cells[6].textContent),
            actionsVisible: cells[10].querySelector('[data-expand]').getBoundingClientRect().width > 0,
            lastCellRight: cells[10].getBoundingClientRect().right,
          };
        });
        assert.equal(layout.cells, 11);
        assert(layout.timesVisible && layout.startTime && layout.actionsVisible);
        assert(layout.statusWidth < 600);
        assert(layout.statusHeight < 180);
        assert(layout.tableWidth <= 1800);
        if (width === 1920) assert(layout.lastCellRight < 1920);
        results.push({ region, width, api, layout });
      }
      await page.setViewportSize({ width: 1920, height: 1080 });
      if (process.env.PO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PO_SCREENSHOT_DIR, `runs-${region}.png`), fullPage: true });
      assert(await page.locator('[data-expand]').first().isEnabled());
      await page.locator('[data-expand]').first().click();
      await page.waitForSelector('.run-detail');
      await page.locator('[data-collapse]').click();
      await page.locator('#refreshBtn').click();
      await page.waitForFunction(() => document.querySelector('#rows td[data-label="抓取时间"]'));
    }
    assert.deepEqual(errors, []);
    const phase = process.env.PO_TEST_CANDIDATE === '1' ? 'preflight' : 'live';
    fs.writeFileSync(path.join(__dirname, `collection-runs-layout-${phase}.json`), JSON.stringify({ passed: true, phase, businessWrites: false, errors, results }, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, phase, cases: results.length, apiVerified: true, refreshVerified: true, expandVerified: true }));
  } finally {
    await context.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
