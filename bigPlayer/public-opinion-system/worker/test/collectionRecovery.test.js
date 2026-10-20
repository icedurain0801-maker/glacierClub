const test = require('node:test');
const assert = require('node:assert/strict');
const { syncStage, runOnce, normalizePlatformItem, rateLimitRetry } = require('../src/worker');
const { recoverExpiredRuns } = require('../src/workerScanLease');
const { DiscordConnector } = require('../../server/src/connectors/discordConnector');

test('TapTap continues across checkpoint budgets without replaying committed pages', async () => {
  let cursor = null, claims = 0; const visited = [];
  const repo = {
    async claimSyncCheckpoint() { claims++; return { id: 'cp', cursor }; },
    async upsertContentPage(input) { cursor = input.nextCursor; return { contents: [], storedCount: 0 }; },
    async releaseSyncCheckpoint(_, patch) { cursor = patch.cursor; }
  };
  const connector = { async listPosts(input) { const n = Number(input.cursor || 0); visited.push(n); return { items: [], nextCursor: n < 4 ? String(n + 1) : null, hasMore: n < 4, capability: 'owned_scope' }; } };
  const result = await syncStage({ repo, pageBudget: 2, leaseOwner: 'test', leaseSeconds: 30, pageSize: 10 }, { source: { id: 'tap', platform: 'taptap' }, account: { id: 'account' }, connector, scope: 'posts', syncMode: 'incremental' });
  assert.equal(result.completed, true); assert.equal(claims, 3); assert.deepEqual(visited, [0, 1, 2, 3, 4]);
});

test('TapTap continuation remains bounded and never invents completion', async () => {
  let cursor = null;
  const repo = { async claimSyncCheckpoint() { return { id: 'cp', cursor }; }, async upsertContentPage(input) { cursor = input.nextCursor; return { contents: [] }; }, async releaseSyncCheckpoint(_, patch) { cursor = patch.cursor; } };
  const result = await syncStage({ repo, pageBudget: 1, stageContinuationBatches: 2 }, { source: { platform: 'taptap' }, account: { id: 'a' }, connector: { async listPosts(input) { return { items: [], nextCursor: String(Number(input.cursor || 0) + 1), hasMore: true }; } }, scope: 'posts', syncMode: 'incremental' });
  assert.equal(result.completed, false); assert.equal(cursor, '2');
});

test('scan recovers during long work and can pick up a deferred run again', async () => {
  let recoveries = 0, visits = 0; const retry = { id: 'retry', source_id: 's1', account_id: 'a1', trigger_type: 'scheduled' }, long = { id: 'long', source_id: 's2', account_id: 'a2', trigger_type: 'scheduled' };
  const repo = { pool: {}, async query(sql) { if (sql.startsWith('UPDATE po_sync_runs')) recoveries++; return { affectedRows: 0 }; }, async listRunnableSyncRuns() { return visits < 2 ? [retry, long] : [long]; }, async listManualDueSources() { return []; }, async listDueSources() { return []; } };
  let longStarted = false;
  await runOnce({ repo, scanLease: { async acquire() { return {}; }, async renew() { return true; }, async release() { return true; } }, sourceConcurrency: 2, queuePollIntervalMs: 250, runSource: async (_, source, run) => { if (run.id === 'retry') { visits++; return; } assert.equal(longStarted, false); longStarted = true; await new Promise(resolve => setTimeout(resolve, 650)); } });
  assert.equal(visits, 2); assert(recoveries >= 2);
});

test('recovery preserves rate-limit deferrals and future eligibility', async () => {
  await recoverExpiredRuns(async sql => { assert.match(sql, /NOT IN \('SYNC_ACCOUNT_BUSY','RATE_LIMITED'\)/); assert.match(sql, /next_retry_at<=UTC_TIMESTAMP/); return { affectedRows: 0 }; });
  const retry = rateLimitRetry({ code: 'RATE_LIMITED', retryAfterMs: 1000 }, { attempts: 4 }, 0);
  assert.equal(retry.nextRetryAt, '1970-01-01T00:00:40.000Z');
  assert.equal(rateLimitRetry({ code: 'RATE_LIMITED' }, { attempts: 5 }).terminal, true);
});

test('Discord owned feed includes replies once and keeps comment identity', async () => {
  let requests = 0;
  const connector = new DiscordConnector({ DISCORD_ENABLED: 'true' }, { credentialContext: { async loadApiToken() { return 'test-token'; } }, fetchImpl: async () => { requests++; return { ok: true, async json() { return [{ id: '523456789012345678', content: 'reply', timestamp: '2026-10-15T06:00:00Z', author: { id: '623456789012345678' }, message_reference: { message_id: '423456789012345678' } }]; } }; } });
  const page = await connector.listOwnedContents({ source: { config: { guildId: '123456789012345678', channelIds: ['223456789012345678'] } }, account: { id: 'a' }, limit: 100 });
  assert.equal(requests, 1); assert.equal(connector.commentsIncludedInOwnedFeed, true);
  const item = normalizePlatformItem(page.items[0], { platform: 'discord', scope: 'posts' });
  assert.equal(item.contentType, 'comment'); assert.equal(item.platformParentId, '423456789012345678'); assert.equal(item.rootPlatformContentId, '423456789012345678'); assert.equal(item.contentDepth, 1);
});

test('Discord mixed-feed replies are associated and counted as comments, not posts', async () => {
  const { Repository } = require('../../server/src/db/repository');
  const repo = new Repository({ DB_HOST: '127.0.0.1', DB_NAME: 'never_connects' }); const calls = [];
  const conn = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, async query(sql, params) {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT r.id FROM po_sync_runs')) return [[{ id: 'run' }]];
    if (sql.startsWith('SELECT id FROM po_contents')) return [[{ id: 'root' }]];
    if (sql.startsWith('SELECT * FROM po_contents')) return [[{ id: 'reply', external_id: 'reply-external', content_type: 'comment' }]];
    return { affectedRows: 1 };
  } }; repo.pool = { async getConnection() { return conn; } };
  await repo.upsertContentPage({ account: { id: 'a', game_id: 'g', source_id: 's', platform: 'discord' }, syncRunId: 'run', syncScope: 'posts', leaseOwner: 'w', items: [{ externalId: 'reply-external', contentType: 'comment', platformParentId: 'parent', rootPlatformContentId: 'parent', body: 'reply' }] });
  assert.equal(calls.find(x => x.sql.startsWith('INSERT IGNORE INTO po_sync_run_contents')).params[3], 'comments');
  assert.deepEqual(calls.find(x => x.sql.startsWith('UPDATE po_sync_runs SET fetched_count')).params.slice(0, 5), [0, 0, 0, 0, 1]);
});
