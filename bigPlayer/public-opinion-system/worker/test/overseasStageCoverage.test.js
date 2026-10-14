'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createOverseasStageCoverageLedger, isOverseasStageCoverageLedger, checkpointSnapshot } = require('../../server/src/db/overseasStageCoverage');
const { createOverseasBoundAudit } = require('../../server/src/db/overseasBoundAudit');
const d = { accountId: 'account-1', siteId: 'site-us', taskKind: 'comments', taskKey: 'board:100017:901', syncScope: 'comments', rootPlatformContentId: '901', windowStart: '2026-10-09T00:00:00.000Z', windowEnd: '2026-10-10T00:00:00.000Z' };
const cp = () => ({ id: 'checkpoint-1', account_id: d.accountId, site_id: d.siteId, task_kind: d.taskKind, task_key: d.taskKey, sync_scope: d.syncScope, root_platform_content_id: d.rootPlatformContentId,
  window_start: d.windowStart, window_end: d.windowEnd, status: 'completed', cursor: '{"offset":2}', items_fetched: 3, last_item_at: '2026-10-09T09:00:00.000Z' });
test('copied dependencies cannot grant ledger or audit capabilities', () => {
  assert.throws(() => createOverseasStageCoverageLedger({ journal: { read: async () => true }, receipt: { read: async () => true }, request: {} }), { code: 'OVERSEAS_COVERAGE_BRAND_REQUIRED' });
  assert.equal(isOverseasStageCoverageLedger({}), false);
  assert.throws(() => createOverseasBoundAudit({ repo: { pool: { getConnection: async () => {} } }, journal: { read: async () => true }, ledger: {} }), { code: 'OVERSEAS_AUDIT_BRAND_REQUIRED' });
});
test('checkpoint evidence preserves exact cursor bytes', () => {
  const a = checkpointSnapshot(cp(), d), b = checkpointSnapshot({ ...cp(), cursor: '{ "offset":2}' }, d);
  assert.notDeepEqual(a, b); assert.equal(a.cursor, cp().cursor);
});
test('checkpoint identity checks all scope/window/task components', () => {
  for (const [key, value] of Object.entries({ account_id: 'other', site_id: 'other', task_kind: 'q1_feed', task_key: 'other', sync_scope: 'posts', root_platform_content_id: '902', window_start: '2026-10-08T00:00:00.000Z', window_end: '2026-10-11T00:00:00.000Z' }))
    assert.throws(() => checkpointSnapshot({ ...cp(), [key]: value }, d), { code: 'OVERSEAS_COVERAGE_CHECKPOINT_CONFLICT' });
});
test('invalid counter/cursor values cannot weaken completion evidence', () => {
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, 'nan']) assert.throws(() => checkpointSnapshot({ ...cp(), items_fetched: value }, d));
  for (const cursor of [{ offset: 2 }, false, undefined]) assert.throws(() => checkpointSnapshot({ ...cp(), cursor }, d));
});
test('SQL datetime and canonical ISO represent the same checkpoint timestamps', () => {
  assert.deepEqual(checkpointSnapshot({ ...cp(), window_start: '2026-10-09 00:00:00.000', window_end: '2026-10-10 00:00:00.000', last_item_at: '2026-10-09 09:00:00.000' }, d), checkpointSnapshot(cp(), d));
});

test('strict stage-covered factory never accepts missing or copied capabilities', () => {
  const { createStageCoveredIsolatedCandidateDeps } = require('../src/overseasBigPlayerCandidateFactory');
  for (const options of [{}, { stageCoverage: { ledger: {} } }, { stageCoverage: {}, boundAudit: {} }])
    assert.throws(() => createStageCoveredIsolatedCandidateDeps(options), /Stage-covered candidate dependencies required/);
});
