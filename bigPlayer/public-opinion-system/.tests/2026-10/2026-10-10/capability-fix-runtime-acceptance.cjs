'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const output = path.resolve(__dirname, '../../../../../.temp/capability-timeout-fix-20261010');
const expected = crypto.createHash('sha256').update(fs.readFileSync(path.join(output, 'frontend-release/public/admin/PublicOpinion/assets/sources.js'))).digest('hex');
const sourceId = 'a11c81b6-e4c4-4342-a3b1-17035cffe1b5';
const query = '?regionCode=domestic&communityId=8b1f0000000000000000000000000022&platform=bigplayer_h5';
(async () => {
  assert(process.argv.includes('--approved-one-probe'), 'Requires explicit user approval for this release and one real capability probe');
  const layers = [];
  for (const origin of ['http://127.0.0.1:3001', 'http://172.16.2.48:3001', 'https://lfy3001.dev.q1op.com']) {
    const pageUrl = origin + '/admin/PublicOpinion/sources.html' + query;
    const response = await fetch(pageUrl); assert.equal(response.status, 200); const html = await response.text(); assert(html.includes('sources.js?v=213'));
    let resources = 0;
    for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)) { assert.equal((await fetch(new URL(match[1], pageUrl))).status, 200); resources++; }
    const script = await fetch(origin + '/admin/PublicOpinion/assets/sources.js?v=213');
    assert.equal(crypto.createHash('sha256').update(await script.text()).digest('hex'), expected);
    const detail = await fetch(origin + '/api/public-opinion/sources/' + sourceId + query); assert.equal(detail.status, 200); assert.equal((await detail.json()).data.id, sourceId);
    layers.push({ origin, page: 200, resources, scriptHashMatches: true, detail: 200 });
  }
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const errors = [], warnings = [], failedRequests = [], blockedWrites = []; let probes = 0, probe;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (['error', 'warning'].includes(m.type())) warnings.push(m.type()); });
    page.on('requestfailed', r => failedRequests.push(new URL(r.url()).pathname));
    await page.route('**/api/**', route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      if (['GET', 'HEAD'].includes(request.method())) return route.continue();
      if (!process.argv.includes('--verify-saved-probe') && request.method() === 'POST' && pathname === `/api/public-opinion/sources/${sourceId}/check-capabilities` && probes === 0) { probes++; return route.continue(); }
      blockedWrites.push(pathname); return route.abort();
    });
    await page.goto('https://lfy3001.dev.q1op.com/admin/PublicOpinion/sources.html' + query, { waitUntil: 'networkidle' });
    await page.locator(`[data-manage-source="${sourceId}"]`).click(); await page.locator('#btnCheckCapabilities').waitFor();
    if (process.argv.includes('--verify-saved-probe')) {
      probe = JSON.parse(fs.readFileSync(path.join(output, 'real-probe.json')));
    } else {
    const started = Date.now();
    const resultPromise = page.waitForResponse(r => new URL(r.url()).pathname === `/api/public-opinion/sources/${sourceId}/check-capabilities` && r.request().method() === 'POST', { timeout: 45000 });
    await page.locator('#btnCheckCapabilities').click(); const response = await resultPromise;
    const body = await response.json();
    probe = { durationMs: Date.now() - started, httpStatus: response.status(), authorized: body.data?.authorized, capabilities: body.data?.capabilities, reason: body.data?.reason || body.error?.code || null };
    fs.writeFileSync(path.join(output, 'real-probe.json'), JSON.stringify(probe, null, 2));
    assert.equal(probe.httpStatus, 200); assert.equal(probe.authorized, true);
    assert.equal(probe.capabilities.posts, 'authorized_scope'); assert.equal(probe.capabilities.comments, 'authorized_scope'); assert(probe.durationMs < 30000);
    await page.locator('#toast').filter({ hasText: '能力检测完成' }).waitFor();
    await page.waitForFunction(() => !document.querySelector('#btnCheckCapabilities')?.disabled);
    }
    assert(!(await page.locator('#drawerContent').textContent()).includes('未授权'));
    const savedResponse = await page.request.get(`https://lfy3001.dev.q1op.com/api/public-opinion/sources/${sourceId}${query}`); assert.equal(savedResponse.status(), 200);
    const saved = (await savedResponse.json()).data;
    for (const scope of ['posts','comments']) assert.equal(typeof saved.capabilities[scope] === 'object' ? saved.capabilities[scope].status : saved.capabilities[scope], 'authorized_scope');
    assert.equal(probes, process.argv.includes('--verify-saved-probe') ? 0 : 1); assert.deepEqual(errors, []); assert.deepEqual(warnings, []); assert.deepEqual(failedRequests, []); assert.deepEqual(blockedWrites, []);
    await page.screenshot({ path: path.join(output, 'external-fixed.png') });
  } finally { await browser.close(); }
  const report = { result: 'PASS', layers, probe, browser: { probes, savedProbeVerification: process.argv.includes('--verify-saved-probe'), errors, warnings, failedRequests, blockedWrites }, collectionTriggered: false };
  fs.writeFileSync(path.join(output, 'runtime-acceptance.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
