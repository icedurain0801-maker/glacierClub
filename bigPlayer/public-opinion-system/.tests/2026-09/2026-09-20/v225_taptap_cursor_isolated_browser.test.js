const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const fixture = path.resolve(__dirname, 'v225_taptap_cursor_isolated_browser_fixture.html');

test('TapTap cursor fixture proves browser-only 20-page continuation and deduplication', { timeout: 30000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const requests = []; const errors = [];
    page.on('request', request => requests.push(request.url()));
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(fixture).href, { waitUntil: 'load' });
    await page.locator('#run-one').click();
    assert.equal(await page.locator('#checkpoint').textContent(), '{"version":1,"accountIdx":0,"from":200}');
    assert.match(await page.locator('#first-run').textContent(), /PASS.*20.*200/);
    await page.locator('#run-two').click();
    assert.equal(await page.locator('#second-first').textContent(), '{"version":1,"accountIdx":0,"from":200}');
    assert.equal(await page.locator('#unique').textContent(), '400');
    await page.locator('#replay').click();
    assert.match(await page.locator('#dedupe').textContent(), /PASS.*新增 0.*去重 10/);
    assert.deepEqual(requests, [pathToFileURL(fixture).href]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
