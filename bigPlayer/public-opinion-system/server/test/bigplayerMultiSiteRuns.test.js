const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateParentStatus, childRunDefinitions, removeInFlightSite } = require('../src/services/bigplayerMultiSiteRuns');

test('parent aggregation waits, then reports completed/partial/failed', () => {
  assert.equal(aggregateParentStatus([{ status: 'completed' }, { status: 'running' }]), 'running');
  assert.equal(aggregateParentStatus([{ status: 'completed' }, { status: 'completed_full' }]), 'completed');
  assert.equal(aggregateParentStatus([{ status: 'completed' }, { status: 'failed' }]), 'partial');
  assert.equal(aggregateParentStatus([{ status: 'failed' }, { status: 'cancelled' }]), 'failed');
});

test('child definitions preserve parent/site/window audit identity and skip disabled sites', () => {
  const children = childRunDefinitions('p1', [{ siteId: 'a', enabled: true }, { siteId: 'b', enabled: false }, { siteId: 'c' }], { sourceId: 's1', accountId: 'a1', windowStart: '2026-09-18T00:00:00Z', windowEnd: '2026-09-19T00:00:00Z' });
  assert.deepEqual(children.map(child => child.siteId), ['a', 'c']);
  assert.equal(children[0].parentRunId, 'p1');
  assert.equal(children[0].windowEnd, '2026-09-19T00:00:00Z');
});

test('removing an in-flight site fails only that child and preserves terminal history', () => {
  const children = removeInFlightSite([
    { siteId: 'a', status: 'running' },
    { siteId: 'b', status: 'completed' },
    { siteId: 'c', status: 'failed', errorCode: 'OLD' }
  ], 'a');
  assert.equal(children[0].status, 'failed');
  assert.equal(children[0].errorCode, 'SITE_REMOVED');
  assert.equal(children[1].status, 'completed');
  assert.equal(children[2].errorCode, 'OLD');
});
