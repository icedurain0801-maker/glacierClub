const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../../server/src/app.js'), 'utf8');
const start = source.indexOf('function overviewPeriodRange(');
const end = source.indexOf('function parseOverviewQuery(', start);
const context = vm.createContext({ Date });
vm.runInContext(source.slice(start, end), context);

test('today and yesterday use Shanghai natural days including midnight', () => {
  for (const now of ['2026-09-15T16:00:00.000Z', '2026-09-16T04:00:00.000Z', '2026-09-16T15:59:59.999Z']) {
    const today = context.overviewPeriodRange('today', new Date(now));
    const yesterday = context.overviewPeriodRange('yesterday', new Date(now));
    assert.equal(today.from, '2026-09-15T16:00:00.000Z');
    assert.equal(today.to, '2026-09-16T16:00:00.000Z');
    assert.equal(yesterday.from, '2026-09-14T16:00:00.000Z');
    assert.equal(yesterday.to, today.from);
    for (const range of [today, yesterday]) {
      const contains = timestamp => Date.parse(timestamp) >= Date.parse(range.from) && Date.parse(timestamp) < Date.parse(range.to);
      assert.equal(contains(range.from), true);
      assert.equal(contains(range.to), false);
      assert.equal(contains(new Date(Date.parse(range.from) - 1).toISOString()), false);
      assert.equal(contains(new Date(Date.parse(range.to) - 1).toISOString()), true);
      assert.equal(Date.parse(range.to) - Date.parse(range.from), 86400000);
    }
  }
  const next = context.overviewPeriodRange('today', new Date('2026-09-16T16:00:00.000Z'));
  assert.equal(next.from, '2026-09-16T16:00:00.000Z');
  assert.equal(next.to, '2026-09-17T16:00:00.000Z');
});
