const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

test('real severity collections, overview counts and both content deep links agree', { timeout: 240000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      const page = await browser.newPage({ viewport }); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', entry => { if (['error', 'warning'].includes(entry.type())) errors.push(entry.text()); });
      for (const period of ['7d', '30d']) {
        console.log(JSON.stringify({ viewport: viewport.width, period }));
        await page.goto(`https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5&period=${period}`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => state.overview?.window && document.querySelector('#viewAllNegative').href.includes('publishedTo='));
        const overview = await page.evaluate(() => ({ metrics: state.overview.metrics, negative: state.overview.hotNegative, attention: state.overview.hotAttention, hrefs: ['viewAllNegative', 'viewAllAttention'].map(id => document.getElementById(id).href) }));
        assert.equal(overview.negative.filter(item => overview.attention.some(other => other.id === item.id)).length, 0);
        for (const [i, mode, severity, items] of [[0, 'negative', 'urgent', overview.negative], [1, 'attention', 'attention', overview.attention]]) {
          console.log(JSON.stringify({ viewport: viewport.width, period, mode, total: overview.metrics[mode] }));
          assert.ok(items.length <= 10); assert.ok(items.every(item => item.severity === severity));
          const params = new URL(overview.hrefs[i]).searchParams;
          assert.equal(params.get('severity'), severity); assert.equal(params.has('sentiment'), false);
          const filters = new URLSearchParams(params); filters.delete('contentMode'); filters.delete('period'); filters.delete('riskMode');
          const statsParams = new URLSearchParams(filters); statsParams.delete('severity');
          const statsResponse = await page.request.get(`https://lfy3001.dev.q1op.com/api/public-opinion/contents/stats?${statsParams}`);
          assert.equal(statsResponse.status(), 200);
          const stats = (await statsResponse.json()).data;
          const listResponse = await page.request.get(`https://lfy3001.dev.q1op.com/api/public-opinion/contents?${filters}&riskMode=${mode}&pageSize=100`);
          assert.equal(listResponse.status(), 200); const list = await listResponse.json();
          assert.equal(overview.metrics[mode], stats[mode]); assert.equal(stats[mode], list.meta.total);
          assert.ok(list.data.every(item => item.severity === severity));
          assert.deepEqual(items.map(item => item.id), list.data.slice(0, 10).map(item => item.id));
          await page.goto(overview.hrefs[i], { waitUntil: 'networkidle' });
          await page.waitForFunction(expected => state.contentMode === expected && document.querySelector('#pageHint')?.textContent.includes('共'), mode);
          const content = await page.evaluate(() => ({ total: state.total, rows: state.contents, url: location.href }));
          assert.equal(content.total, stats[mode]); assert.ok(content.rows.every(item => item.severity === severity));
          assert.equal(new URL(content.url).searchParams.has('sentiment'), false);
          await page.reload({ waitUntil: 'networkidle' });
          assert.equal(new URL(page.url()).searchParams.get('severity'), severity);
          const otherMode = mode === 'negative' ? 'attention' : 'negative';
          const otherSeverity = otherMode === 'negative' ? 'urgent' : 'attention';
          await Promise.all([
            page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/contents') && new URL(response.url()).searchParams.get('riskMode') === otherMode),
            page.locator(`[data-content-mode="${otherMode}"]`).click()
          ]);
          await page.waitForLoadState('networkidle');
          await page.waitForFunction(expected => state.contentMode === expected.mode && state.total === expected.total && document.querySelector('#pageHint').textContent.includes(`共 ${expected.total} 条`), { mode: otherMode, total: stats[otherMode] });
          assert.equal(await page.evaluate(() => state.total), stats[otherMode]);
          assert.equal(new URL(page.url()).searchParams.get('severity'), otherSeverity);
          assert.equal(new URL(page.url()).searchParams.has('sentiment'), false);
          const displayed = await page.locator(otherMode === 'negative' ? '#statNegative' : '#statAttention').innerText();
          assert.equal(Number(displayed.replace(/,/g, '')), stats[otherMode]);
          if (period === '30d') await page.screenshot({ path: path.join(__dirname, `v153_${otherMode}_${viewport.width}.png`), fullPage: true });
        }
      }
      assert.deepEqual(errors, []); await page.close();
    }
  } finally { await browser.close(); }
});
