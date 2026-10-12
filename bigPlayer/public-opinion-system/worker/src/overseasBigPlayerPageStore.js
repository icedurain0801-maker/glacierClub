'use strict';
const crypto = require('node:crypto');
const { contextOf } = require('../../server/src/connectors/overseasBigPlayerSiteSession');
const { normalizeSiteUrls } = require('../../server/src/services/bigplayerSiteConfig');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const { isAtomicPageJobsCallback } = require('./overseasBigPlayerPageJobs');
const atomicMethods = new WeakSet(), committedContents = new WeakMap();
function assertAtomicPageJobsBinding(deps, source) {
  if (source?.platform !== 'bigplayer_h5' || source.region_code !== 'overseas') return false;
  if (deps.overseasAtomicPageJobs != null && typeof deps.overseasAtomicPageJobs !== 'boolean') fail('OVERSEAS_ATOMIC_PAGE_JOBS_UNBOUND');
  if (deps.overseasAtomicPageJobs !== true) {
    if (atomicMethods.has(deps.repo?.upsertContentPage)) fail('OVERSEAS_ATOMIC_PAGE_JOBS_UNBOUND');
    return false;
  }
  if (!atomicMethods.has(deps.repo?.upsertContentPage)) fail('OVERSEAS_ATOMIC_PAGE_JOBS_UNBOUND');
  return true;
}
function assertAtomicContentReceipt(entry, method, source) {
  if (entry.change === 'unchanged' || entry.content?.is_deleted || entry.raw?.recoveryContextAncestor) return;
  const proof = committedContents.get(entry.content);
  if (!proof || proof.method !== method || proof.sourceId !== source?.id
    || proof.id !== entry.content.id || proof.fingerprint !== entry.content.fingerprint
    || proof.fingerprint !== entry.raw?.fingerprint) fail('OVERSEAS_ATOMIC_PAGE_JOBS_RECEIPT_REQUIRED');
}
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function json(value) {
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (parsed != null && (typeof parsed !== 'object' || Array.isArray(parsed))) fail('OVERSEAS_STORE_PAYLOAD_INVALID');
    return parsed || {};
  } catch { fail('OVERSEAS_STORE_PAYLOAD_INVALID'); }
}
function iso(value) {
  const date = value instanceof Date ? value : new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2} /.test(value) ? value.replace(' ', 'T') + 'Z' : value);
  if (value == null || !Number.isFinite(+date)) fail('OVERSEAS_STORE_WINDOW_INVALID');
  return date.toISOString();
}
// Adapt only the current Repository's known INSERT shape, never arbitrary SQL.
function stripBoardInsert(sql, params = []) {
  if (!sql.startsWith('INSERT INTO po_contents ')) return { sql, params };
  const match = sql.match(/^INSERT INTO po_contents \(([^)]+)\) VALUES \((.*?)\) ON DUPLICATE KEY UPDATE (.*)$/);
  if (!match) fail('OVERSEAS_STORE_SQL_UNSUPPORTED');
  const columns = match[1].split(',').map(value => value.trim());
  const values = match[2].split(/,(?![^()]*\))/).map(value => value.trim());
  if (columns.length !== values.length) fail('OVERSEAS_STORE_SQL_UNSUPPORTED');
  const outColumns = [], outValues = [], outParams = []; let index = 0;
  columns.forEach((column, i) => {
    if (values[i] !== '?' && values[i] !== 'NOW()') fail('OVERSEAS_STORE_SQL_UNSUPPORTED');
    const parameter = values[i] === '?' ? params[index++] : undefined;
    if (!['board_id', 'board_name'].includes(column)) {
      outColumns.push(column); outValues.push(values[i]); if (values[i] === '?') outParams.push(parameter);
    }
  });
  if (index !== params.length) fail('OVERSEAS_STORE_SQL_UNSUPPORTED');
  const updates = match[3].split(',').filter(value => !/^\s*board_(id|name)=/.test(value));
  return { sql: `INSERT INTO po_contents (${outColumns.join(', ')}) VALUES (${outValues.join(',')}) ON DUPLICATE KEY UPDATE ${updates.join(',')}`, params: outParams };
}
function assertContract(input) {
  const c = json(input.runContract);
  const context = contextOf({ ...input.source, account: input.account });
  const expected = { runId: input.syncRunId, sourceId: input.source.id, accountId: input.account.id,
    gameId: input.account.game_id, communityId: input.account.community_id, siteId: context.siteId,
    boardId: context.boardId, siteUrl: context.base.toString(), leaseOwner: input.leaseOwner };
  for (const [key, value] of Object.entries(expected)) if (!value || c[key] !== value) fail('OVERSEAS_STORE_CONTRACT_MISMATCH');
  if (c.siteUrlSha256 !== sha(c.siteUrl) || !/^[a-f0-9]{64}$/.test(c.manifestSha256 || '')
    || !input.leaseOwner || !Number.isSafeInteger(c.leaseEpoch) || c.leaseEpoch < 1
    || iso(c.windowStart) >= iso(c.windowEnd)) fail('OVERSEAS_STORE_CONTRACT_INVALID');
  return Object.freeze({ ...c });
}
async function assertRow(row, c, verifyHistoricalScope) {
  if (!row || row.source_id !== c.sourceId || row.account_id !== c.accountId || row.game_id !== c.gameId || row.community_id !== c.communityId) fail('OVERSEAS_STORE_CONTENT_SCOPE_CONFLICT');
  const raw = json(row.raw_payload), overseas = json(raw._overseasScope), legacy = json(raw._lastNightScope);
  const markers = {
    boardId: [row.board_id, raw.boardId, raw.board_id, overseas.boardId, legacy.boardId],
    sourceId: [overseas.sourceId, legacy.sourceId], accountId: [overseas.accountId, legacy.accountId],
    gameId: [overseas.gameId, legacy.gameId], communityId: [overseas.communityId, legacy.communityId],
    siteId: [row.site_id, raw.siteId, raw.site_id, overseas.siteId],
    siteUrl: [row.site_url_snapshot, raw.siteUrl, raw.site_url_snapshot, overseas.siteUrl],
    siteUrlSha256: [overseas.siteUrlSha256]
  };
  for (const [key, values] of Object.entries(markers)) if (values.filter(value => value != null).some(value => String(value) !== c[key])) fail('OVERSEAS_STORE_CONTENT_SCOPE_CONFLICT');
  if (['boardId', 'siteId', 'siteUrl', 'siteUrlSha256'].some(key => !markers[key].some(value => value != null))) {
    if (typeof verifyHistoricalScope !== 'function' || await verifyHistoricalScope(Object.freeze({ ...row }), c) !== true) fail('OVERSEAS_STORE_HISTORY_SCOPE_UNPROVEN');
  }
}
function createOverseasBigPlayerPageStore({ repo, verifyRunContract, verifyHistoricalScope, beforeCommit, stageCoverage, scheduledProof } = {}) {
  const scheduled=scheduledProof?require('../../server/src/db/overseasScheduledAdmissionStore').scheduledFirstClaimContext(scheduledProof,repo):null;
  if (stageCoverage != null && !require('./overseasStageCoverage').isOverseasStageCoverage(stageCoverage)) fail('OVERSEAS_COVERAGE_BRAND_REQUIRED');
  if(stageCoverage)require('../../server/src/db/overseasStageCoverage').assertCoverageSafetyContext(stageCoverage.ledger,{repo,scheduledProof});
  if (!repo?.pool?.getConnection || typeof repo._upsertContentPageAttempt !== 'function' || typeof verifyRunContract !== 'function') fail('OVERSEAS_STORE_DEPENDENCIES_REQUIRED');
  const atomicJobs = isAtomicPageJobsCallback(beforeCommit);
  const store = { async upsertContentPage(input = {}) {
    const c = assertContract(input);
    if(scheduled)await scheduled.verify(c);
    if (await verifyRunContract(c) !== true) fail('OVERSEAS_STORE_CONTRACT_UNVERIFIED');
    if (!['posts', 'comments'].includes(input.syncScope) || !Array.isArray(input.items) || input.items.length > 500
      || new Set(input.items.map(item => String(item?.externalId))).size !== input.items.length) fail('OVERSEAS_STORE_ITEMS_INVALID');
    if (new Set(input.items.map(item => item?.fingerprint)).size !== input.items.length) fail('OVERSEAS_STORE_FINGERPRINT_CONFLICT');
    let conn, started = false, committing = false, rollbackFailed = false;
    try {
      conn = await repo.pool.getConnection();
      const q = (sql, params = []) => conn.query(sql, params);
      await q('SET SESSION innodb_lock_wait_timeout=?', [repo.syncUpsertLockWaitSeconds || 3]);
      await conn.beginTransaction(); started = true;
      // Lock the parent/source-state fence before the old child/site/content path.
      if(scheduled)await scheduled.fence(conn,c,{lock:true});
      const [[run]] = await q('SELECT *, (lease_until>UTC_TIMESTAMP(3)) AS live FROM po_sync_runs WHERE id=? FOR UPDATE', [c.runId]);
      if (!run || run.source_id !== c.sourceId || run.account_id !== c.accountId || run.site_id !== c.siteId
        || !['running', 'pausing', 'cancelling'].includes(run.status) || run.lease_owner !== input.leaseOwner
        || Number(run.lease_epoch) !== c.leaseEpoch || Number(run.live) !== 1
        || iso(run.window_start) !== iso(c.windowStart) || iso(run.window_end) !== iso(c.windowEnd)
        || (run.board_id != null && String(run.board_id) !== c.boardId)
        || (run.site_url_snapshot != null && run.site_url_snapshot !== c.siteUrl)) fail('OVERSEAS_STORE_RUN_SCOPE_CONFLICT');
      const [[site]] = await q('SELECT * FROM po_source_sites WHERE source_id=? AND site_id=? FOR UPDATE', [c.sourceId, c.siteId]);
      if (!site || Number(site.enabled) !== 1 || site.url !== c.siteUrl) fail('OVERSEAS_STORE_SITE_CHANGED');
      const [[source]] = await q('SELECT s.*,g.region_code,g.enabled AS game_enabled,c.status AS community_status FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id WHERE s.id=? FOR UPDATE', [c.sourceId]);
      const [[account]] = await q('SELECT * FROM po_accounts WHERE id=? FOR UPDATE', [c.accountId]);
      if (!source || source.platform !== 'bigplayer_h5' || source.region_code !== 'overseas'
        || source.game_id !== c.gameId || source.community_id !== c.communityId || Number(source.enabled) !== 1
        || Number(source.game_enabled) !== 1 || source.community_status !== 'enabled' || String(json(source.config).boardId) !== c.boardId
        || !account || account.platform !== source.platform || account.source_id !== c.sourceId
        || account.game_id !== c.gameId || account.community_id !== c.communityId || Number(account.enabled) !== 1) fail('OVERSEAS_STORE_SOURCE_CHANGED');
      if (normalizeSiteUrls(json(source.config)).siteUrls.filter(value => value.enabled && value.siteId === c.siteId && value.url === c.siteUrl).length !== 1) fail('OVERSEAS_STORE_SITE_CHANGED');
      if (input.checkpointId) {
        if (!Object.hasOwn(input, 'expectedCursor')) fail('OVERSEAS_STORE_CURSOR_PROOF_REQUIRED');
        const [[cp]] = await q('SELECT *, (lease_until>UTC_TIMESTAMP(3)) AS live FROM po_sync_checkpoints WHERE id=? FOR UPDATE', [input.checkpointId]);
        if (!cp || cp.account_id !== c.accountId || cp.site_id !== c.siteId || cp.sync_scope !== input.syncScope
          || String(cp.root_platform_content_id || '') !== String(input.rootPlatformContentId || '')
          || cp.task_kind !== input.taskKind || cp.task_key !== input.taskKey
          || iso(cp.window_start) !== iso(c.windowStart) || iso(cp.window_end) !== iso(c.windowEnd)
          || cp.lease_owner !== input.leaseOwner || cp.status !== 'running' || Number(cp.live) !== 1
          || (cp.cursor ?? null) !== (input.expectedCursor ?? null)) fail('OVERSEAS_STORE_CHECKPOINT_SCOPE_CONFLICT');
      }
      const [columns] = await q("SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='po_contents'");
      const names = new Set(columns.map(row => row.column_name));
      const modern = ['board_id', 'board_name', 'board_key'].every(name => names.has(name));
      if (!modern && ['board_id', 'board_name', 'board_key'].some(name => names.has(name))) fail('OVERSEAS_STORE_SCHEMA_UNSUPPORTED');
      for (const name of ['id', 'source_id', 'account_id', 'game_id', 'community_id', 'external_id', 'raw_payload', 'fingerprint']) if (!names.has(name)) fail('OVERSEAS_STORE_SCHEMA_UNSUPPORTED');
      const items = [];
      for (const item of input.items) {
        if (!item?.externalId || !/^[a-f0-9]{64}$/.test(item.fingerprint || '') || String(item.boardId) !== c.boardId) fail('OVERSEAS_STORE_ITEMS_INVALID');
        if (!item.recoveryContextAncestor && (iso(item.publishedAt) < iso(c.windowStart) || iso(item.publishedAt) >= iso(c.windowEnd))) fail('OVERSEAS_STORE_ITEM_WINDOW_CONFLICT');
        const payload = json(item.rawPayload);
        await assertRow({ source_id: c.sourceId, account_id: c.accountId, game_id: c.gameId, community_id: c.communityId,
          board_id: item.boardId, raw_payload: payload }, c, async () => true);
        const [collision] = await q('SELECT id,external_id FROM po_contents WHERE source_id=? AND fingerprint=? FOR UPDATE', [c.sourceId, item.fingerprint]);
        if (collision.some(row => String(row.external_id) !== String(item.externalId))) fail('OVERSEAS_STORE_FINGERPRINT_CONFLICT');
        items.push({ ...item, boardId: modern ? item.boardId : null, boardName: modern ? item.boardName : null,
          rawPayload: { ...payload, boardId: c.boardId, _overseasScope: { sourceId: c.sourceId, accountId: c.accountId,
            gameId: c.gameId, communityId: c.communityId, boardId: c.boardId, siteId: c.siteId,
            siteUrl: c.siteUrl, siteUrlSha256: c.siteUrlSha256 } } });
      }
      const incoming = new Map(input.items.map(item => [String(item.externalId), item]));
      async function ancestor(externalId) {
        const sql = modern ? 'SELECT * FROM po_contents WHERE source_id=? AND board_key=? AND external_id=? FOR UPDATE'
          : 'SELECT * FROM po_contents WHERE source_id=? AND external_id=? FOR UPDATE';
        const [rows] = await q(sql, modern ? [c.sourceId, c.boardId, externalId] : [c.sourceId, externalId]);
        if (rows.length > 1) fail('OVERSEAS_STORE_CONTENT_SCOPE_CONFLICT');
        if (rows[0]) { await assertRow(rows[0], c, verifyHistoricalScope); return rows[0]; }
        const item = incoming.get(String(externalId));
        return item ? { content_type: item.contentType, content_depth: item.contentDepth, is_deleted: item.isDeleted,
          external_id: item.externalId, root_external_id: item.rootPlatformContentId } : null;
      }
      for (const item of input.items) {
        const depth = Number(item.contentDepth || 0);
        if (input.syncScope === 'posts') {
          if (depth !== 0 || item.platformParentId || item.rootPlatformContentId || (item.contentType && item.contentType !== 'post')) fail('OVERSEAS_STORE_ANCESTRY_INVALID');
          continue;
        }
        const rootId = String(item.rootPlatformContentId || input.rootPlatformContentId || '');
        const parentId = String(item.platformParentId || input.rootPlatformContentId || '');
        if (!Number.isSafeInteger(depth) || depth < 1 || rootId === String(item.externalId) || parentId === String(item.externalId)) fail('OVERSEAS_STORE_ANCESTRY_INVALID');
        const root = await ancestor(rootId), parent = await ancestor(parentId);
        if (!root || !parent) fail('OVERSEAS_COMMENT_PARENT_MISSING');
        if (root.content_type !== 'post' || Number(root.content_depth) !== 0 || Number(root.is_deleted)
          || Number(parent.is_deleted) || Number(parent.content_depth) !== depth - 1
          || parent.content_type !== (depth === 1 ? 'post' : 'comment')
          || (depth === 1 && parentId !== rootId)
          || (depth > 1 && (parent.root_external_id != null ? String(parent.root_external_id) !== rootId : parent.root_content_id !== root.id))) fail('OVERSEAS_STORE_ANCESTRY_INVALID');
      }
      const pinned = { async query(sql, params = []) {
        const adjusted = modern ? { sql, params } : stripBoardInsert(sql, params);
        // Original repository renews by owner only. Never resurrect a lease
        // that expired during this page, and reject stale cursor writes.
        if (sql.startsWith('UPDATE po_sync_runs SET fetched_count=')) {
          adjusted.sql += ' AND lease_until>UTC_TIMESTAMP(3) AND lease_epoch=?';
          adjusted.params = [...params, c.leaseEpoch];
        }
        if (sql.startsWith('UPDATE po_sync_checkpoints SET `cursor`=')) {
          adjusted.sql += ' AND `cursor`<=>? AND lease_until>UTC_TIMESTAMP(3)';
          adjusted.params = [...params, input.expectedCursor ?? null];
        }
        const contentRead = /^SELECT \* FROM po_contents WHERE /.test(sql);
        if (contentRead && !/FOR UPDATE\s*$/.test(adjusted.sql)) adjusted.sql += ' FOR UPDATE';
        const result = await q(adjusted.sql, adjusted.params);
        if (contentRead) for (const row of result[0] || []) await assertRow(row, c, verifyHistoricalScope);
        return result;
      }, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} };
      const facade = Object.create(repo); facade.pool = { getConnection: async () => pinned };
      facade.query = async (sql, params) => (await pinned.query(sql, params))[0];
      const stored = await repo._upsertContentPageAttempt.call(facade, { ...input, items });
      if (stored.contents.length !== items.length || stored.contents.some(entry => !entry?.content)) fail('OVERSEAS_STORE_RESULT_INCOMPLETE');
      if (typeof beforeCommit === 'function') await beforeCommit({ facade, contents: stored.contents, items: input.items, contract: c });
      if (stageCoverage) await stageCoverage.beforePageCommit({ conn, contract: c, input });
      const [[fence]] = await q('SELECT lease_owner,lease_epoch,(lease_until>UTC_TIMESTAMP(3)) AS live FROM po_sync_runs WHERE id=?', [c.runId]);
      if (fence?.lease_owner !== input.leaseOwner || Number(fence.lease_epoch) !== c.leaseEpoch || Number(fence.live) !== 1) fail('OVERSEAS_STORE_LEASE_LOST');
      const checkpoint = input.checkpointId ? (await q('SELECT * FROM po_sync_checkpoints WHERE id=?', [input.checkpointId]))[0]?.[0] || null : null;
      if(scheduled)await scheduled.fence(conn,c,{lock:true});
      committing = true; await conn.commit(); started = false; committing = false;
      // Receipt is minted only AFTER the actual callback and commit ACK.
      // Rollback, hook failure and unknown commit cannot claim completed jobs.
      if (atomicJobs) for (const entry of stored.contents) committedContents.set(entry.content,
        Object.freeze({ id: entry.content.id, fingerprint: entry.content.fingerprint, method: store.upsertContentPage, sourceId: c.sourceId }));
      return { ...stored, checkpoint };
    } catch (error) {
      if (committing) error.code = 'OVERSEAS_STORE_COMMIT_UNKNOWN';
      else if (started) { try { await conn.rollback(); } catch { rollbackFailed = true; } }
      throw error;
    } finally { if ((committing && started) || rollbackFailed) conn?.destroy(); else conn?.release(); }
  } };
  if (atomicJobs) atomicMethods.add(store.upsertContentPage);
  return Object.freeze(store);
}
module.exports = { createOverseasBigPlayerPageStore, stripBoardInsert, assertRow,
  isAtomicPageStoreMethod: method => atomicMethods.has(method), assertAtomicPageJobsBinding, assertAtomicContentReceipt };
