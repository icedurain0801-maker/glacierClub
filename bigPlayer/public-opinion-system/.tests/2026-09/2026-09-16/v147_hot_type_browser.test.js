const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

test('real hot labels match content API and overview title', { timeout: 90000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (['error', 'warning'].includes(e.type())) errors.push(e.text()); });
    await page.goto('https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html?regionCode=domestic&period=30d', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#hotList .hot-row').length > 0);
    assert.equal(await page.locator('#overviewTitle').innerText(), '概览');
    assert.doesNotMatch(await page.locator('body').innerText(), /今日概览/);
    assert.equal(await page.locator('#topics').count(), 0);
    assert.doesNotMatch(await page.locator('body').innerText(), /议题分布|话题聚类|按话题标签聚类/);
    assert.equal(await page.locator('#attentionList').count(), 1);
    const result = await page.evaluate(async () => {
      const labels = { post: '帖子', dynamic: '动态', comment: '评论', review: '评论', video: '帖子' };
      const output = [];
      for (const [selector, items] of [['#hotList', state.overview.hotNegative], ['#attentionList', state.overview.hotAttention]]) {
      for (const item of items) {
        const query = state.scope.query(); query.set('contentId', item.id);
        const response = await fetch(`/api/public-opinion/contents?${query}`);
        const body = await response.json();
        const rows = Array.isArray(body.data) ? body.data : body.data?.items || [];
        const row = rows.find(row => row.id === item.id);
        const element = document.querySelector(`${selector} [data-content="${item.id}"]`).closest('.hot-row');
        output.push({ id: item.id, actual: element.querySelector('.severity').textContent, expected: labels[row?.display_type || row?.content_type], hotType: item.display_type, contentType: row?.display_type });
      }
      }
      return output;
    });
    assert.ok(result.length);
    for (const row of result) { assert.equal(row.actual, row.expected, row.id); assert.equal(row.hotType, row.contentType, row.id); }
    assert.deepEqual(errors, []);
    for (const [id, mode] of [['viewAllNegative', 'negative'], ['viewAllAttention', 'attention']]) {
      const href = await page.locator(`#${id}`).getAttribute('href');
      const query = new URL(href, page.url()).searchParams;
      assert.equal(query.get('contentMode'), mode);
      assert.equal(query.get(mode === 'negative' ? 'sentiment' : 'severity'), mode);
      for (const key of ['regionCode', 'communityId', 'publishedFrom', 'publishedTo']) assert.ok(query.get(key));
      assert.equal(query.has('page'), false); assert.equal(query.has('contentId'), false);
    }
    console.log(JSON.stringify(result));
    await page.screenshot({ path: '.tests/2026-09/2026-09-16/v147_hot_type_desktop.png', fullPage: true });
    await page.goto('https://lfy3001.dev.q1op.com/admin/PublicOpinion/content.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101&platform=bigplayer_h5&contentMode=post&postId=916380&publishedFrom=2026-09-09T09%3A24%3A51.000Z&publishedTo=2026-09-09T09%3A24%3A52.000Z', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#tableContent .type-pill'));
    assert.equal(await page.locator('#tableContent .type-pill').first().innerText(), '动态');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
