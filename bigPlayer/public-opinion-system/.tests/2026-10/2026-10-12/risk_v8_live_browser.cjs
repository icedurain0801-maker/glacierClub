const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = 'https://lfy3001.dev.q1op.com';
const scope = 'regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5&publishedFrom=2026-10-11T00%3A00%3A00.000%2B08%3A00&publishedTo=2026-10-12T00%3A00%3A00.000%2B08%3A00';
const expected = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const temp = path.resolve(__dirname, '../../../../../.temp/risk-rejudge-v8-oct11');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: false });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.setDefaultTimeout(60000);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/public-opinion/overview?**', route => {
      const url = new URL(route.request().url()); url.searchParams.set('fresh', '1');
      return route.continue({ url: url.toString() });
    });
    const url = base + '/admin/PublicOpinion/index.html?' + scope;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof state !== 'undefined' && state.overview?.metrics?.urgent != null);
    const metrics = await page.evaluate(() => state.overview.metrics);
    const levels = expected.levels || expected.currentLevels;
    console.log(JSON.stringify({ stage: 'overview', metrics, levels }));
    assert.equal(metrics.total, expected.total);
    assert.equal(metrics.postCount, expected.types.post);
    assert.equal(metrics.commentCount, expected.types.comment);
    assert.equal(metrics.attention, levels.attention || 0);
    assert.equal(metrics.negative, levels.negative || 0);
    // Alert card counts actual active alerts. Risk lists count urgent contents.
    const values = await page.locator('#metrics .metric-value').allTextContents();
    assert.equal(values[0], String(expected.total));
    await page.locator('#metrics').screenshot({ path: path.join(temp, 'browser-cards.png') });
    const lists = {};
    for (const [selector, key] of [['#viewAllAttention', 'attention'], ['#viewAllNegative', 'negative']]) {
      await page.locator(selector).click();
      await page.waitForFunction(() => typeof state !== 'undefined' && typeof state.total === 'number');
      await page.waitForLoadState('networkidle');
      const initialType = await page.evaluate(() => state.riskContentType);
      if (initialType) assert.equal(await page.evaluate(() => state.total), metrics[key + (initialType === 'comment' ? 'CommentCount' : 'PostCount')]);
      // Overview links retain the chosen post/comment tab. Exercise the UI's
      // "all" filter before comparing with the combined metric.
      await page.locator('#bigPlayerContentKindFilter').selectOption('');
      await page.waitForFunction(total => state.total === total, levels[key] || 0);
      await page.waitForLoadState('networkidle');
      console.log(JSON.stringify({ stage: 'list', key, url: page.url(), total: await page.evaluate(() => state.total), kind: await page.evaluate(() => state.riskContentType) }));
      lists[key] = await page.evaluate(() => state.total);
      assert.equal(lists[key], levels[key] || 0);
      if (lists[key]) {
        await page.locator('#tableContent [data-content]').first().waitFor({ state: 'visible' });
        await page.waitForFunction(() => !document.querySelector('#tableContent .skeleton'));
        const statuses = await page.locator('.handling-status').allTextContents();
        assert.ok(statuses.length > 0);
        assert.ok(statuses.every(s => ['待处理', '已处理'].includes(s.trim())));
        const first = page.locator('[data-content]').first();
        if (await first.count()) {
          await first.click(); await page.locator('#drawerContent').waitFor({ state: 'visible' });
          await page.locator('#drawerContent .analysis-reason').waitFor({ state: 'visible' });
          assert.ok((await page.locator('#drawerContent').innerText()).trim().length > 20);
          await page.locator('#drawerClose').click();
          await page.locator('#tableContent [data-content]').first().waitFor({ state: 'visible' });
          await page.waitForFunction(() => !document.querySelector('#tableContent .skeleton'));
        }
      }
      await page.screenshot({ path: path.join(temp, `browser-${key}.png`) });
      await page.locator('#bigPlayerContentKindFilter').selectOption('comment');
      await page.waitForFunction(total => state.total === total, metrics[key + 'CommentCount']);
      await page.waitForLoadState('networkidle');
      lists[key + 'Comments'] = await page.evaluate(() => state.total);
      assert.equal(lists[key + 'Comments'], metrics[key + 'CommentCount']);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof state !== 'undefined' && state.overview?.metrics?.urgent != null);
    }
    const apis = {};
    for (const mode of ['attention', 'negative', 'urgent']) {
      const response = await page.request.get(base + '/api/public-opinion/contents?' + scope + '&riskMode=' + mode);
      assert.equal(response.status(), 200);
      const data = await response.json();
      apis[mode] = data.meta?.total ?? data.total;
      assert.equal(apis[mode], levels[mode] || 0);
      assert.ok(data.data.every(row => row.severity === mode));
    }
    assert.deepEqual(errors, []);
    const result = { at: new Date().toISOString(), url, browser: 'Edge', headless: false, realWebsite: true, metrics, values, lists, apis, errors };
    fs.writeFileSync(path.join(__dirname, 'risk_v8_live_browser_result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
