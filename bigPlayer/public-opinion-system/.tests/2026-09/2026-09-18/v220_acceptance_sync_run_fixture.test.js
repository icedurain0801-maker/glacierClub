'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyncRunFixture, syncRunId, syncRunSourceId } = require('../../../../.temp/public-opinion-acceptance-fixtures');

test('acceptance run fixture lists and resolves the documented non-real run', () => {
  const fixture = createSyncRunFixture();
  const listed = fixture.list(new URLSearchParams(`sourceId=${syncRunSourceId}&page=1&pageSize=20`));
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].id, syncRunId);
  assert.equal(fixture.latest(syncRunSourceId).status, 'running');
});

test('cancelling the acceptance run is memory-only and terminal', () => {
  const fixture = createSyncRunFixture();
  const cancelled = fixture.control(syncRunId, 'cancel');
  assert.equal(cancelled.status, 'cancelled');
  assert.match(cancelled.message, /未执行真实采集/);
  assert.equal(fixture.control(syncRunId, 'cancel'), false);
  assert.equal(createSyncRunFixture().get(syncRunId).status, 'running');
});

test('reset restores the documented running 3/7 fixture after cancellation', () => {
  const fixture = createSyncRunFixture();
  fixture.control(syncRunId, 'cancel');
  const reset = fixture.reset();
  assert.equal(reset.status, 'running');
  assert.equal(reset.fetched_count, 3);
  assert.equal(reset.discovered_count, 7);
  assert.match(reset.message, /未启动真实采集/);
});
