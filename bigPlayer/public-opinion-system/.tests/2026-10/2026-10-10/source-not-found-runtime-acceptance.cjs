'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const output = path.resolve(__dirname, '../../../../../.temp/source-not-found-independent-20261010');
const query = '?regionCode=domestic&communityId=8b1f0000000000000000000000000022&platform=bigplayer_h5';
const expected = '50ceed0333bf3ba9e4455b774204293ff5c280eb2c2391179cc4b3c6f24e4135';
async function check(origin) {
  const pageUrl = origin + '/admin/PublicOpinion/sources.html' + query;
  const response = await fetch(pageUrl), html = await response.text();
  assert.equal(response.status, 200); assert(html.includes('sources.js?v=211'));
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map(match => new URL(match[1], pageUrl).href);
  const resources = await Promise.all(assets.map(async url => { const response = await fetch(url); assert.equal(response.status, 200, url); return { path: new URL(url).pathname, status: response.status }; }));
  const jsResponse = await fetch(origin + '/admin/PublicOpinion/assets/sources.js?v=211');
  const digest = crypto.createHash('sha256').update(await jsResponse.text()).digest('hex'); assert.equal(digest, expected);
  const apiResponse = await fetch(origin + '/api/public-opinion/sources' + query);
  const body = await apiResponse.json(); assert.equal(apiResponse.status, 200);
  assert(Array.isArray(body.data) || Array.isArray(body.data?.items), 'Source API must return real list structure');
  return { origin, pageStatus: response.status, resources, sourceApiStatus: apiResponse.status, sourceCount: (body.data?.items || body.data).length, sourceScriptSha256: digest };
}
(async () => {
  const layers = [];
  for (const origin of ['http://127.0.0.1:3001', 'http://172.16.2.48:3001', 'https://lfy3001.dev.q1op.com']) layers.push(await check(origin));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const errors = [], failed = [], blockedWrites = [], consoleMessages = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failed.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text() }); });
    await page.route('**/api/**', route => {
      if (!['GET', 'HEAD'].includes(route.request().method())) { blockedWrites.push(new URL(route.request().url()).pathname); return route.abort(); }
      return route.continue();
    });
    await page.goto('https://lfy3001.dev.q1op.com/admin/PublicOpinion/sources.html' + query, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('script[src="assets/sources.js?v=211"]').count(), 1);
    await page.locator('#addBtn').click();
    await page.locator('#cfgName').fill('只读验收草稿');
    await page.locator('#cfgBoardId').fill('22');
    await page.locator('[data-site-url]').first().fill('https://example.invalid/');
    await page.locator('#h5AuthPassword').click();
    assert.equal(await page.locator('#btnCreate').count(), 1);
    assert.equal(await page.locator('#btnSaveSource,#btnCheckAuth,#btnCheckLogin,#btnCheckCapabilities').count(), 0);
    assert.equal(await page.locator('#cfgName').inputValue(), '只读验收草稿');
    assert.equal(await page.locator('#cfgBoardId').inputValue(), '22');
    assert.equal(await page.locator('[data-site-url]').first().inputValue(), 'https://example.invalid/');
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(consoleMessages, []); assert.deepEqual(blockedWrites, []);
    await page.screenshot({ path: path.join(output, 'external-fixed.png') });
    await page.locator('#btnCancel').click();
  } finally { await browser.close(); }
  const report = { result: 'PASS', layers, browser: { errors, failedRequests: failed, consoleMessages, blockedWrites, draftSwitch: 'PASS', realWriteRequests: 0 } };
  fs.writeFileSync(path.join(output, 'runtime-acceptance.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
