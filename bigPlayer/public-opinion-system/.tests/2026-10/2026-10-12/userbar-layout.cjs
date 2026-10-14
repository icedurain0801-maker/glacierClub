const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const context = await chromium.launchPersistentContext(process.env.PO_TEST_PROFILE, {
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: false, serviceWorkers: 'block', viewport: { width: 1920, height: 1080 },
  });
  try {
    if (process.env.PO_AUTH_CANDIDATE) await context.route('**/assets/baas-auth.js*', route => route.fulfill({ path: process.env.PO_AUTH_CANDIDATE, contentType: 'application/javascript' }));
    const page = await context.newPage(), errors = [], results = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const name of ['index', 'content', 'alerts', 'sources', 'keywords', 'collection-runs']) {
      await page.goto(`https://club-opinion.q1.com/admin/PublicOpinion/${name}.html`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.PublicOpinionAuth?.currentUser()?.permissions.manage === true);
      const apiStatus = await page.evaluate(async () => (await fetch('/api/public-opinion/games', { headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10000) })).status);
      assert.equal(apiStatus, 200);
      assert.equal(await page.locator('.po-auth-user button').count(), 2);
      for (const width of [1920, 1440, 375]) {
        await page.setViewportSize({ width, height: 1080 });
        const layout = await page.evaluate(() => {
          const bar = document.querySelector('.po-auth-user'), header = document.querySelector('.command-bar'), scope = header.querySelector('[data-po-scope]');
          const b = bar.getBoundingClientRect(), h = header.getBoundingClientRect(), s = scope.getBoundingClientRect();
          return { inHeader: header.contains(bar), position: getComputedStyle(bar).position, top: b.top, right: b.right, headerRight: h.right, fits: b.left >= h.left && b.right <= h.right && b.top >= h.top && b.bottom <= h.bottom, noOverlap: s.top >= b.bottom, scopeCount: header.querySelectorAll('[data-po-scope]').length };
        });
        assert(layout.inHeader && layout.fits && layout.noOverlap);
        assert.equal(layout.position, 'static');
        assert.equal(layout.scopeCount, 1);
        if (width >= 1440) { assert(layout.top < 100); assert(Math.abs(layout.headerRight - layout.right) < 50); }
        results.push({ page: name, width, apiStatus, layout });
      }
      await page.setViewportSize({ width: 1920, height: 1080 });
      if (name === 'sources' && process.env.PO_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.PO_SCREENSHOT_DIR, 'userbar-sources.png') });
    }
    await page.locator('.po-auth-user button').filter({ hasText: '成员与权限' }).click();
    await page.waitForFunction(() => Boolean(window.GlacierBaaS?._Admin?.prototype?.openManager));
    await page.getByText('成员', { exact: true }).first().waitFor();
    assert.deepEqual(errors, []);
    const phase = process.env.PO_AUTH_CANDIDATE ? 'preflight' : 'live';
    fs.writeFileSync(path.join(__dirname, `userbar-layout-${phase}.json`), JSON.stringify({ passed: true, phase, businessWrites: false, memberPanelVerified: true, errors, results }, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, phase, cases: results.length, memberPanelVerified: true }));
  } finally { await context.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
