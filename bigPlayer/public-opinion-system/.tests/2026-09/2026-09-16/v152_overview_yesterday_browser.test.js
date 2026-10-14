const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
test('real yesterday request, module labels, scope persistence and daily deep links', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      const page = await browser.newPage({ viewport }); const errors = []; const requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', entry => { if (['error', 'warning'].includes(entry.type())) errors.push(entry.text()); });
      page.on('request', request => { if (new URL(request.url()).pathname.endsWith('/overview')) requests.push(request.url()); });
      await page.goto('https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => state.overview?.window && state.period === 'today');
      const read = () => page.evaluate(() => ({ period: state.period, window: state.overview.window, metrics: state.overview.metrics, labels: [...document.querySelectorAll('[data-overview-period-label]')].map(element => element.textContent), trend: document.querySelector('#trendLabel').textContent, scope: new URLSearchParams(location.search).get('communityId'), hrefs: ['viewAllNegative', 'viewAllAttention'].map(id => document.getElementById(id).getAttribute('href')) }));
      const today = await read();
      assert.equal(await page.locator('[data-period-select]').inputValue(), 'today');
      await page.locator('[data-period-select]').selectOption('yesterday');
      await page.waitForFunction(() => state.period === 'yesterday' && state.overview?.window && document.querySelector('#metrics').textContent.includes('昨日发布内容'));
      await page.waitForLoadState('networkidle');
      const yesterday = await read();
      const time = value => Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
      assert.equal(time(yesterday.window.publishedTo), time(today.window.publishedFrom));
      assert.equal(time(yesterday.window.publishedTo) - time(yesterday.window.publishedFrom), 86400000);
      assert.ok(yesterday.labels.every(label => label === '昨日'));
      assert.ok(yesterday.trend.startsWith('昨日 · '));
      assert.equal(yesterday.trend.split(' · ')[1], today.trend.split(' · ')[1]);
      assert.ok(requests.some(url => new URL(url).searchParams.get('period') === 'yesterday'));
      for (const href of yesterday.hrefs) {
        const params = new URL(href, page.url()).searchParams;
        assert.equal(Date.parse(params.get('publishedFrom')), time(yesterday.window.publishedFrom));
        assert.equal(Date.parse(params.get('publishedTo')), time(yesterday.window.publishedTo));
      }
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('[data-period-select]').inputValue(), 'yesterday');
      const region = page.locator('[data-po-region]');
      await region.selectOption('overseas');
      await page.waitForLoadState('networkidle');
      await page.waitForFunction(() => state.overview?.window && new URLSearchParams(location.search).get('regionCode') === 'overseas');
      assert.equal(await page.locator('[data-period-select]').inputValue(), 'yesterday');
      const community = page.locator('[data-po-community]');
      const options = await community.locator('option').evaluateAll(elements => elements.filter(element => element.value && !element.disabled).map(element => element.value));
      if (options.length > 1) {
        const current = await community.inputValue();
        await community.selectOption(options.find(value => value !== current));
        await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('[data-period-select]').inputValue(), 'yesterday');
      }
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(__dirname, `v152_yesterday_${viewport.width}.png`), fullPage: true });
      await page.close();
    }
  } finally { await browser.close(); }
});
