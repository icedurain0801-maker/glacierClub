const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planSiteRegistryRepair } = require('../src/services/siteRegistryRepair');
const sites = [2, 9, 16].map(n => ({ siteId: `site-${n}`, url: `https://community.example.invalid/?languageId=${n}`, enabled: true }));
const source = { id: 'source-1', platform: 'bigplayer_h5', config: JSON.stringify({ boardId: '100016', siteUrls: sites }) };
const registry = [{ site_id: 'legacy-2', url: sites[0].url, enabled: 1 }];
test('repair preserves persisted identity and adds only configured missing sites', () => {
  const before = JSON.stringify(registry), plan = planSiteRegistryRepair(source, registry);
  assert.deepEqual(plan.retainedSiteIds, ['legacy-2']);
  assert.deepEqual(plan.additions.map(s => s.siteId), ['site-9', 'site-16']);
  assert.equal(JSON.parse(plan.afterConfig).siteUrls[0].siteId, 'legacy-2');
  assert.equal(JSON.parse(plan.afterConfig).boardId, '100016');
  assert.equal(JSON.stringify(registry), before);
  assert.equal(plan.hash, planSiteRegistryRepair(source, registry).hash);
});
test('repair refuses ambiguous URLs, ID collisions, enabled changes and extra enabled sites', () => {
  for (const rows of [
    [...registry, { ...registry[0], site_id: 'other' }],
    [...registry, { site_id: 'site-9', url: 'https://other.example.invalid/', enabled: 0 }],
    [{ ...registry[0], enabled: 0 }],
    [...registry, { site_id: 'extra', url: 'https://extra.example.invalid/', enabled: 1 }],
  ]) assert.throws(() => planSiteRegistryRepair(source, rows), /REPAIR_/);
});
test('aligned registry needs no additions and preserves all identities', () => {
  const plan = planSiteRegistryRepair(source, sites.map(s => ({ site_id: s.siteId, url: s.url, enabled: 1 })));
  assert.equal(plan.additions.length, 0);
  assert.deepEqual(JSON.parse(plan.afterConfig).siteUrls.map(s => s.siteId), sites.map(s => s.siteId));
});
