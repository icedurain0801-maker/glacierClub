const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const pages = ['index', 'content', 'alerts', 'sources', 'collection-runs', 'keywords'];
const selector = 'select:is([data-po-region],[data-po-community],[data-po-platform-select])';
const snapshot = locator => locator.evaluate(element => {
  const css = getComputedStyle(element); const rect = element.getBoundingClientRect();
  return { color: css.color, background: css.backgroundColor, opacity: css.opacity, appearance: css.appearance, scheme: css.colorScheme, value: element.value, disabled: element.disabled, width: rect.width, height: rect.height };
});
function contrast(rgb) {
  const linear = rgb.match(/\d+/g).slice(0, 3).map(value => { const c = Number(value) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  return 1.05 / (linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722 + .05);
}
function readable(state) {
  assert.equal(state.background, 'rgb(255, 255, 255)');
  assert.ok(contrast(state.color) >= 4.5, state.color);
  assert.equal(state.opacity, '1'); assert.equal(state.appearance, 'auto'); assert.equal(state.scheme, 'light');
}

test('six real pages preserve scope values and geometry across readable control states', { timeout: 180000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      for (const name of pages) {
        const page = await browser.newPage({ viewport });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', entry => { if (['error', 'warning'].includes(entry.type())) errors.push(entry.text()); });
        await page.goto(`https://lfy3001.dev.q1op.com/admin/PublicOpinion/${name}.html?regionCode=domestic&communityId=00000000-0000-0000-0000-000000000101`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => PublicOpinionScope.available());
        const controls = page.locator(selector); assert.equal(await controls.count(), 3);
        const initial = [];
        for (let i = 0; i < 3; i++) {
          const control = controls.nth(i); const base = await snapshot(control); initial.push(base); readable(base);
          assert.equal(base.color, base.value ? 'rgb(31, 41, 55)' : 'rgb(102, 112, 133)');
          await control.hover(); readable(await snapshot(control));
          await control.focus(); readable(await snapshot(control));
          const focused = await snapshot(control); assert.equal(focused.width, base.width); assert.equal(focused.height, base.height); assert.equal(focused.value, base.value);
        }
        await page.screenshot({ path: `.tests/2026-09/2026-09-16/v149_${name}_${viewport.width}_normal.png`, fullPage: true });
        // Only browser DOM state changes; no selection change, event or server write.
        for (let i = 0; i < 3; i++) {
          const control = controls.nth(i); await control.evaluate(element => { element.disabled = true; });
          const state = await snapshot(control); readable(state); assert.equal(state.color, 'rgb(102, 112, 133)');
          assert.equal(state.width, initial[i].width); assert.equal(state.height, initial[i].height); assert.equal(state.value, initial[i].value);
        }
        await page.screenshot({ path: `.tests/2026-09/2026-09-16/v149_${name}_${viewport.width}_disabled.png`, fullPage: true });
        for (let i = 0; i < 3; i++) await controls.nth(i).evaluate((element, disabled) => { element.disabled = disabled; }, initial[i].disabled);
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ page: name, viewport: viewport.width, controls: initial.map(state => ({ color: state.color, contrast: contrast(state.color), value: state.value })) }));
        await page.close();
      }
    }
  } finally { await browser.close(); }
});
