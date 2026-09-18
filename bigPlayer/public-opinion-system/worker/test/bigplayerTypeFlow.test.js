const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePlatformItem, syncStage } = require('../src/worker');
const { contentDisplayType } = require('../../server/src/services/contentDisplayType');

test('BigPlayer original top-level type survives worker write payload and display mapping', () => {
  for (const type of [0, 1, '0', '1']) {
    const normalized = normalizePlatformItem({ externalId: 'stable-id', title: type == 1 ? '有标题' : '', rawPayload: { type, authorization: 'not-retained', nested: { type: 1 } } }, { scope: 'posts', platform: 'bigplayer_h5' });
    assert.equal(normalized.externalId, 'stable-id');
    assert.deepEqual(normalized.rawPayload, { type });
    const serializedWritePayload = JSON.stringify(normalized.rawPayload);
    assert.equal(contentDisplayType({ platform: 'bigplayer_h5', content_type: normalized.contentType, raw_payload: serializedWritePayload }), type == 1 ? 'dynamic' : 'post');
  }
  assert.equal(normalizePlatformItem({ externalId: 'id', type: 1, title: '', rawPayload: { nested: { type: 1 } } }, { scope: 'posts', platform: 'bigplayer_h5' }).rawPayload, null);
  assert.equal(normalizePlatformItem({ externalId: 'id', rawPayload: { type: 1 } }, { scope: 'posts', platform: 'discord' }).rawPayload, null);
  assert.equal(normalizePlatformItem({ externalId: 'id', rawPayload: { type: 1 } }, { scope: 'comments', platform: 'bigplayer_h5' }).rawPayload, null);
});

test('bounded BigPlayer continuation never refetches a completed exact-window checkpoint', async () => {
  const result = await syncStage({
    collectionWindow: { dailyBounded: true, publishedFrom: '2026-09-09T09:12:21.045Z', publishedTo: '2026-09-16T09:12:21.045Z' },
    repo: { getSyncCheckpoint: async identity => { assert.equal(identity.windowStart, '2026-09-09T09:12:21.045Z'); return { status: 'completed' }; }, claimSyncCheckpoint: async () => { throw new Error('must not claim completed window'); } }
  }, { source: { platform: 'bigplayer_h5' }, account: { id: 'a1' }, connector: {}, scope: 'posts', syncMode: 'backfill', taskKind: 'q1_feed', taskKey: 'same-feed' });
  assert.equal(result.completed, true);
  assert.deepEqual(result.entries, []);
});
