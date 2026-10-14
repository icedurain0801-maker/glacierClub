'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { recoverDomesticToday, validateScope, SOURCE_ID, ACCOUNT_ID, COMMUNITY_ID, WINDOW_START } = require('../src/domesticTodayRecovery');
const { domesticDetailConnector } = require('../../server/src/connectors/domesticTodayDetailConnector');
function fixture() {
  const source = { id: SOURCE_ID, community_id: COMMUNITY_ID, game_id: 'g', platform: 'bigplayer_h5',
    enabled: 1, auth_status: 'authorized', region_code: 'domestic',
    config: { boardId: 2, baseUrl: 'https://club.q1.com/?env=web&gameId=2131&gameVersion=2131-CN-ZS&lang=zh-CN' } };
  const account = { id: ACCOUNT_ID, source_id: SOURCE_ID, community_id: COMMUNITY_ID, game_id: 'g', platform: 'bigplayer_h5', enabled: 1, auth_status: 'authorized' };
  source.config.siteUrls = [{ siteId: 'site-7586e54f3a0cb84f433d59cf6baa1d4d', url: source.config.baseUrl, enabled: true }];
  const plan = { sourceId: SOURCE_ID, accountId: ACCOUNT_ID, publishedFrom: WINDOW_START, publishedTo: '2026-10-09T04:31:29.177Z', maxPages: 1, analysisVersion: 'test' };
  const today = { externalId: '926895', boardId: '2', contentType: 'post', title: 'title', body: 'detail',
    publishedAt: '2026-10-09T04:15:13Z', sourceUrl: 'https://club.q1.com/api/club/v1/auth/post/?postId=926895&source=0',
    rawPayload: { _contentIntegrity: { status: 'detail_enriched' } } };
  let cp = { id: 'cp', status: 'idle', cursor: null }, locked = false, failAi = false;
  const calls = [], stored = new Map();
  const repo = {
    acquireAdvisoryLock: async name => { calls.push(['lock', name]); locked = true; return true; },
    releaseAdvisoryLock: async () => { locked = false; },
    getSyncCheckpoint: async () => cp,
    claimSyncCheckpoint: async input => { cp = { ...cp, status: 'running', lease_owner: input.leaseOwner }; return { ...cp }; },
    upsertContentPage: async input => {
      calls.push(['store', input.nextCursor]);
      cp.cursor = input.nextCursor;
      return { contents: input.items.map(item => {
        const change = stored.has(item.externalId) ? 'unchanged' : 'inserted'; stored.set(item.externalId, item);
        return { change, content: { id: item.externalId, is_deleted: false } };
      }) };
    },
    enqueueAnalysisBatch: async input => { calls.push(['ai', input.contentIds]); if (failAi) throw Object.assign(new Error('ai'), { code: 'TEST_AI' }); return { submitted: input.contentIds.length, failed: 0 }; },
    releaseSyncCheckpoint: async (_id, input) => { cp.status = input.status; cp.lease_owner = null; if (Object.hasOwn(input, 'cursor')) cp.cursor = input.cursor; return { ...cp }; }
  };
  const connector = {
    enrichQ1FeedItems: async input => ({ items: input.items.map(item => ({ ...today, publishedAt: item.createTime })) }),
    listFeedContents: async function(input) {
      assert.equal(input.dailyBounded, false); calls.push(['request', input.cursor]);
      const enriched = await this.enrichQ1FeedItems({ items: [{ id: 'pin', createTime: '2026-10-08T13:21:27Z' }, { id: '926895', createTime: today.publishedAt }] });
      return { items: enriched.items, hasMore: true, nextCursor: 'next', raw: { paginationDiagnostics: {} } };
    }
  };
  return { source, account, plan, repo, connector, today, calls, stored, get cp() { return cp; }, get locked() { return locked; }, set failAi(value) { failAi = value; }, now: Date.parse('2026-10-09T04:40:00Z') };
}
test('scope locks source/account/site/day and rejects future or seven-day plan', () => {
  const f = fixture(); assert.doesNotThrow(() => validateScope(f));
  for (const patch of [{ sourceId: 'overseas' }, { publishedFrom: '2026-10-02T00:00:00Z' }, { publishedTo: '2026-10-09T16:00:00Z' }]) {
    assert.throws(() => validateScope({ ...f, plan: { ...f.plan, ...patch } }));
  }
  assert.throws(() => validateScope({ ...f, account: { ...f.account, community_id: '102' } }));
});
test('pinned yesterday is not enriched; today stored before AI and partial checkpoint resumes', async () => {
  const f = fixture(), report = await recoverDomesticToday(f);
  assert.equal(report.status, 'PARTIAL_TODAY'); assert.equal(report.inserted, 1);
  assert.equal(f.stored.size, 1); assert.equal(f.cp.cursor, 'next'); assert.equal(f.locked, false);
  assert.equal(f.calls[0][1], `public-opinion-sync-account-${ACCOUNT_ID}`);
  assert.ok(f.calls.findIndex(x => x[0] === 'store') < f.calls.findIndex(x => x[0] === 'ai'));
});
test('AI failure replays request cursor and queues unchanged content on retry', async () => {
  const f = fixture(); f.failAi = true;
  await assert.rejects(recoverDomesticToday(f), { code: 'TEST_AI' });
  assert.equal(f.cp.cursor, null); assert.equal(f.cp.status, 'idle'); assert.equal(f.locked, false);
  f.failAi = false; const report = await recoverDomesticToday(f);
  assert.equal(report.unchanged, 1); assert.equal(report.aiQueued, 1); assert.equal(f.cp.cursor, 'next');
});
test('summary fallback cannot advance or write checkpoint', async () => {
  const f = fixture(); f.today.rawPayload._contentIntegrity.status = 'summary_fallback';
  await assert.rejects(recoverDomesticToday(f), { code: 'DOMESTIC_DETAIL_REQUIRED' });
  assert.equal(f.stored.size, 0); assert.equal(f.cp.cursor, null);
});
test('no time boundary early stop: older page must allow later today page', async () => {
  const f = fixture(); f.plan.maxPages = 2; let n = 0;
  f.connector.listFeedContents = async () => ++n === 1
    ? { items: [], hasMore: true, nextCursor: 'older', raw: { paginationDiagnostics: {} } }
    : { items: [f.today], hasMore: false, nextCursor: null, raw: { paginationDiagnostics: {} } };
  const report = await recoverDomesticToday(f);
  assert.equal(report.pages, 2); assert.equal(report.inserted, 1); assert.equal(f.cp.status, 'completed');
});
test('media/opaque detail retained without pretending URL or opaque data is text', async () => {
  class Base {
    async requestQ1() { return { data: { id: '1', content: [{ type: 1, data: 'https://example.com/image.png' }], token: 'secret' } }; }
    async enrichQ1FeedItems() { await this.requestQ1('/api/club/v1/auth/post/', null, null, { postId: '1' }); return { items: [{ id: '1', _contentIntegrity: { status: 'summary_fallback', code: 'DETAIL_RESPONSE_INVALID' } }] }; }
    async listFeedContents() {
      const enriched = await this.enrichQ1FeedItems({});
      return { items: enriched.items.map(item => ({ externalId: item.id, title: 'media title', body: 'wrong URL text', rawPayload: { _contentIntegrity: item._contentIntegrity } })) };
    }
  }
  const Connector = domesticDetailConnector(Base), page = await new Connector().listFeedContents({ source: { id: SOURCE_ID } });
  assert.equal(page.items[0].body, ''); assert.equal(page.items[0].rawPayload.providerDetail.token, undefined);
  assert.equal(page.items[0].rawPayload.analysisBasis.bodyTextAvailable, false);
  assert.ok(page.items[0].rawPayload.providerDetailSha256);
});
test('actual frozen release Connector gets only today details and preserves UTC and raw', async () => {
  const { BigPlayerH5Connector } = require('C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/server/src/connectors/bigPlayerH5Connector.js');
  const f = fixture(), requested = [], Connector = domesticDetailConnector(BigPlayerH5Connector);
  f.connector = new Connector({}, { credentialContext: { load: async () => 'fixture-token' } });
  f.connector.requestQ1 = async (endpoint, _source, _token, params) => {
    requested.push({ endpoint, params });
    if (endpoint.includes('merged-list')) return { code: 0, data: { items: [
      { id: 'pin', boardId: 2, createTime: '2026-10-08T13:21:27Z', content: [{ type: 0, data: 'old summary' }] },
      { id: '926895', boardId: 2, title: 'today', createTime: '2026-10-09T04:15:13Z', content: [{ type: 0, data: 'summary' }] }
    ], hasMore: true } };
    return { code: 0, data: { id: '926895', boardId: 2, title: 'real media title', content: [{ type: 1, data: 'https://example.com/media.png' }] } };
  };
  const report = await recoverDomesticToday(f);
  assert.equal(report.inserted, 1);
  assert.deepEqual(requested.filter(x => x.endpoint.endsWith('/post/')).map(x => x.params.postId), ['926895']);
  assert.equal(f.stored.get('926895').publishedAt.toISOString(), '2026-10-09T04:15:13.000Z');
  assert.equal(f.stored.get('926895').body, '');
  assert.equal(f.stored.get('926895').rawPayload.providerDetail.id, '926895');
});
test('legacy SQL transaction has no board columns and fences checkpoint', async () => {
  const { domesticRepository } = require('../src/domesticTodayRepository');
  const f = fixture(), statements = []; let row;
  const conn = {
    query: async ({ sql }, params) => {
      statements.push(sql);
      if (sql.startsWith('SELECT id FROM po_sync_checkpoints')) return [[{ id: 'cp' }]];
      if (sql.startsWith('SELECT external_id')) return [[]];
      if (sql.startsWith('SELECT * FROM po_contents')) return [[...(row ? [row] : [])]];
      if (sql.startsWith('INSERT INTO po_contents')) {
        row = { id: params[0], game_id: params[1], community_id: params[2], source_id: params[3], account_id: params[4], external_id: params[5], fingerprint: params[20], raw_payload: params[21] };
      }
      return [{ affectedRows: 1 }];
    }, beginTransaction: async () => statements.push('BEGIN'), commit: async () => statements.push('COMMIT'),
    rollback: async () => statements.push('ROLLBACK'), release: () => {}
  };
  const { normalizePost } = require('../src/domesticTodayRecovery');
  const repo = domesticRepository({ pool: { getConnection: async () => conn } });
  const result = await repo.upsertContentPage({ account: f.account, items: [normalizePost(f.today, validateScope(f))], checkpointId: 'cp', leaseOwner: 'owner', nextCursor: null });
  assert.equal(result.contents[0].change, 'inserted');
  assert.ok(statements.some(sql => sql.includes('lease_until>UTC_TIMESTAMP(3) FOR UPDATE')));
  assert.ok(statements.every(sql => !/board_id|board_key|board_name/.test(sql)));
  assert.ok(statements.some(sql => sql.includes('SET `cursor`=?')));
  assert.equal(statements.at(-1), 'COMMIT');
});
test('provider offset ceiling cannot be called exhaustion or completed checkpoint', async () => {
  const f = fixture();
  f.connector.listFeedContents = async () => ({ items: [], hasMore: false, nextCursor: null, raw: { data: { offsetCeilingReached: true } } });
  const report = await recoverDomesticToday(f);
  assert.equal(report.status, 'PARTIAL_TODAY'); assert.equal(f.cp.status, 'idle');
  assert.equal(report.errorCode, 'DOMESTIC_PROVIDER_INCOMPLETE');
});
test('titleless complete rich post is stored with explicit no-text reason and never sent to AI', async () => {
  const f = fixture(); f.today.title = ''; f.today.body = '';
  const report = await recoverDomesticToday(f);
  assert.equal(f.stored.size, 1); assert.equal(report.noTextForAi, 1);
  assert.equal(report.aiQueued, 0); assert.equal(f.calls.some(call => call[0] === 'ai'), false);
});
