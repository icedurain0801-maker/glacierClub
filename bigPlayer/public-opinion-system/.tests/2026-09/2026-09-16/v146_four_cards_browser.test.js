const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const BASE = 'https://lfy3001.dev.q1op.com';

test('real overview four cards and exact negative deep link', { timeout: 180000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', e => { if (['error', 'warning'].includes(e.type())) errors.push(e.text()); });
      for (const period of ['today', '7d', '30d']) {
        await page.goto(`${BASE}/admin/PublicOpinion/index.html?regionCode=domestic&period=${period}`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.querySelectorAll('#metrics .metric').length === 4 && document.querySelector('#viewAllNegative').href.includes('publishedTo='));
        assert.equal(await page.locator('#metrics .metric').count(), 4);
        assert.match(await page.locator('#metrics').innerText(), /关注级内容/);
        assert.doesNotMatch(await page.locator('#metrics').innerText(), /人工验证/);
        const href = await page.locator('#viewAllNegative').getAttribute('href');
        const params = new URL(href, page.url()).searchParams;
        for (const key of ['regionCode', 'communityId', 'publishedFrom', 'publishedTo']) assert.ok(params.get(key), key);
        assert.equal(params.get('contentMode'), 'negative');
        assert.equal(params.get('sentiment'), 'negative');
        assert.equal(params.has('page'), false);
        assert.equal(params.has('contentId'), false);
        const requests = [];
        page.on('request', request => { if (request.url().includes('/contents?')) requests.push(request.url()); });
        await page.locator('#viewAllNegative').click();
        await page.waitForLoadState('networkidle');
        assert.ok(requests.length, 'content requests exist');
        for (const request of requests) {
          const query = new URL(request).searchParams;
          assert.equal(query.get('publishedFrom'), params.get('publishedFrom'));
          assert.equal(query.get('publishedTo'), params.get('publishedTo'));
        }
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(new URL(page.url()).searchParams.get('publishedTo'), params.get('publishedTo'));
        await page.screenshot({ path: `.tests/2026-09/2026-09-16/v146_content_${viewport.width}_${period}.png`, fullPage: true });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});
