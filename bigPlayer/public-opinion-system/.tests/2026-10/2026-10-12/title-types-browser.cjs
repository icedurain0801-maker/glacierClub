'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const out = 'C:/Users/Administrator/AppData/Roaming/Code/User/project manage/bigPlayer/public-opinion-system/.tests/2026-10/2026-10-12';
const before = process.argv.includes('--before');
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [], writes = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', r => {
      if (!['GET','HEAD'].includes(r.request().method())) { writes.push(r.request().method()); return r.abort(); }
      return r.continue();
    });
    const query = new URLSearchParams({ regionCode: 'domestic', communityId: '00000000-0000-0000-0000-000000000101', platform: 'bigplayer_h5', contentType: 'post', publishedFrom: '2026-10-11T00:00:00+08:00', publishedTo: '2026-10-12T00:00:00+08:00' });
    const origin = 'https://lfy3001.dev.q1op.com';
    await page.goto(origin + '/admin/PublicOpinion/content.html?' + query, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const rows = [];
    console.log('Content page loaded');
    for (let p = 1; p <= 20; p++) {
      const q = new URLSearchParams(query); q.set('page', p); q.set('pageSize', '100');
      const response = await page.request.get(origin + '/api/public-opinion/contents?' + q);
      assert.equal(response.status(), 200);
      const json = await response.json(); assert(Array.isArray(json.data));
      rows.push(...json.data);
      console.log('API page ' + p + ': ' + json.data.length);
      if (json.data.length < 100) break;
      assert(p < 20, 'pagination incomplete');
    }
    assert(rows.length > 0);
    const expected = row => String(row.title ?? '').trim() ? 'post' : 'dynamic';
    const mismatches = rows.filter(row => row.display_type !== expected(row));
    const report = { phase: before ? 'before' : 'live', rows: rows.length, posts: rows.filter(row => expected(row) === 'post').length, dynamics: rows.filter(row => expected(row) === 'dynamic').length, mismatches: mismatches.length, errors, writes };
    if (!before) {
      assert.equal(mismatches.length, 0);
      for (let p = 1; p <= Math.ceil(rows.length / 50); p++) {
        console.log('Checking DOM page ' + p);
        const q = new URLSearchParams(query); q.set('page', p);
        const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/public-opinion/contents' && r.request().method() === 'GET');
        await page.goto(origin + '/admin/PublicOpinion/content.html?' + q, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const json = await (await responsePromise).json();
        console.log('Expected rows ' + json.data.length + ', rendered ' + await page.locator('#tableContent tbody .type-pill').count());
        await page.waitForFunction(n => document.querySelectorAll('#tableContent tbody .type-pill').length === n, json.data.length);
        assert.deepEqual(await page.locator('#tableContent tbody .type-pill').allTextContents(), json.data.map(row => expected(row) === 'post' ? '帖子' : '动态'));
        if (json.data.some(row => expected(row) === 'post')) {
          await page.screenshot({ path: out + '/title-types-live.png', timeout: 15000 });
          const postQuery = new URLSearchParams(q); postQuery.set('bigPlayerContentKind', 'post');
          await page.goto(origin + '/admin/PublicOpinion/content.html?' + postQuery, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await page.waitForFunction(() => document.querySelectorAll('#tableContent tbody .type-pill').length > 0 && [...document.querySelectorAll('#tableContent tbody .type-pill')].every(el => el.textContent === '帖子'));
          report.postFilterChecked = true;
          await page.screenshot({ path: out + '/title-types-post-filter.png', timeout: 15000 });
        }
      }
      assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    }
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(out + '/title-types-' + report.phase + '.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
