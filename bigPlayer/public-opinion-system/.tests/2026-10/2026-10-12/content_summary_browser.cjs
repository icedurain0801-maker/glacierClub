const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
    const errors = [], modes = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://lfy3001.dev.q1op.com/admin/PublicOpinion/content.html?regionCode=overseas', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-po-community] option').filter({ hasText: 'Last Light' }).waitFor({ state: 'attached' });
    await page.locator('[data-po-community]').selectOption({ label: 'Last Light' });
    await page.locator('[data-date-preset=yesterday]').click();
    await page.locator('#statPost').filter({ hasText: /^\d+$/ }).waitFor();
    const geometry = await page.evaluate(() => {
      const post = document.querySelector('[data-content-mode=post]'), risk = document.querySelector('[data-content-mode=attention]');
      const p = post.getBoundingClientRect(), r = risk.getBoundingClientRect();
      return { postX: p.x, postHeight: p.height, riskX: r.x, riskHeight: r.height, riskColor: getComputedStyle(document.querySelector('#statUrgent')).color,
        order: [...document.querySelectorAll('.content-mode-bar [data-content-mode]')].map(x => x.dataset.contentMode) };
    });
    assert(geometry.postX < geometry.riskX);
    assert(geometry.postHeight >= 88);
    assert(geometry.riskHeight < geometry.postHeight);
    assert.deepEqual(geometry.order, ['post', 'comment', 'attention', 'urgent']);
    assert.equal(geometry.riskColor, 'rgb(113, 128, 150)');
    for (const mode of ['post', 'comment', 'attention', 'urgent']) {
      const responsePromise = page.waitForResponse(r => {
        const u = new URL(r.url());
        return u.pathname === '/api/public-opinion/contents' && (mode === 'post' || mode === 'comment' ? u.searchParams.get('contentType') === mode : u.searchParams.get('riskMode') === mode);
      });
      await page.locator(`[data-content-mode=${mode}]`).click();
      const response = await responsePromise;
      assert.equal(response.status(), 200);
      assert.equal(await page.locator(`[data-content-mode=${mode}]`).getAttribute('aria-pressed'), 'true');
      modes.push({ mode, apiStatus: response.status() });
    }
    await page.locator('[data-content-mode=post]').click();
    await page.waitForFunction(() => document.querySelector('[data-content-mode=post]').getAttribute('aria-pressed') === 'true'
      && document.querySelector('[data-content-mode=urgent]').getAttribute('aria-pressed') === 'false'
      && /^\d+$/.test(document.querySelector('#statPost').textContent));
    await page.locator('#tableContent .skeleton').first().waitFor({ state: 'detached' });
    await page.screenshot({ path: path.join(__dirname, 'content_summary_desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await page.evaluate(() => {
      const bar = document.querySelector('.content-mode-bar'), box = bar.getBoundingClientRect();
      return { clientWidth: bar.clientWidth, scrollWidth: bar.scrollWidth, x: box.x, right: box.right, viewport: innerWidth };
    });
    assert(narrow.scrollWidth <= narrow.clientWidth + 1);
    assert(narrow.right <= narrow.viewport + 1);
    await page.screenshot({ path: path.join(__dirname, 'content_summary_mobile.png') });
    assert.deepEqual(errors, []);
    const result = { at: new Date().toISOString(), browser: 'Edge', headless: false, geometry, modes, narrow, errors, writes: 0 };
    fs.writeFileSync(path.join(__dirname, 'content_summary_browser_result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
