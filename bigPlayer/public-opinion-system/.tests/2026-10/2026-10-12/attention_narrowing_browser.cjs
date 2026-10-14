const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const origin = 'https://lfy3001.dev.q1op.com';
const scope = 'regionCode=domestic&communityId=8b1f0000000000000000000000000009&platform=bigplayer_h5';
const ids = ['74c56eae-6aa0-4389-a4e1-103b397ef244', 'fcef5f48-6397-4926-9c72-a44f9888c144', '71bdedca-dd21-41f8-af34-a3ff95e6a12b'];
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const results = [];
    for (const id of ids) {
      const response = await page.request.get(`${origin}/api/public-opinion/contents/${id}?${scope}`);
      assert.equal(response.status(), 200, await response.text());
      const json = await response.json();
      const raw = json.data || json;
      const detail = raw.content || raw.item || raw;
      assert.equal(detail.severity, 'normal');
      assert.equal(detail.sentiment, 'neutral');
      await page.goto(`${origin}/admin/PublicOpinion/content.html?${scope}&contentMode=post&contentId=${id}&keyword=${encodeURIComponent(detail.body)}&publishedFrom=2020-01-01&publishedTo=2026-10-12`, { waitUntil: 'domcontentloaded' });
      await page.locator('#drawerMask.open').waitFor();
      await page.waitForFunction(() => document.querySelector('#drawerContent').innerText.includes('分析原因：'));
      const text = await page.locator('#drawerContent').innerText();
      assert(text.includes('中性'));
      assert(text.includes('正常'));
      const checkbox = page.locator(`[data-handling-id="${id}"]`);
      await checkbox.waitFor({ state: 'attached' });
      assert(await checkbox.isDisabled());
      assert((await checkbox.locator('xpath=ancestor::tr').innerText()).includes('无需处理'));
      assert(text.includes(detail.analysis_reason || detail.analysisReason));
      await page.screenshot({ path: path.join(__dirname, `attention_narrowing_${id.slice(0, 8)}.png`) });
      results.push({ contentId: id, severity: detail.severity, sentiment: detail.sentiment, uiHandling: '无需处理', reason: detail.analysis_reason || detail.analysisReason });
    }
    await page.goto(`${origin}/admin/PublicOpinion/content.html?${scope}&contentMode=attention&publishedFrom=2020-01-01&publishedTo=2026-10-12`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => state.requestSerial > 0 && document.querySelector('#resultHint').innerText.includes('共'));
    const attention = await page.evaluate(() => ({ ids: state.contents.map(c => c.id), total: state.total, mode: state.contentMode }));
    assert.equal(attention.mode, 'attention');
    assert(attention.ids.every(id => !ids.includes(id)));
    for (const row of results) {
      const response = await page.request.get(`${origin}/api/public-opinion/contents?${scope}&riskMode=attention&keyword=${encodeURIComponent(row.reason === results[0].reason ? '符文副本程普' : row.reason === results[1].reason ? '周瑜装备t啥属性' : '用银票有啥好处')}&publishedFrom=2020-01-01T00:00:00Z&publishedTo=2026-10-13T00:00:00Z`);
      assert.equal(response.status(), 200, await response.text());
      const data = (await response.json()).data;
      const items = Array.isArray(data) ? data : data.items || data.contents || [];
      assert(items.every(item => !ids.includes(item.id)));
    }
    await page.screenshot({ path: path.join(__dirname, 'attention_narrowing_queue.png') });
    assert.deepEqual(errors, []);
    const result = { at: new Date().toISOString(), browser: 'Edge', headless: false, results, attention, errors };
    fs.writeFileSync(path.join(__dirname, 'attention_narrowing_browser_result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
