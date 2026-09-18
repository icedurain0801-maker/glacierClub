const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const frontendDir = path.resolve(__dirname, '../../../../admin/PublicOpinion');

test('runs-only scope readability keeps values and dimensions in all states', { timeout: 90000 }, async () => {
  for (const name of ['index', 'content', 'alerts', 'sources', 'keywords']) {
    const html = fs.readFileSync(path.join(frontendDir, `${name}.html`), 'utf8');
    assert.doesNotMatch(html, /collection-runs-scope\.css|public-opinion\.css\?v=150/);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(frontendDir, 'public-opinion.css'), 'utf8'), /Scope controls also appear|body select:is\(\[data-po-region\]/);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      const page = await browser.newPage({ viewport }); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', entry => { if (['error', 'warning'].includes(entry.type())) errors.push(entry.text()); });
      await page.goto('https://lfy3001.dev.q1op.com/admin/PublicOpinion/collection-runs.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => PublicOpinionScope.available());
      const controls = page.locator('.command-bar [data-po-scope] select'); assert.equal(await controls.count(), 3);
      const read = control => control.evaluate(element => { const css = getComputedStyle(element); const rect = element.getBoundingClientRect(); return { color: css.color, background: css.backgroundColor, opacity: css.opacity, scheme: css.colorScheme, appearance: css.appearance, value: element.value, disabled: element.disabled, width: rect.width, height: rect.height }; });
      const baseline = [];
      for (let i = 0; i < 3; i++) {
        const control = controls.nth(i); const base = await read(control); baseline.push(base);
        for (const state of ['normal', 'hover', 'focus']) {
          if (state === 'hover') await control.hover(); if (state === 'focus') await control.focus();
          const actual = await read(control);
          assert.equal(actual.color, actual.value ? 'rgb(31, 41, 55)' : 'rgb(102, 112, 133)');
          assert.equal(actual.background, 'rgb(255, 255, 255)'); assert.equal(actual.opacity, '1'); assert.equal(actual.scheme, 'light'); assert.equal(actual.appearance, 'auto');
          assert.equal(actual.value, base.value); assert.equal(actual.width, base.width); assert.equal(actual.height, base.height);
        }
      }
      await page.screenshot({ path: path.join(__dirname, `v150_runs_${viewport.width}_normal.png`), fullPage: true });
      for (let i = 0; i < 3; i++) {
        const control = controls.nth(i); await control.evaluate(element => { element.disabled = true; });
        const actual = await read(control); assert.equal(actual.color, 'rgb(102, 112, 133)'); assert.equal(actual.opacity, '1'); assert.equal(actual.value, baseline[i].value); assert.equal(actual.width, baseline[i].width); assert.equal(actual.height, baseline[i].height);
      }
      await page.screenshot({ path: path.join(__dirname, `v150_runs_${viewport.width}_disabled.png`), fullPage: true });
      for (let i = 0; i < 3; i++) await controls.nth(i).evaluate((element, disabled) => { element.disabled = disabled; }, baseline[i].disabled);
      assert.deepEqual(errors, []); await page.close();
    }
  } finally { await browser.close(); }
});
