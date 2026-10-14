const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const BASE = process.env.SCOPE_TEST_BASE || 'http://127.0.0.1:3001';
const pages = ['index', 'content', 'alerts', 'sources', 'collection-runs', 'keywords'];

test('six real pages inherit scope, restore history, and send explicit scope', { timeout: 180000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = []; const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  page.on('response', response => { if (response.url().includes('/api/public-opinion/') && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => { if (request.url().includes('/api/public-opinion/') && !request.url().includes('/communities')) requests.push(new URL(request.url())); });
  const ready = () => page.waitForFunction(() => window.PublicOpinionScope?.available() && typeof state !== 'undefined' && state.scope);
  try {
    await page.goto(`${BASE}/admin/PublicOpinion/index.html?regionCode=domestic&communityId=invalid`, { waitUntil: 'networkidle' }); await ready();
    const initial = await page.evaluate(() => window.PublicOpinionScope.selected().communityId);
    assert.notEqual(initial, 'invalid');
    for (const name of pages) {
      await page.goto(`${BASE}/admin/PublicOpinion/${name}.html`, { waitUntil: 'networkidle' }); await ready();
      const scope = await page.evaluate(() => window.PublicOpinionScope.selected());
      assert.equal(scope.regionCode, 'domestic', name); assert.equal(scope.communityId, initial, name);
      const links = await page.locator('#sidebar a[href*="admin/PublicOpinion/"]').evaluateAll(items => items.map(item => item.href));
      assert.ok(links.length >= 6, name);
      links.forEach(href => { const url = new URL(href); assert.equal(url.searchParams.get('communityId'), initial); assert.equal(url.searchParams.get('regionCode'), 'domestic'); assert.equal(url.searchParams.has('platform'), false); });
      await page.screenshot({ path: path.join(__dirname, `v145_${name}_desktop.png`), fullPage: false });
      await page.locator('[data-po-region]').selectOption('overseas');
      await page.waitForFunction(() => window.PublicOpinionScope.available() && window.PublicOpinionScope.selected().regionCode === 'overseas' && new URLSearchParams(location.search).get('regionCode') === 'overseas');
      await page.waitForLoadState('networkidle');
      await page.goBack({ waitUntil: 'networkidle' }); await ready();
      assert.equal(await page.evaluate(() => window.PublicOpinionScope.selected().communityId), initial, `${name} back`);
      await page.goForward({ waitUntil: 'networkidle' }); await ready();
      await page.waitForFunction(() => window.PublicOpinionScope.selected().regionCode === 'overseas');
      await page.goBack({ waitUntil: 'networkidle' }); await ready();
      await page.waitForFunction(() => window.PublicOpinionScope.selected().regionCode === 'domestic');
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: path.join(__dirname, `v145_${name}_mobile.png`), fullPage: false });
      const layout = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, main: document.querySelector('.admin-main').getBoundingClientRect().width }));
      assert.ok(layout.main > 0, name); assert.ok(layout.width <= layout.viewport, `${name} horizontal overflow`);
      console.log(name, JSON.stringify(layout));
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.ok(requests.length > 12);
    requests.forEach(url => { assert.ok(url.searchParams.get('regionCode'), url.href); assert.ok(url.searchParams.get('communityId'), url.href); });
  } finally { await browser.close(); }
});

test('six pages display empty scope without issuing business API requests', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const name of pages) {
      const context = await browser.newContext(); const page = await context.newPage(); const business = []; const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/public-opinion/**', route => {
        if (new URL(route.request().url()).pathname.endsWith('/communities')) return route.fulfill({ json: { data: [] } });
        business.push(route.request().url()); return route.fulfill({ json: { data: [] } });
      });
      await page.goto(`${BASE}/admin/PublicOpinion/${name}.html`, { waitUntil: 'networkidle' });
      assert.equal(await page.evaluate(() => window.PublicOpinionScope.available()), false, name);
      assert.equal(business.length, 0, `${name}: ${business.join(',')}`);
      assert.ok(await page.getByText('当前地区暂无可用社区', { exact: false }).count(), name);
      assert.equal(errors.length, 0, errors.join('\n')); await context.close();
    }
  } finally { await browser.close(); }
});
