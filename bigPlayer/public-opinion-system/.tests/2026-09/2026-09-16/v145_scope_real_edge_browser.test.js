const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const BASE = process.env.SCOPE_TEST_BASE || 'https://lfy3001.dev.q1op.com';
const pages = ['index', 'content', 'alerts', 'sources', 'collection-runs', 'keywords'];

test('real directory interface failure blocks six-page business reads without fake responses', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const name of pages) {
      const context = await browser.newContext(); const page = await context.newPage(); const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setBlockedURLs', { urls: ['*/api/public-opinion/communities*'] });
      const failed = []; const business = []; const errors = [];
      page.on('requestfailed', request => failed.push(request.url()));
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (request.url().includes('/api/public-opinion/') && !request.url().includes('/communities')) business.push(request.url()); });
      await page.goto(`${BASE}/admin/PublicOpinion/${name}.html?regionCode=domestic`, { waitUntil: 'networkidle' });
      assert.ok(failed.some(url => url.includes('/communities')), name);
      assert.equal(await page.evaluate(() => window.PublicOpinionScope.available()), false, name);
      assert.ok(await page.getByText('当前地区暂无可用社区', { exact: false }).count(), name);
      const query = page.locator('#queryBtn'); if (await query.count()) { await query.click(); await page.waitForLoadState('networkidle'); }
      assert.equal(business.length, 0, `${name} ${business.join(',')}`);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log(name, 'directory request genuinely blocked by CDP; business reads=0; application errors=0');
      await context.close();
    }
  } finally { await browser.close(); }
});

test('unchanged real backend responses arrive out of order and cannot restore stale scope', { timeout: 180000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const name of pages) {
      const context = await browser.newContext(); const page = await context.newPage();
      await page.goto(`${BASE}/admin/PublicOpinion/${name}.html?regionCode=domestic`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.PublicOpinionScope.available() && typeof state !== 'undefined' && state.scope);
      const initial = await page.evaluate(() => window.PublicOpinionScope.selected().communityId);
      const responses = []; let sequence = 0; let releaseOlder; let olderFetched;
      const fetched = new Promise(resolve => { olderFetched = resolve; });
      const held = new Promise(resolve => { releaseOlder = resolve; });
      const passthroughs = [];
      await page.route('**/api/public-opinion/communities?*', route => {
        const task = (async () => {
          const id = ++sequence; const response = await route.fetch();
          const body = await response.body();
          assert.equal(response.status(), 200);
          const evidence = { sequence: id, region: new URL(route.request().url()).searchParams.get('regionCode'), sha256: crypto.createHash('sha256').update(body).digest('hex') };
          if (id === 1) { olderFetched(); await held; }
          responses.push(evidence);
          try { await route.fulfill({ response }); } catch (error) { if (!/closed|cancel|abort/i.test(error.message)) throw error; }
        })();
        passthroughs.push(task); return task;
      });
      await page.locator('[data-po-region]').selectOption('overseas'); await fetched;
      await page.locator('[data-po-region]').selectOption('domestic');
      await page.waitForFunction(() => window.PublicOpinionScope.available() && window.PublicOpinionScope.selected().regionCode === 'domestic');
      releaseOlder(); await Promise.all(passthroughs); await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(() => window.PublicOpinionScope.selected().communityId), initial, name);
      assert.equal(new URL(page.url()).searchParams.get('regionCode'), 'domestic');
      assert.deepEqual(responses.map(item => item.sequence), [2, 1]);
      console.log(name, JSON.stringify(responses), 'real responses unchanged; final scope=domestic');
      await context.close();
    }
  } finally { await browser.close(); }
});
