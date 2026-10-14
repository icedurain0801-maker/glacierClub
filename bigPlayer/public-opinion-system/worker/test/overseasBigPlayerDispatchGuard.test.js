'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const { createOverseasRunContractJournal } = require('../src/overseasBigPlayerRunContractJournal');
const { createOverseasDispatchGuard, bindOverseasDispatchScope } = require('../src/overseasBigPlayerDispatchGuard');
async function fixture({ commitUnknown = false, rejectResponse = false, transportImpl } = {}) {
  const ids = Array.from({ length: 5 }, (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`);
  const [runId, sourceId, accountId, gameId, communityId] = ids;
  const url = 'https://club-en.q1.com/?env=1&gameId=2&gameVersion=1&languageId=1', hash = crypto.createHash('sha256').update(url).digest('hex');
  const c = { runId, sourceId, accountId, gameId, communityId, siteId: 'site-en', boardId: '100017', siteUrl: url, siteUrlSha256: hash,
    windowStart: '2026-10-09T00:00:00.000Z', windowEnd: '2026-10-10T00:00:00.000Z', leaseOwner: 'owner', leaseEpoch: 1, manifestSha256: 'a'.repeat(64) };
  const account = { id: accountId, source_id: sourceId, game_id: gameId, community_id: communityId, platform: 'bigplayer_h5' };
  const source = { id: sourceId, game_id: gameId, community_id: communityId, platform: 'bigplayer_h5', region_code: 'overseas', siteId: c.siteId,
    siteUrl: url, account, config: { boardId: c.boardId, baseUrl: url, siteUrls: [{ siteId: c.siteId, url, enabled: true }] } };
  const row = { r_id: runId, r_source_id: sourceId, r_account_id: accountId, r_site_id: c.siteId, r_owner: c.leaseOwner, r_epoch: 1, r_live: 1,
    r_status: 'running', r_start: c.windowStart, r_end: c.windowEnd, s_id: sourceId, s_game: gameId, s_community: communityId,
    a_id: accountId, a_source: sourceId, a_game: gameId, a_community: communityId, g_id: gameId, cm_id: communityId, cm_game: gameId,
    st_id: c.siteId, st_url: url, st_hash: hash, s_platform: 'bigplayer_h5', a_platform: 'bigplayer_h5', g_region: 'overseas',
    s_enabled: 1, a_enabled: 1, g_enabled: 1, st_enabled: 1, cm_status: 'enabled', s_config: source.config };
  const events = [], repositoryRoot = path.resolve(__dirname, '../../../..'), directory = await fs.mkdtemp(path.join(repositoryRoot, '.temp', 'overseas-dispatch-test-'));
  const journal = await createOverseasRunContractJournal({ repositoryRoot, directory }); await journal.create(c);
  const conn = { async query(sql) { events.push(sql); return sql.includes('r.id AS r_id') ? [[{ ...row }]] : [[]]; },
    async beginTransaction() { events.push('begin'); }, async commit() { events.push('commit'); if (commitUnknown) throw Error('ack'); },
    async rollback() { events.push('rollback'); }, release() { events.push('release'); }, destroy() { events.push('destroy'); } };
  let sends = 0, complete;
  const guard = createOverseasDispatchGuard({ repo: { pool: { getConnection: async () => conn } }, journal, manifestSha256: c.manifestSha256,
    transport(url, options) { sends++; events.push('dispatch'); if (transportImpl) return transportImpl(url, options);
      return rejectResponse ? Promise.reject(Error('response rejected')) : new Promise(resolve => { complete = resolve; }); } });
  bindOverseasDispatchScope(source, account, c);
  return { guard, source, account, row, events, repo: { query: async () => [] }, sends: () => sends, complete: () => complete({ ok: true }) };
}
test('unbound direct dispatch and cross-site copied source fail before transport', async () => {
  const f = await fixture(); await assert.rejects(() => f.guard.transport('/'), { code: 'OVERSEAS_DISPATCH_SCOPE_UNBOUND' });
  assert.throws(() => f.guard.invoke({ ...f.source, siteId: 'other' }, f.account, () => {}), { code: 'OVERSEAS_DISPATCH_SCOPE_INVALID' });
  assert.equal(f.sends(), 0);
});
for (const phase of ['token_exchange', 'detail', 'comments', 'retry']) test(`epoch lost after asynchronous preparation rejects ${phase} dispatch`, async () => {
  const f = await fixture();
  await assert.rejects(() => f.guard.invoke({ ...f.source }, f.account, async () => {
    await Promise.resolve(); f.row.r_epoch = 2; f.row.r_owner = 'new-owner';
    return f.guard.transport(`https://club-en.q1.com/api/club/v1/${phase}`);
  }), { code: 'OVERSEAS_NETWORK_CONTRACT_UNVERIFIED' });
  assert.equal(f.sends(), 0); assert.ok(f.events.includes('rollback')); assert.ok(f.events.includes('release'));
});
test('dispatch initiates before commit and releases locks before response resolves', async () => {
  const f = await fixture(), pending = f.guard.invoke(f.source, f.account, () => f.guard.transport('https://club-en.q1.com/api/club/v1/detail'));
  while (!f.events.includes('release')) await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.sends(), 1); assert.ok(f.events.indexOf('dispatch') < f.events.indexOf('commit'));
  f.complete(); assert.deepEqual(await pending, { ok: true });
});
test('commit unknown after dispatch destroys connection and never sends twice', async () => {
  const f = await fixture({ commitUnknown: true, rejectResponse: true });
  await assert.rejects(() => f.guard.invoke(f.source, f.account, () => f.guard.transport('https://club-en.q1.com/api/club/v1/detail')), { code: 'OVERSEAS_DISPATCH_COMMIT_UNKNOWN' });
  assert.throws(() => f.guard.invoke({ ...f.source }, f.account, () => {}), { code: 'OVERSEAS_DISPATCH_CONTRACT_CLOSED' });
  assert.equal(f.sends(), 1); assert.ok(f.events.includes('destroy')); assert.ok(!f.events.includes('rollback')); assert.ok(!f.events.includes('release'));
});
test('even a bound isolated transport cannot dispatch to another origin', async () => {
  const f = await fixture();
  await assert.rejects(() => f.guard.invoke(f.source, f.account, () => f.guard.transport('https://example.com/api/club/v1/post')), { code: 'OVERSEAS_DISPATCH_URL_INVALID' });
  assert.equal(f.sends(), 0);
});
for (const phase of ['token_exchange', 'detail', 'comments', 'retry']) test(`actual adapter blocks stale ${phase} request after asynchronous preparation`, async () => {
  const paths = [], f = await fixture({ transportImpl(url) {
    const u = new URL(url); paths.push(u.pathname);
    return Promise.resolve({ ok: true, status: 200, url: String(u), json: async () => ({ code: 0, data: { token: 'synthetic-site-token' } }) });
  } });
  const { createOverseasBigPlayerAdapter } = require('../src/overseasBigPlayerAdapter');
  const adapter = createOverseasBigPlayerAdapter({ repo: f.repo, transport: f.guard.transport, dispatchGuard: f.guard,
    credentialContext: { loadApiToken: async () => 'synthetic-base-token' } });
  const source = { ...f.source, __recordHttpRequest: async ({ url }) => {
    await Promise.resolve();
    if (phase === 'token_exchange' ? new URL(url).pathname.endsWith('/login/token') : !new URL(url).pathname.endsWith('/login/token')) {
      f.row.r_epoch = 2; f.row.r_owner = 'new-owner';
    }
  } };
  try {
    const operation = phase === 'detail' ? () => adapter.connector.enrichQ1FeedItems({ source, account: f.account, items: [{ id: 123 }], apiToken: 'synthetic-base-token', page: 1, signal: new AbortController().signal })
      : () => adapter.connector.requestQ1(phase === 'comments' ? '/api/club/v1/auth/comment/123' : '/api/club/v1/auth/post/', source, 'synthetic-base-token', {}, 1, 'posts', phase === 'retry');
    await assert.rejects(operation, { code: 'OVERSEAS_NETWORK_CONTRACT_UNVERIFIED' });
    assert.equal(paths.length, phase === 'token_exchange' ? 0 : 1);
    assert.ok(paths.every(p => p.endsWith('/login/token')));
  } finally { adapter.close(); }
});
