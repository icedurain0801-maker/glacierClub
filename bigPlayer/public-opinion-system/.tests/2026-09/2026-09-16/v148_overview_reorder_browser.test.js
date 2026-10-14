const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const ROOT = 'https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html';
const SCOPE = 'regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5';
const windows = [
  { name: 'alerts', from: '2026-09-09T09:21:06.000Z', to: '2026-09-09T09:21:07.000Z', alerts: true },
  { name: 'zero', from: '2026-09-09T09:21:07.000Z', to: '2026-09-09T09:21:08.000Z', alerts: false }
];

test('real alert visibility, continuous numbers and reordered legacy modules', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', entry => { if (['error', 'warning'].includes(entry.type())) errors.push(entry.text()); });
      for (const range of windows) {
        const url = `${ROOT}?${SCOPE}&publishedFrom=${encodeURIComponent(range.from)}&publishedTo=${encodeURIComponent(range.to)}`;
        console.log(JSON.stringify({ name: range.name, viewport, url }));
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => state.overview?.window && document.querySelectorAll('#metrics .metric').length === 4);
        const evidence = await page.evaluate(() => {
          const sections = [...document.querySelectorAll('.overview-workbench > .overview-section')].filter(section => !section.hidden);
          return {
            count: state.overview.activeAlerts.length,
            hidden: document.querySelector('#currentAlertsSection').hidden,
            numbers: sections.map(section => section.querySelector('.overview-section-number').textContent),
            titles: sections.map(section => section.querySelector('.overview-section-title h2').textContent),
            trendTopicsTogether: document.querySelector('#topics').closest('.overview-section') === document.querySelector('#trend').closest('.overview-section'),
            alertsIndependent: document.querySelector('#alerts').closest('.overview-section').id === 'currentAlertsSection',
            hotTopicsSeparate: document.querySelector('#topics').closest('.overview-section') !== document.querySelector('#hotList').closest('.overview-section'),
            widthFits: document.documentElement.scrollWidth <= innerWidth
          };
        });
        assert.equal(evidence.count > 0, range.alerts);
        assert.equal(evidence.hidden, !range.alerts);
        assert.deepEqual(evidence.numbers, range.alerts ? ['01', '02', '03', '04'] : ['01', '02', '03']);
        assert.deepEqual(evidence.titles, range.alerts ? ['概览', '当前告警', '趋势与处置', '内容与议题'] : ['概览', '趋势与处置', '内容与议题']);
        assert.ok(evidence.trendTopicsTogether && evidence.alertsIndependent && evidence.hotTopicsSeparate);
        if (viewport.width === 375) assert.ok(evidence.widthFits);
        for (const id of ['viewAllNegative', 'viewAllAttention']) {
          const query = new URL(await page.locator(`#${id}`).getAttribute('href'), page.url()).searchParams;
          assert.equal(Date.parse(query.get('publishedFrom')), Date.parse(range.from));
          assert.equal(Date.parse(query.get('publishedTo')), Date.parse(range.to));
          assert.equal(query.get('communityId'), '00000000-0000-0000-0000-000000000101');
          assert.equal(query.get('platform'), 'bigplayer_h5');
        }
        await page.screenshot({ path: `.tests/2026-09/2026-09-16/v148_reorder_${range.name}_${viewport.width}.png`, fullPage: true });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
