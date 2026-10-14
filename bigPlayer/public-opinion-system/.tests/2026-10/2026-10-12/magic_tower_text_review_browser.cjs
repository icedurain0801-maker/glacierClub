const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const id = 'aa0d8cc1-e038-40b4-a597-d17f0a70448f';
const base = 'https://lfy3001.dev.q1op.com';
const scope = 'regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5&publishedFrom=2026-10-11T00%3A00%3A00.000%2B08%3A00&publishedTo=2026-10-12T00%3A00%3A00.000%2B08%3A00';
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/admin/PublicOpinion/content.html?${scope}&riskMode=attention&contentMode=attention&postId=927469`, { waitUntil: 'domcontentloaded' });
    const action = page.locator(`[data-content="${id}"]`);
    await action.waitFor({ state: 'visible' });
    const row = action.locator('xpath=ancestor::tr');
    const listSeverity = (await row.locator('.severity').innerText()).trim();
    assert.equal(listSeverity, '关注');
    await action.click();
    await page.locator('#drawerContent .analysis-reason').waitFor({ state: 'visible' });
    const reason = await page.locator('#drawerContent .analysis-reason').innerText();
    assert.match(reason, /魔塔没箱子/); assert.match(reason, /未提供可核查/);
    const detailSeverity = (await page.locator('#drawerContent .severity').first().innerText()).trim();
    assert.equal(detailSeverity, '关注');
    await page.screenshot({ path: path.resolve(__dirname, '../../../../../.temp/magic-tower-review-browser.png') });
    const api = await page.request.get(`${base}/api/public-opinion/contents/${id}?${scope}`);
    assert.equal(api.status(), 200);
    const body = await api.json(); const content = body.data?.content ?? body.data;
    assert.equal(content.id, id); assert.equal(content.severity, 'attention');
    const negative = await page.request.get(`${base}/api/public-opinion/contents?${scope}&riskMode=negative&postId=927469`);
    assert.equal(negative.status(), 200);
    const list = await negative.json(); assert.equal(list.meta.total, 0);
    assert.deepEqual(errors, []);
    const result = { at: new Date().toISOString(), contentId: id, browser: 'Edge', headless: false,
      realWebsite: true, listSeverity, detailSeverity, reason,
      apiSeverity: content.severity, negativeListTotal: list.meta.total, errors };
    fs.writeFileSync(path.join(__dirname, 'magic_tower_text_review_browser_result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
