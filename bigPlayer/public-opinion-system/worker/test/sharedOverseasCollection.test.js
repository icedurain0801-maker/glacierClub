'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scopeOf, validateCommentAncestry } = require('../../shared/overseasCommentIntegrity');
const { loadSharedCommentTargets } = require('../src/sharedOverseasCommentTargets');
const { patchRuntime, FILES } = require('../../scripts/prepare-shared-overseas-runtime.cjs');
const { checkpointTasks } = require('../../scripts/migrate-shared-overseas-checkpoints.cjs');
const source = { id: 'source', game_id: 'game', community_id: 'community', platform: 'bigplayer_h5', region_code: 'overseas', config: { boardId: '100017', siteUrls: [{ siteId: 'en', enabled: true }, { siteId: 'ko', enabled: true }, { siteId: 'ja', enabled: true }] } };
const account = { id: 'account', source_id: source.id, game_id: source.game_id, community_id: source.community_id };
function fixture() {
  const owner = { source_id: source.id, game_id: source.game_id, community_id: source.community_id, account_id: account.id };
  return { root: { ...owner, id: 'root', external_id: '1585828', content_depth: 0, root_content_id: null, raw_payload: '{"boardId":"100017"}' }, parent: { ...owner, id: 'parent', external_id: '3813698', content_depth: 1, root_content_id: 'root', raw_payload: '{"content":"unchanged"}', body: 'original body', fingerprint: 'original-fingerprint' }, raw: { externalId: 'new-reply', contentDepth: 2, rawPayload: { content: 'new reply' } } };
}
function connection({ membership = true, affectedRows = 1 } = {}) {
  const writes = [];
  return { writes, async query(sql, args) { if (sql.startsWith('SELECT')) return [membership ? [{ id: 'proof' }] : []]; writes.push({ sql, args }); return [{ affectedRows }]; } };
}
test('historical incident parent gets only verified metadata; body and fingerprint survive', async () => {
  const { root, parent, raw } = fixture(), conn = connection();
  await validateCommentAncestry(conn, scopeOf(source, account), root, parent, raw);
  assert.equal(conn.writes.length, 1); assert.equal(parent.body, 'original body'); assert.equal(parent.fingerprint, 'original-fingerprint');
  assert.equal(JSON.parse(parent.raw_payload)._overseasScope.boardId, '100017');
  assert.equal(raw.rawPayload._overseasScope.boardId, '100017');
  assert.match(conn.writes[0].sql, /raw_payload<=>\?/);
});
for (const [name, change] of [
  ['wrong community', x => x.parent.community_id = 'other'],
  ['wrong account', x => x.parent.account_id = 'other'],
  ['wrong board', x => x.parent.raw_payload = '{"boardId":"100016"}'],
  ['wrong root graph', x => x.parent.root_content_id = 'another-root'],
  ['incoming board conflict', x => x.raw.rawPayload.boardId = '100016'],
  ['invalid root depth', x => x.root.content_depth = 1]
]) test(name + ' fails before any metadata write', async () => {
  const item = fixture(), conn = connection(); change(item);
  await assert.rejects(validateCommentAncestry(conn, scopeOf(source, account), item.root, item.parent, item.raw), { code: 'OVERSEAS_COMMENT_PARENT_SCOPE_CONFLICT' }); assert.equal(conn.writes.length, 0);
});
test('root with missing marker requires matching feed evidence', async () => {
  const item = fixture(); item.root.raw_payload = '{}';
  await assert.rejects(validateCommentAncestry(connection({ membership: false }), scopeOf(source, account), item.root, item.parent, item.raw), { code: 'OVERSEAS_COMMENT_ROOT_MEMBERSHIP_REQUIRED' });
  const conn = connection(); await validateCommentAncestry(conn, scopeOf(source, account), item.root, item.parent, item.raw); assert.equal(conn.writes.length, 2);
});
test('compare-and-set race stops transaction', async () => {
  const item = fixture(); await assert.rejects(validateCommentAncestry(connection({ affectedRows: 0 }), scopeOf(source, account), item.root, item.parent, item.raw), { code: 'OVERSEAS_COMMENT_SCOPE_REPAIR_RACE' });
});
test('top-level comment repairs its root once even when two SELECTs return separate objects', async () => {
  const item = fixture(); item.root.raw_payload = '{}';
  const conn = connection(); await validateCommentAncestry(conn, scopeOf(source, account), item.root, structuredClone(item.root), item.raw);
  assert.equal(conn.writes.length, 1);
});
test('missing parent cannot be replaced with an unrelated row', async () => {
  const item = fixture(); await assert.rejects(validateCommentAncestry(connection(), scopeOf(source, account), item.root, null, item.raw), { code: 'OVERSEAS_COMMENT_PARENT_MISSING' });
});
test('domestic sources retain existing behavior', () => assert.equal(scopeOf({ ...source, region_code: 'domestic' }, account), null));
test('old receipts preserve completed and pending comment tasks with identical cursor semantics', () => {
  const run = { site_id: 'en', window_start: '2026-10-12 16:00:00.000', window_end: '2026-10-13 16:00:00.000' };
  const receipt = { siteId: 'en', boardId: '100017', commentTasks: [{ postId: '1585828', done: true }, { postId: '1585828', commentId: '3813698', sortType: 0, done: false, cursor: '{"version":1,"offsetId":"3817548","commentId":"3813698","sortType":0}' }] };
  const tasks = checkpointTasks(run, receipt); assert.equal(tasks[0].status, 'completed'); assert.equal(tasks[1].status, 'idle'); assert.equal(tasks[1].key, 'reply:3813698:0'); assert.equal(tasks[1].cursor, receipt.commentTasks[1].cursor);
  assert.equal(tasks[1].windowStart, '2026-10-12T16:00:00.000Z');
  receipt.commentTasks[1].cursor = '{"version":2,"offsetId":"3817548"}'; assert.throws(() => checkpointTasks(run, receipt), /HANDOFF_CURSOR_INCOMPATIBLE/);
});
test('historical comment discovery partitions known sites, probes unassigned once without guessing language', async () => {
  const item = fixture(); const rows = [{ ...item.root, known_site: 'ko' }, { ...item.root, external_id: '1585829', known_site: null }];
  const repo = { async query(sql) { assert.doesNotMatch(sql, /c\.board_id|board_key/); return structuredClone(rows); } };
  const result = {};
  for (const siteId of ['en', 'ko', 'ja']) result[siteId] = await loadSharedCommentTargets(repo, { ...source, siteId }, account);
  assert.deepEqual(result, { en: ['1585829'], ko: ['1585828'], ja: [] });
});
test('deployed overlay removes every special-source exclusion and keeps policy/checkpoint paths', { skip: !process.env.SHARED_OVERSEAS_BASE }, () => {
  for (const file of FILES) {
    const before = fs.readFileSync(path.join(process.env.SHARED_OVERSEAS_BASE, file), 'utf8');
    const after = patchRuntime(file, before); assert.doesNotMatch(after, /OVERSEAS_DEDICATED_COLLECTOR|081a16d2-5545-4afd-9c65-e04777e4540b/);
    if (file === 'worker/src/worker.js') { assert.match(after, /getAiAnalysisPolicy\(source.game_id, source.community_id\)/); assert.match(after, /loadSharedCommentTargets/); assert.match(after, /getSyncCheckpoint/); }
    if (file === 'server/src/db/repository.js') { assert.match(after, /validateCommentAncestry\(conn/); assert.doesNotMatch(after, /board_key/); }
  }
});
test('deployed queue compares database UTC timestamps in the collection window', { skip: !process.env.SHARED_OVERSEAS_RUNTIME }, async () => {
  const { enqueueDailyAnalysis } = require(path.join(process.env.SHARED_OVERSEAS_RUNTIME, 'worker/src/worker'));
  const previousTz = process.env.TZ; process.env.TZ = 'Asia/Shanghai';
  try {
    const queued = [], policy = { communityId: source.community_id };
    await enqueueDailyAnalysis({ aiAnalysisPolicy: policy, repo: { loadKeywordRules: async () => [], enqueueAnalysisJob: async (id, options) => queued.push({ id, options }) }, ai: { configured: () => true } }, source,
      [{ content: { id: 'utc-content', published_at: '2026-10-14 00:30:00', fingerprint: 'fp' }, raw: { body: 'new comment', fingerprint: 'fp' }, change: 'inserted' }],
      { enqueueOnly: true, publishedFrom: '2026-10-14T00:00:00Z', publishedTo: '2026-10-15T00:00:00Z' });
    assert.equal(queued.length, 1); assert.equal(queued[0].options.analysisPolicy, policy);
  } finally { if (previousTz === undefined) delete process.env.TZ; else process.env.TZ = previousTz; }
});
test('deployed missing-analysis query actually selects the stored policy payload', { skip: !process.env.SHARED_OVERSEAS_RUNTIME }, async () => {
  const { Repository } = require(path.join(process.env.SHARED_OVERSEAS_RUNTIME, 'server/src/db/repository'));
  const repo = Object.create(Repository.prototype), policy = { communityId: source.community_id };
  let queued;
  repo.query = async sql => { assert.match(sql, /SELECT c\.id, c\.fingerprint, c\.raw_payload FROM/); return [{ id: 'c', fingerprint: 'fp', raw_payload: JSON.stringify({ _aiAnalysisPolicy: policy }) }]; };
  repo.enqueueAnalysisJob = async (id, options) => { queued = options; };
  assert.equal(await repo.enqueueMissingAnalysis({ sourceId: source.id }), 1); assert.deepEqual(queued.analysisPolicy, policy);
});
test('checkpoint transaction deadlock retries the same identity without losing its cursor', { skip: !process.env.SHARED_OVERSEAS_RUNTIME }, async () => {
  const { Repository } = require(path.join(process.env.SHARED_OVERSEAS_RUNTIME, 'server/src/db/repository'));
  const repo = Object.create(Repository.prototype), input = { accountId: 'a', siteId: 'ko', taskKey: '1585828' }; let attempts = 0;
  repo._claimSyncCheckpointOnce = async value => { assert.equal(value, input); if (++attempts === 1) throw Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' }); return { id: 'checkpoint', cursor: 'preserved-cursor' }; };
  assert.deepEqual(await repo.claimSyncCheckpoint(input), { id: 'checkpoint', cursor: 'preserved-cursor' }); assert.equal(attempts, 2);
  repo._claimSyncCheckpointOnce = async () => { throw Object.assign(new Error('invalid scope'), { code: 'OWNERSHIP_MISMATCH' }); };
  await assert.rejects(repo.claimSyncCheckpoint(input), { code: 'OWNERSHIP_MISMATCH' });
});
test('manual language child completion aggregates the shared parent', { skip: !process.env.SHARED_OVERSEAS_RUNTIME }, async () => {
  const { Repository } = require(path.join(process.env.SHARED_OVERSEAS_RUNTIME, 'server/src/db/repository'));
  let committed = false;
  const conn = { beginTransaction: async () => {}, commit: async () => { committed = true; }, rollback: async () => {}, release() {}, query: async sql => {
    if (sql.startsWith('UPDATE po_sync_runs SET status=') && sql.includes('parent_run_id IS NOT NULL')) { assert.match(sql, /trigger_type IN \('scheduled_site','manual'\)/); assert.match(sql, /discovered_count=GREATEST\(discovered_count,COALESCE\(\?,discovered_count\)\)/); assert.match(sql, /stored_count=GREATEST\(stored_count,COALESCE\(\?,stored_count\)\)/); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('SELECT parent_run_id,status')) return [[{ parent_run_id: 'parent', status: 'completed_authorized_scope' }]];
    if (sql.startsWith('SELECT id,status,discovered_count')) return [[{ id: 'child', status: 'completed_authorized_scope', discovered_count: 3, stored_count: 2 }]];
    if (sql.startsWith('SELECT * FROM po_sync_runs')) return [[{ id: 'parent', status: 'completed_authorized_scope' }]];
    if (sql.startsWith('UPDATE po_sync_runs SET status=')) return [{ affectedRows: 1 }];
    throw new Error('Unexpected query');
  } };
  const repo = Object.create(Repository.prototype); repo.pool = { getConnection: async () => conn };
  const result = await repo.finishScheduledSiteRun('child', { status: 'completed_authorized_scope', leaseOwner: 'owner', leaseEpoch: 1 });
  assert.equal(result.parent.status, 'completed_authorized_scope'); assert.equal(committed, true);
});
