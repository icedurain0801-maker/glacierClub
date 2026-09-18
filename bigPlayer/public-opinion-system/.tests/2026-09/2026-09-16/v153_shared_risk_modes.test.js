const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const file = path.resolve(__dirname, '../../../shared/riskModes.js');
const api = require(file);
test('browser and server use one immutable severity mapping, unsupported values fail closed', () => {
  const browser = vm.createContext({}); vm.runInContext(fs.readFileSync(file, 'utf8'), browser);
  for (const [value, expected] of [['negative', 'urgent'], ['attention', 'attention'], ['normal', null], ['urgent', null], [null, null], [undefined, null], ['invalid', null]]) {
    assert.equal(api.severityForRiskMode(value), expected);
    assert.equal(browser.PublicOpinionRiskModes.severityForRiskMode(value), expected);
  }
  assert.equal(Object.isFrozen(api.MODE_TO_SEVERITY), true);
  assert.equal(new Set(Object.values(api.MODE_TO_SEVERITY)).size, 2);
  for (const owner of [api, browser.PublicOpinionRiskModes]) {
    const input = { riskMode: 'negative', sentiment: 'negative', keyword: 'risk', contentType: 'comment' };
    const result = owner.normalizeRiskFilters(input);
    assert.equal(result.severity, 'urgent'); assert.equal(result.sentiment, undefined);
    assert.equal(result.keyword, 'risk'); assert.equal(result.contentType, 'comment');
    assert.equal(input.sentiment, 'negative');
    assert.throws(() => owner.normalizeRiskFilters({ riskMode: 'negative', severity: 'normal' }), error => error.code === 'INVALID_INPUT');
  }
});
