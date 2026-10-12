const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const verification = JSON.parse(fs.readFileSync(path.join(__dirname, 'ai_reason_database_result.json')));
const base = 'https://lfy3001.dev.q1op.com';
const scope = 'regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5&publishedFrom=2026-10-06T00%3A00%3A00.000%2B08%3A00&publishedTo=2026-10-13T00%3A00%3A00.000%2B08%3A00';
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false });
  const errors = [], samples = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
    for (const expected of verification.samples) {
      await page.goto(`${base}/admin/PublicOpinion/content.html?${scope}&postId=${expected.postId}`, { waitUntil: 'domcontentloaded' });
      const button = page.locator(`[data-content="${expected.id}"]`);
      await button.waitFor({ state: 'visible' }); await button.click();
      await page.locator('#drawerContent .analysis-reason').waitFor({ state: 'visible' });
      const displayed = await page.locator('#drawerContent .analysis-reason').innerText();
      assert.equal(displayed, `分析原因：${expected.aiReason}`);
      assert.notEqual(displayed, `分析原因：${expected.previousDisplay}`);
      const response = await page.request.get(`${base}/api/public-opinion/contents/${expected.id}?${scope}`);
      assert.equal(response.status(), 200); const body = await response.json();
      const content = body.data?.content ?? body.data;
      assert.equal(content.analysis_reason, expected.aiReason); assert.equal(content.severity, expected.severity);
      await page.screenshot({ path: path.resolve(__dirname, `../../../../../.temp/ai-reason-${expected.postId}.png`) });
      samples.push({ postId: expected.postId, id: expected.id, displayed, apiReason: content.analysis_reason, severity: content.severity });
    }
    assert.deepEqual(errors, []);
    const result = { at: new Date().toISOString(), browser: 'Edge', headless: false, realWebsite: true, samples, errors };
    fs.writeFileSync(path.join(__dirname, 'ai_reason_browser_result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
