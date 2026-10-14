const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

test('negative-only risk palette preserves geometry and attention column', { timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', entry => { if (['error', 'warning'].includes(entry.type())) errors.push(entry.text()); });
      await page.goto('https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html?period=30d&regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.querySelector('#hotList .hot-row') && document.querySelector('#attentionList .hot-row'));
      const lists = await page.evaluate(() => [state.overview.hotNegative, state.overview.hotAttention].map(items => items.map(item => ({ id: item.id, published: new Date(item.published_at).getTime() }))));
      for (const items of lists) {
        assert.ok(items.length > 0 && items.length <= 10);
        assert.deepEqual(items, [...items].sort((a, b) => b.published - a.published || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)));
      }
      for (const id of ['hotList', 'attentionList']) assert.equal(await page.locator(`#${id}`).evaluate(element => element.closest('article').querySelector('small').textContent), '按发布时间倒序');
      const evidence = await page.evaluate(() => {
        const card = document.querySelector('#hotList').closest('article');
        const read = selector => [...document.querySelectorAll(selector)].map(element => {
          const css = getComputedStyle(element); const rect = element.getBoundingClientRect();
          return { color: css.color, background: css.backgroundColor, shadow: css.boxShadow, width: rect.width, height: rect.height, padding: css.padding, margin: css.margin, gap: css.gap, text: element.textContent, href: element.getAttribute('href'), content: element.dataset.content };
        });
        const negativeSelector = '#hotList .hot-row, #hotList .severity, #hotList .row-title, #hotList .row-meta, #hotList .row-action, #viewAllNegative';
        const attentionSelector = '#attentionList .hot-row, #attentionList .severity, #attentionList .row-title, #attentionList .row-meta, #attentionList .row-action, #viewAllAttention';
        const negative = read(negativeSelector); const attention = read(attentionSelector);
        const classes = card.className;
        card.className = 'page-card';
        const original = read(negativeSelector); const attentionOriginal = read(attentionSelector);
        card.className = classes;
        return { negative, original, attention, attentionOriginal, title: getComputedStyle(card.querySelector('h2')).color, fits: document.documentElement.scrollWidth <= innerWidth };
      });
      assert.deepEqual(evidence.attention, evidence.attentionOriginal);
      for (let i = 0; i < evidence.negative.length; i++) {
        for (const key of ['width', 'height', 'padding', 'margin', 'gap', 'text', 'href', 'content']) assert.equal(evidence.negative[i][key], evidence.original[i][key], key);
      }
      assert.equal(evidence.title, 'rgb(153, 27, 27)');
      for (const row of await page.locator('#hotList .hot-row').all()) {
        const css = await row.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, shadow: getComputedStyle(element).boxShadow }));
        assert.equal(css.background, 'rgb(255, 247, 247)'); assert.match(css.shadow, /inset/); assert.match(css.shadow, /3px/);
      }
      for (const selector of ['#hotList .row-action', '#viewAllNegative', '#hotList .severity']) {
        assert.equal(await page.locator(selector).first().evaluate(element => getComputedStyle(element).color), 'rgb(153, 27, 27)');
      }
      await page.locator('#viewAllNegative').hover();
      assert.equal(await page.locator('#viewAllNegative').evaluate(element => getComputedStyle(element).color), 'rgb(153, 27, 27)');
      await page.locator('#viewAllNegative').focus();
      assert.equal(await page.locator('#viewAllNegative').evaluate(element => getComputedStyle(element).color), 'rgb(153, 27, 27)');
      assert.ok(evidence.fits); assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(__dirname, `v152_negative_risk_${viewport.width}.png`), fullPage: true });
      await page.close();
    }
  } finally { await browser.close(); }
});
