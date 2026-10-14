'use strict';
const crypto = require('node:crypto');
const { contractOf, canonical } = require('./overseasBigPlayerRunContractJournal');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const id = value => {
  if (!['string', 'number'].includes(typeof value) || !String(value).trim() || String(value).length > 255
    || (typeof value === 'number' && !Number.isSafeInteger(value))) fail('OVERSEAS_OBSERVATION_PROVIDER_ID_INVALID');
  return String(value);
};
const raw = value => { try { const out = typeof value === 'string' ? JSON.parse(value) : value;
  if (out != null && (typeof out !== 'object' || Array.isArray(out))) fail('OVERSEAS_OBSERVATION_RAW_INVALID'); return out || {};
} catch { fail('OVERSEAS_OBSERVATION_RAW_INVALID'); } };
// Loader is installed once from the authenticated connector boundary. Callers
// cannot mint proof from arbitrary payloads or a boolean "verified" flag.
function createCurrentObservationAdmission({ runContract, contractSha256, loadProviderPayload } = {}) {
  const c = contractOf(runContract);
  if (sha(canonical(c)) !== contractSha256 || typeof loadProviderPayload !== 'function') fail('OVERSEAS_OBSERVATION_DEPENDENCIES_REQUIRED');
  const proofs = new WeakMap();
  const unwrap = token => { const value = token && proofs.get(token); if (!value) fail('OVERSEAS_OBSERVATION_PROOF_INVALID'); return value; };
  const request = fields => Object.freeze({ runId: c.runId, sourceId: c.sourceId, accountId: c.accountId, siteId: c.siteId,
    siteUrl: c.siteUrl, siteUrlSha256: c.siteUrlSha256, boardId: c.boardId, leaseOwner: c.leaseOwner, leaseEpoch: c.leaseEpoch, contractSha256, ...fields });
  function mint(node, fields) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) fail('OVERSEAS_OBSERVATION_RESPONSE_INVALID');
    const externalId = id(node.id);
    for (const board of [node.boardId, node.board_id]) if (board != null && id(board) !== c.boardId) fail('OVERSEAS_OBSERVATION_BOARD_CONFLICT');
    if (fields.kind === 'comment') {
      for (const root of [node.postId, node.rootId, node.rootContentId]) if (root != null && id(root) !== fields.rootId) fail('OVERSEAS_OBSERVATION_PARENT_CONFLICT');
      if (node.parentId != null && String(node.parentId) !== '0' && id(node.parentId) !== fields.parentId) fail('OVERSEAS_OBSERVATION_PARENT_CONFLICT');
    }
    const token = Object.freeze({}); proofs.set(token, Object.freeze({ ...fields, externalId,
      payloadSha256: sha(canonical(node)), publishedAt: node.createTime ?? null })); return token;
  }
  async function observePostDetail({ externalId }) {
    const expected = id(externalId), req = request({ endpointKind: 'post_detail', externalId: expected });
    const payload = await loadProviderPayload(req);
    if (payload?.code !== 0 || !payload.data || Array.isArray(payload.data) || id(payload.data.id) !== expected) fail('OVERSEAS_OBSERVATION_RESPONSE_INVALID');
    return mint(payload.data, { kind: 'post', depth: 0, rootId: null, parentId: null,
      responseSha256: sha(canonical(payload)), requestSha256: sha(canonical(req)) });
  }
  async function observeComments({ rootProof, parentProof = null, cursor = null }) {
    const root = unwrap(rootProof), anchor = parentProof ? unwrap(parentProof) : root;
    if (root.kind !== 'post' || root.depth !== 0 || (anchor.kind === 'post' ? anchor.externalId !== root.externalId : anchor.rootId !== root.externalId)) fail('OVERSEAS_OBSERVATION_PARENT_CONFLICT');
    if (cursor !== null && typeof cursor !== 'string') fail('OVERSEAS_OBSERVATION_REQUEST_INVALID');
    const req = request({ endpointKind: 'comments', rootExternalId: root.externalId, parentExternalId: anchor.kind === 'comment' ? anchor.externalId : null, cursor });
    const payload = await loadProviderPayload(req);
    if (payload?.code !== 0 || !Array.isArray(payload.data)) fail('OVERSEAS_OBSERVATION_RESPONSE_INVALID');
    const seen = new Set(), result = [], responseSha256 = sha(canonical(payload)), requestSha256 = sha(canonical(req));
    function visit(node, parentId, depth) {
      const external = id(node?.id);
      if (seen.size >= 500 || depth > 20 || seen.has(external) || external === root.externalId || external === parentId) fail('OVERSEAS_OBSERVATION_PARENT_CONFLICT');
      seen.add(external); result.push(mint(node, { kind: 'comment', rootId: root.externalId, parentId, depth, responseSha256, requestSha256 }));
      if (node.replies != null && node.children != null) fail('OVERSEAS_OBSERVATION_RESPONSE_INVALID');
      const children = node.replies ?? node.children ?? []; if (!Array.isArray(children)) fail('OVERSEAS_OBSERVATION_RESPONSE_INVALID');
      for (const child of children) visit(child, external, depth + 1);
    }
    for (const node of payload.data) visit(node, anchor.externalId, anchor.depth + 1);
    return Object.freeze(result);
  }
  function core(row) {
    if (!row || row.source_id !== c.sourceId || row.account_id !== c.accountId || row.game_id !== c.gameId || row.community_id !== c.communityId) fail('OVERSEAS_OBSERVATION_EXISTING_CONFLICT');
    const payload = raw(row.raw_payload), over = raw(payload._overseasScope), legacy = raw(payload._lastNightScope);
    for (const board of [row.board_id, payload.boardId, payload.board_id, over.boardId, legacy.boardId]) if (board != null && String(board) !== c.boardId) fail('OVERSEAS_OBSERVATION_BOARD_CONFLICT');
    for (const [key, expected] of Object.entries({ sourceId: c.sourceId, accountId: c.accountId, gameId: c.gameId, communityId: c.communityId })) {
      for (const marker of [over, legacy]) if (marker[key] != null && marker[key] !== expected) fail('OVERSEAS_OBSERVATION_EXISTING_CONFLICT');
    }
    // Deliberately do not treat historical site observations as ownership.
  }
  function admitReuse({ proof, incoming, existing, rootRow = null, parentRow = null, contextAncestor = false } = {}) {
    const p = unwrap(proof); core(existing);
    if (!incoming || id(incoming.externalId) !== p.externalId || id(existing.external_id) !== p.externalId
      || incoming.contentType !== p.kind || existing.content_type !== p.kind || String(incoming.boardId) !== c.boardId
      || Number(incoming.contentDepth) !== p.depth || Number(existing.content_depth) !== p.depth
      || sha(canonical(raw(incoming.rawPayload))) !== p.payloadSha256) fail('OVERSEAS_OBSERVATION_INCOMING_CONFLICT');
    if (!/^[a-f0-9]{64}$/.test(incoming.fingerprint || '') || existing.fingerprint !== incoming.fingerprint) fail('OVERSEAS_OBSERVATION_CURRENT_VERSION_CHANGED');
    for (const [left, right] of [[incoming.title, existing.title], [incoming.body, existing.body], [incoming.authorName, existing.author_name]]) {
      if (String(left || '') !== String(right || '')) fail('OVERSEAS_OBSERVATION_INCOMING_CONFLICT');
    }
    if (Number(existing.is_deleted) || incoming.isDeleted) fail('OVERSEAS_OBSERVATION_EXISTING_CONFLICT');
    if (!contextAncestor) { const ms = Date.parse(p.publishedAt);
      if (!Number.isFinite(ms) || ms < Date.parse(c.windowStart) || ms >= Date.parse(c.windowEnd)
        || +new Date(incoming.publishedAt) !== ms) fail('OVERSEAS_OBSERVATION_WINDOW_CONFLICT'); }
    if (p.kind === 'post') {
      if (incoming.rootPlatformContentId || incoming.platformParentId || existing.root_content_id || existing.parent_content_id) fail('OVERSEAS_OBSERVATION_PARENT_CONFLICT');
    } else {
      core(rootRow); core(parentRow);
      if (id(rootRow.external_id) !== p.rootId || rootRow.content_type !== 'post' || Number(rootRow.content_depth) !== 0 || Number(rootRow.is_deleted)
        || id(parentRow.external_id) !== p.parentId || Number(parentRow.content_depth) !== p.depth - 1 || Number(parentRow.is_deleted)
        || parentRow.content_type !== (p.depth === 1 ? 'post' : 'comment')
        || (p.depth === 1 ? parentRow.id !== rootRow.id : parentRow.root_content_id !== rootRow.id)
        || existing.root_content_id !== rootRow.id || existing.parent_content_id !== parentRow.id
        || String(incoming.rootPlatformContentId) !== p.rootId || String(incoming.platformParentId || p.rootId) !== p.parentId) fail('OVERSEAS_OBSERVATION_PARENT_CONFLICT');
    }
    return Object.freeze({ action: 'reuse_existing', contentId: existing.id, queueEligible: false,
      preservedRawSha256: sha(typeof existing.raw_payload === 'string' ? existing.raw_payload : canonical(raw(existing.raw_payload))),
      association: contextAncestor ? null : Object.freeze({ runId: c.runId, syncScope: p.kind === 'post' ? 'posts' : 'comments', changeType: 'unchanged' }),
      observation: Object.freeze({ runId: c.runId, siteId: c.siteId, siteUrlSha256: c.siteUrlSha256, boardId: c.boardId, contractSha256,
        contentId: existing.id, externalId: p.externalId, fingerprint: incoming.fingerprint, rootExternalId: p.rootId,
        parentExternalId: p.parentId, contextAncestor, payloadSha256: p.payloadSha256, responseSha256: p.responseSha256, requestSha256: p.requestSha256 }) });
  }
  // This minimal stage does not insert/update content or claim DB commit.
  return Object.freeze({ observePostDetail, observeComments, admitReuse });
}
module.exports = { createCurrentObservationAdmission };
