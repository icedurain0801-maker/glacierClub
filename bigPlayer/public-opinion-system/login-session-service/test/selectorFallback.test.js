'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { BigPlayerH5PlaywrightAutomation } = require('../src/adapters/bigPlayerH5Playwright');

test('login selector skips absent and hidden Locators and returns a visible fallback', async () => {
  const automation = new BigPlayerH5PlaywrightAutomation({ credentialResolver: async () => ({}), playwright: {} });
  const frame = { locator(selector) { return { selector, first() { return this; }, async count() { return selector === 'missing' ? 0 : 1; }, async isVisible() { return selector !== 'hidden'; } }; } };
  assert.equal((await automation.firstAvailable(frame, ['missing', 'hidden', 'username'])).selector, 'username');
  assert.equal(await automation.firstAvailable(frame, ['missing', 'hidden']), null);
});
