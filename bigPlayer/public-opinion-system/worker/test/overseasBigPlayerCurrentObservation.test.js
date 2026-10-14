'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { canonical } = require('../src/overseasBigPlayerRunContractJournal');
const { createCurrentObservationAdmission } = require('../src/overseasBigPlayerCurrentObservation');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const url = 'https://club-en.q1.com/?env=1&gameId=2177&gameVersion=2177-US-ZS&languageId=16';
const contract = { runId: '11111111-1111-1111-1111-111111111111', sourceId: '081a16d2-5545-4afd-9c65-e04777e4540b',
  accountId: '75c8205f-37eb-4bdf-b6a4-f4f502e35658', gameId: '00000000-0000-0000-0000-000000000002',
  communityId: '00000000-0000-0000-0000-000000000102', siteId: 'site-b', boardId: '100017', siteUrl: url,
  siteUrlSha256: sha(url), windowStart: '2026-10-09T00:00:00.000Z', windowEnd: '2026-10-10T00:00:00.000Z',
  leaseOwner: 'owner', leaseEpoch: 1, manifestSha256: 'a'.repeat(64) };
function fixture(node = { id: 10, boardId: 100017, content: 'text', createTime: '2026-10-09T01:00:00Z' }) {
  const admission = createCurrentObservationAdmission({ runContract: contract, contractSha256: sha(canonical(contract)),
    loadProviderPayload: async () => ({ code: 0, data: structuredClone(node) }) });
  const incoming = { externalId: '10', contentType: 'post', contentDepth: 0, boardId: '100017', body: 'text', fingerprint: sha('text'), publishedAt: node.createTime, rawPayload: node };
  const existing = { id: 'old-uuid', external_id: '10', source_id: contract.sourceId, account_id: contract.accountId,
    game_id: contract.gameId, community_id: contract.communityId, content_type: 'post', content_depth: 0,
    fingerprint: sha('text'), body: 'text', raw_payload: '{"id":10}' };
  return { admission, incoming, existing };
}
test('new trusted response safely reuses old identity without re-marking historical raw', async () => {
  const f = fixture(), proof = await f.admission.observePostDetail({ externalId: '10' }); const before = f.existing.raw_payload;
  const result = f.admission.admitReuse({ proof, incoming: f.incoming, existing: f.existing });
  assert.equal(result.contentId, 'old-uuid'); assert.equal(result.queueEligible, false); assert.equal(result.observation.siteId, 'site-b');
  assert.equal(result.association.changeType, 'unchanged'); assert.equal(f.existing.raw_payload, before);
});
test('different historical site is preserved as historical observation', async () => {
  const f = fixture(), proof = await f.admission.observePostDetail({ externalId: '10' });
  f.existing.raw_payload = JSON.stringify({ _overseasScope: { siteId: 'site-a', siteUrl: 'https://club-en.q1.com/?old=1', boardId: '100017' } });
  const before = f.existing.raw_payload; assert.equal(f.admission.admitReuse({ proof, incoming: f.incoming, existing: f.existing }).action, 'reuse_existing'); assert.equal(f.existing.raw_payload, before);
});
test('fake and cross-instance proofs cannot admit reuse', async () => {
  const f = fixture(), proof = await f.admission.observePostDetail({ externalId: '10' });
  assert.throws(() => f.admission.admitReuse({ proof: {}, incoming: f.incoming, existing: f.existing }), { code: 'OVERSEAS_OBSERVATION_PROOF_INVALID' });
  assert.throws(() => fixture().admission.admitReuse({ proof, incoming: f.incoming, existing: f.existing }), { code: 'OVERSEAS_OBSERVATION_PROOF_INVALID' });
});
test('actual provider ID and board conflicts cannot mint proofs', async () => {
  await assert.rejects(() => fixture({ id: 11 }).admission.observePostDetail({ externalId: '10' }), { code: 'OVERSEAS_OBSERVATION_RESPONSE_INVALID' });
  await assert.rejects(() => fixture({ id: 10, boardId: 999 }).admission.observePostDetail({ externalId: '10' }), { code: 'OVERSEAS_OBSERVATION_BOARD_CONFLICT' });
});
test('existing board/version conflicts and substituted raw payload reject', async () => {
  const f = fixture(), proof = await f.admission.observePostDetail({ externalId: '10' });
  assert.throws(() => f.admission.admitReuse({ proof, incoming: f.incoming, existing: { ...f.existing, raw_payload: '{"boardId":"999"}' } }), { code: 'OVERSEAS_OBSERVATION_BOARD_CONFLICT' });
  assert.throws(() => f.admission.admitReuse({ proof, incoming: f.incoming, existing: { ...f.existing, fingerprint: sha('old') } }), { code: 'OVERSEAS_OBSERVATION_CURRENT_VERSION_CHANGED' });
  assert.throws(() => f.admission.admitReuse({ proof, incoming: { ...f.incoming, rawPayload: { id: 10 } }, existing: f.existing }), { code: 'OVERSEAS_OBSERVATION_INCOMING_CONFLICT' });
});
test('outside-window normal reuse fails closed', async () => {
  const f = fixture({ id: 10, createTime: '2020-01-01T00:00:00Z' }), proof = await f.admission.observePostDetail({ externalId: '10' });
  assert.throws(() => f.admission.admitReuse({ proof, incoming: f.incoming, existing: f.existing }), { code: 'OVERSEAS_OBSERVATION_WINDOW_CONFLICT' });
});
test('same fingerprint cannot conceal changed body or deleted content', async () => {
  const f = fixture(), proof = await f.admission.observePostDetail({ externalId: '10' });
  assert.throws(() => f.admission.admitReuse({ proof, incoming: { ...f.incoming, body: 'other' }, existing: f.existing }), { code: 'OVERSEAS_OBSERVATION_INCOMING_CONFLICT' });
  assert.throws(() => f.admission.admitReuse({ proof, incoming: f.incoming, existing: { ...f.existing, is_deleted: 1 } }), { code: 'OVERSEAS_OBSERVATION_EXISTING_CONFLICT' });
});
