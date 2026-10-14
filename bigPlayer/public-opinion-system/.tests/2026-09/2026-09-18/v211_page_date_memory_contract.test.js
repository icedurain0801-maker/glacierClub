const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../..');
const content = fs.readFileSync(path.resolve(root, '../admin/PublicOpinion/assets/content.js'), 'utf8');
const overview = fs.readFileSync(path.resolve(root, '../admin/PublicOpinion/assets/app.js'), 'utf8');

test('content page resolves URL before its own date memory, defaults to today, and clears memory for an empty range', () => {
  const values = new Map();
  global.window = { PublicOpinionRiskModes: { severityForRiskMode: () => 'urgent' }, localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
  const modulePath = path.resolve(root, '../admin/PublicOpinion/assets/content.js'); delete require.cache[modulePath];
  const api = require(modulePath);
  values.set('public-opinion:content:published-range', JSON.stringify({ from: '2026-09-10', to: '2026-09-11' }));
  assert.deepEqual(api.resolvePublishedRange(new URLSearchParams('publishedFrom=2026-09-12&publishedTo=2026-09-12')), { from: '2026-09-12', to: '2026-09-12', exact: null });
  assert.deepEqual(api.resolvePublishedRange(new URLSearchParams('publishedFrom=not-a-date')), { from: '2026-09-10', to: '2026-09-11', exact: null });
  assert.equal(api.validDateRange({ from: '2026-02-29', to: '2026-02-29' }), false);
  assert.match(content, /const CONTENT_DATE_STORAGE_KEY = 'public-opinion:content:published-range'/);
  assert.match(content, /function resolvePublishedRange\(params, storage = window\.localStorage\)/);
  assert.match(content, /return saved \? \{ \.\.\.saved, exact: null \} : \{ from: localDateString\(new Date\(\)\), to: localDateString\(new Date\(\)\), exact: null \}/);
  assert.match(content, /if \(validDateRange\(range\)\) storage\.setItem[\s\S]*?else storage\.removeItem/);
  assert.match(content, /const restoredRange = resolvePublishedRange\(params\)/);
  assert.match(content, /loadStats\(\); await load\(\);/);
});

test('overview page resolves URL before its own period memory and refreshes through load', () => {
  const values = new Map([['public-opinion:overview:period', 'yesterday']]);
  const context = { window: { location: { search: '' }, localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }, URLSearchParams, Object };
  const resolverSource = overview.slice(overview.indexOf('const PERIOD_LABELS'), overview.indexOf('const state ='));
  vm.runInNewContext(`${resolverSource}; this.resolveOverviewPeriod = resolveOverviewPeriod;`, context);
  assert.equal(context.resolveOverviewPeriod(new URLSearchParams('period=30d')), '30d');
  assert.equal(context.resolveOverviewPeriod(new URLSearchParams('period=broken')), 'yesterday');
  values.delete('public-opinion:overview:period');
  assert.equal(context.resolveOverviewPeriod(new URLSearchParams()), 'today');
  assert.match(overview, /const OVERVIEW_PERIOD_STORAGE_KEY = 'public-opinion:overview:period'/);
  assert.match(overview, /function resolveOverviewPeriod\(params = new URLSearchParams\(window\.location\.search\), storage = window\.localStorage\)/);
  assert.match(overview, /return validPeriod\(requested\) \? requested : readSavedPeriod\(storage\) \|\| 'today'/);
  assert.match(overview, /savePeriod\(state\.period\); state\.window = null/);
  assert.match(overview, /state\.period = resolveOverviewPeriod\(new URLSearchParams\(location\.search\)\); await load\(\);/);
});
