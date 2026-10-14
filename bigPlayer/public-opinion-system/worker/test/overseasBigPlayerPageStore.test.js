'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { Repository } = require('../../server/src/db/repository');
const { createOverseasBigPlayerPageStore, stripBoardInsert } = require('../src/overseasBigPlayerPageStore');
const url = 'https://club-en.q1.com/?env=1&gameId=2177&gameVersion=2177-US-ZS&languageId=16';
const fingerprint = id => crypto.createHash('sha256').update(id).digest('hex');
const account = { id: 'a', source_id: 's', game_id: 'g', community_id: 'c', platform: 'bigplayer_h5', enabled: 1 };
const source = { id: 's', game_id: 'g', community_id: 'c', platform: 'bigplayer_h5', region_code: 'overseas', enabled: 1,
  game_enabled: 1, community_status: 'enabled', siteId: 'site-x', siteUrl: url,
  config: { boardId: '100017', baseUrl: url, siteUrls: [{ siteId: 'site-x', url, enabled: true }] } };
const contract = { runId: 'r', sourceId: 's', accountId: 'a', gameId: 'g', communityId: 'c', boardId: '100017', siteId: 'site-x',
  siteUrl: url, siteUrlSha256: fingerprint(url), windowStart: '2026-10-09T00:00:00.000Z',
  windowEnd: '2026-10-10T00:00:00.000Z', manifestSha256: 'a'.repeat(64), leaseOwner: 'owner', leaseEpoch: 1 };
const clone = value => structuredClone(value);
const marker = () => ({ sourceId: 's', accountId: 'a', gameId: 'g', communityId: 'c', boardId: '100017', siteId: 'site-x', siteUrl: url, siteUrlSha256: contract.siteUrlSha256 });
const item = (id = 'post') => ({ externalId: id, boardId: '100017', contentType: 'post', contentDepth: 0, body: 'body',
  publishedAt: new Date('2026-10-09T01:00:00Z'), sourceUrl: '', fingerprint: fingerprint(id), rawPayload: { boardId: '100017' } });
const historical = (id = 'post', patch = {}) => ({ id: `uuid-${id}`, external_id: id, source_id: 's', account_id: 'a', game_id: 'g', community_id: 'c',
  content_type: 'post', content_depth: 0, body: 'old', fingerprint: fingerprint(`old-${id}`), raw_payload: JSON.stringify({ boardId: '100017', _overseasScope: marker() }), ...patch });
function fixture({ initial = [], runPatch = {}, checkpointPatch = {}, failSql, beforeCommit, verified = true, failCommit = false } = {}) {
  let rows = clone(initial), saved, commits = 0, rollbacks = 0, releases = 0, acquires = 0, destroyed = 0; const calls = [];
  const run = { id: 'r', source_id: 's', account_id: 'a', site_id: 'site-x', status: 'running', lease_owner: 'owner', lease_epoch: 1, live: 1,
    window_start: contract.windowStart, window_end: contract.windowEnd, ...runPatch };
  const cp = { id: 'cp', account_id: 'a', site_id: 'site-x', sync_scope: 'posts', root_platform_content_id: '',
    task_kind: 'q1_feed', task_key: 'feed', window_start: contract.windowStart, window_end: contract.windowEnd, lease_owner: 'owner', status: 'running', live: 1, ...checkpointPatch };
  const conn = { async query(sql, params = []) {
    calls.push({ sql, params }); if (failSql?.(sql)) throw Object.assign(new Error('fixture'), { code: 'FIXTURE_FAILURE' });
    if (sql.startsWith('SELECT *, (lease_until') && sql.includes('FROM po_sync_runs')) return [[clone(run)]];
    if (sql.startsWith('SELECT lease_owner')) return [[{ lease_owner: run.lease_owner, lease_epoch: run.lease_epoch, live: run.live }]];
    if (sql.startsWith('SELECT * FROM po_source_sites')) return [[{ source_id: 's', site_id: 'site-x', url, enabled: 1 }]];
    if (sql.startsWith('SELECT s.*,g.region_code')) return [[clone(source)]];
    if (sql.startsWith('SELECT * FROM po_accounts')) return [[clone(account)]];
    if (sql.includes('information_schema.columns')) return [['id', 'source_id', 'account_id', 'game_id', 'community_id', 'external_id', 'raw_payload', 'fingerprint'].map(column_name => ({ column_name }))];
    if (sql.startsWith('SELECT * FROM po_sync_checkpoints') || sql.startsWith('SELECT *, (lease_until>UTC_TIMESTAMP(3)) AS live FROM po_sync_checkpoints')) return [[clone(cp)]];
    if (sql.startsWith('SELECT id,external_id FROM po_contents')) return [rows.filter(row => row.source_id === params[0] && row.fingerprint === params[1]).map(row => ({ id: row.id, external_id: row.external_id }))];
    if (sql.startsWith('SELECT * FROM po_contents')) return [rows.filter(row => row.source_id === params[0] && row.external_id === params.at(-1)).map(clone)];
    if (sql.startsWith('SELECT r.id')) return [[{ id: 'r' }]];
    if (sql.startsWith('INSERT INTO po_contents')) {
      assert.ok(!/\bboard_id\b|\bboard_name\b/.test(sql));
      const columns = sql.match(/\(([^)]+)\) VALUES/)[1].split(',').map(value => value.trim());
      const value = Object.fromEntries(columns.slice(0, params.length).map((key, index) => [key, params[index]]));
      const existing = rows.find(row => row.external_id === value.external_id);
      if (existing) Object.assign(existing, { ...value, id: existing.id }); else rows.push(value);
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 1 }];
  }, async beginTransaction() { saved = clone(rows); }, async commit() { if (failCommit) throw Error('ack lost'); commits++; },
  async rollback() { rollbacks++; rows = clone(saved); }, release() { releases++; }, destroy() { destroyed++; } };
  const repo = Object.create(Repository.prototype); repo.syncUpsertLockWaitSeconds = 3;
  repo.pool = { getConnection: async () => { acquires++; return conn; } }; repo.query = async (sql, params) => (await conn.query(sql, params))[0];
  const store = createOverseasBigPlayerPageStore({ repo, verifyRunContract: async () => verified, beforeCommit });
  return { store, repo, calls, rows: () => rows, stats: () => ({ commits, rollbacks, releases, acquires, destroyed }),
    input: (items = [item()], patch = {}) => ({ source: clone(source), account: clone(account), syncRunId: 'r', leaseOwner: 'owner',
      syncScope: 'posts', items, runContract: clone(contract), ...patch }) };
}
test('legacy SQL removes only board fields and preserves values', () => {
  const result = stripBoardInsert('INSERT INTO po_contents (id, board_id, board_name, body, first_seen_at, last_seen_at) VALUES (?,?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE board_id=VALUES(board_id), board_name=VALUES(board_name), body=VALUES(body), last_seen_at=NOW()', ['i', '100017', 'n', 'b']);
  assert.deepEqual(result.params, ['i', 'b']); assert.ok(!/board_id|board_name/.test(result.sql)); assert.match(result.sql, /NOW\(\),NOW\(\)/);
});
test('actual Repository commits once per page and rerun is idempotent', async () => {
  const f = fixture(); assert.equal((await f.store.upsertContentPage(f.input())).contents[0].change, 'inserted');
  assert.equal((await f.store.upsertContentPage(f.input())).contents[0].change, 'unchanged'); assert.equal(f.rows().length, 1);
  assert.deepEqual(f.stats(), { commits: 2, rollbacks: 0, releases: 2, acquires: 2, destroyed: 0 });
});
test('empty page rejects unverified contract before connection', async () => {
  const f = fixture({ verified: false }); await assert.rejects(() => f.store.upsertContentPage(f.input([])), { code: 'OVERSEAS_STORE_CONTRACT_UNVERIFIED' }); assert.equal(f.stats().acquires, 0);
});
test('empty page fences run site and epoch', async () => {
  for (const runPatch of [{ site_id: 'other' }, { lease_epoch: 2 }]) {
    const f = fixture({ runPatch }); await assert.rejects(() => f.store.upsertContentPage(f.input([])), { code: 'OVERSEAS_STORE_RUN_SCOPE_CONFLICT' }); assert.equal(f.stats().rollbacks, 1);
  }
});
test('existing context ancestor cannot bypass conflicting scope', async () => {
  const row = historical(); const raw = JSON.parse(row.raw_payload); raw._overseasScope.boardId = '999'; row.raw_payload = JSON.stringify(raw);
  const f = fixture({ initial: [row] }); await assert.rejects(() => f.store.upsertContentPage(f.input([{ ...item(), recoveryContextAncestor: true }])), { code: 'OVERSEAS_STORE_CONTENT_SCOPE_CONFLICT' }); assert.equal(f.stats().rollbacks, 1);
});
test('unknown historical site URL fails closed', async () => {
  const f = fixture({ initial: [historical('post', { raw_payload: JSON.stringify({ boardId: '100017' }) })] });
  await assert.rejects(() => f.store.upsertContentPage(f.input()), { code: 'OVERSEAS_STORE_HISTORY_SCOPE_UNPROVEN' }); assert.equal(f.stats().commits, 0);
});
test('fingerprint collision cannot overwrite another external id', async () => {
  const f = fixture({ initial: [historical('other', { fingerprint: fingerprint('post') })] });
  await assert.rejects(() => f.store.upsertContentPage(f.input()), { code: 'OVERSEAS_STORE_FINGERPRINT_CONFLICT' }); assert.equal(f.rows()[0].external_id, 'other');
});
test('missing comment parent rolls back actual Repository', async () => {
  const f = fixture(); await assert.rejects(() => f.store.upsertContentPage(f.input([{ ...item('comment'), contentType: 'comment', contentDepth: 1, rootPlatformContentId: 'missing', platformParentId: 'missing' }], { syncScope: 'comments', rootPlatformContentId: 'missing' })), { code: 'OVERSEAS_COMMENT_PARENT_MISSING' }); assert.equal(f.rows().length, 0);
});
test('beforeCommit uses same transaction and queue failure rolls back content', async () => {
  const f = fixture({ beforeCommit: async ({ facade, contents }) => { assert.equal(contents.length, 1); await facade.query('FIXTURE_QUEUE'); throw Object.assign(new Error('queue'), { code: 'FIXTURE_QUEUE_FAILURE' }); } });
  await assert.rejects(() => f.store.upsertContentPage(f.input()), { code: 'FIXTURE_QUEUE_FAILURE' }); assert.equal(f.rows().length, 0); assert.equal(f.stats().acquires, 1); assert.equal(f.stats().commits, 0);
});
test('incoming conflicting raw marker rejects before INSERT', async () => {
  const f = fixture(); await assert.rejects(() => f.store.upsertContentPage(f.input([{ ...item(), rawPayload: { boardId: '999' } }])), { code: 'OVERSEAS_STORE_CONTENT_SCOPE_CONFLICT' }); assert.ok(!f.calls.some(call => call.sql.startsWith('INSERT INTO po_contents')));
});
test('checkpoint wrong site is rejected even on empty page', async () => {
  const f = fixture({ checkpointPatch: { site_id: 'other' } }); await assert.rejects(() => f.store.upsertContentPage(f.input([], { checkpointId: 'cp', taskKind: 'q1_feed', taskKey: 'feed', expectedCursor: null })), { code: 'OVERSEAS_STORE_CHECKPOINT_SCOPE_CONFLICT' });
});
test('stale cursor rejects before an empty page can advance checkpoint', async () => {
  const f = fixture({ checkpointPatch: { cursor: 'newer' } });
  await assert.rejects(() => f.store.upsertContentPage(f.input([], { checkpointId: 'cp', taskKind: 'q1_feed', taskKey: 'feed', expectedCursor: 'older' })), { code: 'OVERSEAS_STORE_CHECKPOINT_SCOPE_CONFLICT' });
});
test('expired checkpoint fails closed', async () => {
  const f = fixture({ checkpointPatch: { live: 0 } });
  await assert.rejects(() => f.store.upsertContentPage(f.input([], { checkpointId: 'cp', taskKind: 'q1_feed', taskKey: 'feed', expectedCursor: null })), { code: 'OVERSEAS_STORE_CHECKPOINT_SCOPE_CONFLICT' });
});
test('reply cannot attach directly to root and deleted parents reject', async () => {
  for (const patch of [{}, { is_deleted: 1 }]) {
    const f = fixture({ initial: [historical('root', patch)] });
    await assert.rejects(() => f.store.upsertContentPage(f.input([{ ...item('reply'), contentType: 'comment', contentDepth: 2,
      rootPlatformContentId: 'root', platformParentId: 'root' }], { syncScope: 'comments', rootPlatformContentId: 'root' })), { code: 'OVERSEAS_STORE_ANCESTRY_INVALID' });
  }
});
test('renewal SQL fences live run epoch and checkpoint cursor', async () => {
  const f = fixture(); await f.store.upsertContentPage(f.input([], { checkpointId: 'cp', taskKind: 'q1_feed', taskKey: 'feed', expectedCursor: null }));
  assert.match(f.calls.find(call => call.sql.startsWith('UPDATE po_sync_runs SET fetched_count=')).sql, /lease_until>UTC_TIMESTAMP\(3\) AND lease_epoch=\?/);
  assert.match(f.calls.find(call => call.sql.startsWith('UPDATE po_sync_checkpoints SET `cursor`=')).sql, /`cursor`<=>\? AND lease_until>UTC_TIMESTAMP\(3\)/);
});
test('commit acknowledgement loss destroys connection without unsafe retry', async () => {
  const f = fixture({ failCommit: true }); await assert.rejects(() => f.store.upsertContentPage(f.input()), { code: 'OVERSEAS_STORE_COMMIT_UNKNOWN' }); assert.equal(f.stats().destroyed, 1); assert.equal(f.stats().releases, 0); assert.equal(f.stats().rollbacks, 0);
});
