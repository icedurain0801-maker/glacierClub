'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const output = path.resolve(__dirname, '../../../../../.temp/login-authorization-fix-20261010');
const expected = crypto.createHash('sha256').update(fs.readFileSync(path.join(output, 'frontend-release/public/admin/PublicOpinion/assets/sources.js'))).digest('hex');
const sourceId = 'a11c81b6-e4c4-4342-a3b1-17035cffe1b5';
const query = '?regionCode=domestic&communityId=8b1f0000000000000000000000000022&platform=bigplayer_h5';
(async () => {
  const layers = [];
  for (const origin of ['http://127.0.0.1:3001', 'http://172.16.2.48:3001', 'https://lfy3001.dev.q1op.com']) {
    const pageUrl = origin + '/admin/PublicOpinion/sources.html' + query;
    const page = await fetch(pageUrl); assert.equal(page.status, 200);
    const html = await page.text(); assert(html.includes('sources.js?v=212'));
    const resources = [];
    for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)) {
      const response = await fetch(new URL(match[1], pageUrl)); assert.equal(response.status, 200); resources.push(match[1]);
    }
    const script = await fetch(origin + '/admin/PublicOpinion/assets/sources.js?v=212');
    assert.equal(crypto.createHash('sha256').update(await script.text()).digest('hex'), expected);
    const detail = await fetch(origin + '/api/public-opinion/sources/' + sourceId + query); assert.equal(detail.status, 200);
    assert.equal((await detail.json()).data.id, sourceId);
    const status = await fetch(origin + '/api/public-opinion/sources/' + sourceId + '/login-status' + query); assert.equal(status.status, 200);
    const body = await status.json(); assert.equal(typeof body.data.status, 'string');
    layers.push({ origin, page: 200, staticResources: resources.length, detail: 'single source object', loginStatus: body.data.status, failureCode: body.data.failureCode });
  }
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const errors = [], failed = [], consoleMessages = [], blockedWrites = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failed.push(new URL(request.url()).pathname));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text() }); });
    await page.route('**/api/**', route => {
      if (!['GET', 'HEAD'].includes(route.request().method())) { blockedWrites.push(new URL(route.request().url()).pathname); return route.abort(); }
      return route.continue();
    });
    const url = 'https://lfy3001.dev.q1op.com/admin/PublicOpinion/sources.html' + query;
    await page.goto(url, { waitUntil: 'networkidle' }); await page.reload({ waitUntil: 'networkidle' });
    await page.locator(`[data-manage-source="${sourceId}"]`).click();
    await page.locator('#btnCheckLogin').waitFor();
    assert.equal(await page.locator('#h5AuthPassword').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('.validation-workspace .status-cell').count(), 2);
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(consoleMessages, []); assert.deepEqual(blockedWrites, []);
    await page.screenshot({ path: path.join(output, 'external-fixed.png') });
  } finally { await browser.close(); }
  const report = { result: 'PASS', layers, browser: { passwordMode: true, statusWorkspaceLoaded: true, errors, failedRequests: failed, consoleMessages, blockedWrites } };
  fs.writeFileSync(path.join(output, 'runtime-acceptance.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
