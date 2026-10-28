'use strict';
const crypto = require('node:crypto');
const { normalizeRawContent } = require('../../server/src/connectors/baseConnector');
const { stripBoardInsert } = require('./overseasBigPlayerPageStore');
const { createOverseasPageJobs } = require('./overseasBigPlayerPageJobs');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
const parse = v => typeof v === 'string' ? JSON.parse(v) : (v || {});
const SOURCE = '081a16d2-5545-4afd-9c65-e04777e4540b';
const ACCOUNT = '75c8205f-37eb-4bdf-b6a4-f4f502e35658';
const GAME = '00000000-0000-0000-0000-000000000002';
const COMMUNITY = '00000000-0000-0000-0000-000000000102';
function deterministicRunId(artifactSha, siteId) {
  const h = sha(`overseas-sample-import-v1:${SOURCE}:${artifactSha}:${siteId}`);
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
function prepareSample({ items, artifactSha }) {
  if (items?.sourceId !== SOURCE || !/^[a-f0-9]{64}$/.test(artifactSha || '') || items.sites?.length !== 3
    || new Set(items.sites.map(s => s.siteId)).size !== 3) fail('OVERSEAS_SAMPLE_ARTIFACT_INVALID');
  const byId = new Map();
  for (const site of items.sites) {
    if (!/^[A-Za-z0-9._:-]{1,120}$/.test(site.siteId || '') || site.items?.length !== 20
      || new Set(site.items.map(i => String(i.externalId))).size !== 20) fail('OVERSEAS_SAMPLE_ARTIFACT_INVALID');
    for (const raw of site.items) {
      if (String(raw.boardId) !== '100017' || raw.contentType !== 'post'
        || !['detail_enriched', 'summary_fallback'].includes(raw.rawPayload?._contentIntegrity?.status)) fail('OVERSEAS_SAMPLE_CONTENT_INVALID');
      const item = { ...raw, ...normalizeRawContent(raw) }, id = item.externalId;
      const observations = byId.get(id) || [];
      observations.push({ siteId: site.siteId, item, itemSha256: sha(JSON.stringify(raw)) }); byId.set(id, observations);
    }
  }
  if (byId.size !== 20 || [...byId.values()].some(xs => xs.length !== 3)) fail('OVERSEAS_SAMPLE_IDENTITY_INVALID');
  // Equal external id means one content, even when multiple sites observe it.
  // Conflicting real bodies are not silently resolved by last-site-wins.
  for (const xs of byId.values()) if (new Set(xs.map(x => x.item.fingerprint)).size !== 1) fail('OVERSEAS_SAMPLE_CROSS_SITE_VERSION_CONFLICT');
  return byId;
}
async function importSample({ repo, items, artifactSha, analysisVersion, translationVersion }) {
  const byId = prepareSample({ items, artifactSha });
  if (!analysisVersion || !translationVersion) fail('OVERSEAS_SAMPLE_POLICY_REQUIRED');
  const jobs = createOverseasPageJobs({ repairMissingJobs: true,
    analysisOptionsFor: () => ({ profile: 'light', version: analysisVersion, triggerReason: 'all_content' }),
    translationOptions: { targetLanguage: 'zh-CN', version: translationVersion } });
  const conn = await repo.pool.getConnection(); let started = false, committing = false, locked = false, unusable = false;
  const q = async (sql, params = []) => {
    try { return (await conn.query(sql, params))[0]; }
    catch (e) { e.operation = sql.match(/^(?:SELECT|UPDATE|INSERT(?: IGNORE)? INTO|SET SESSION)\s+[^ ]+/i)?.[0] || 'TRANSACTION'; throw e; }
  };
  try {
    const [lock] = await q('SELECT GET_LOCK(?,0) AS acquired', [`po-overseas-sample:${SOURCE}`]);
    if (Number(lock?.acquired) !== 1) fail('OVERSEAS_SAMPLE_BUSY'); locked = true;
    await q('SET SESSION innodb_lock_wait_timeout=3');
    await conn.beginTransaction(); started = true;
    const [state] = await q('SELECT *,lease_until>UTC_TIMESTAMP(3) AS live FROM po_source_schedule_state WHERE source_id=? FOR UPDATE', [SOURCE]);
    if (Number(state?.live) === 1) fail('OVERSEAS_SAMPLE_ACTIVE_SOURCE_LEASE');
    const active = await q("SELECT id FROM po_sync_runs WHERE source_id=? AND status IN ('running','pausing','cancelling') AND lease_until>UTC_TIMESTAMP(3) FOR UPDATE", [SOURCE]);
    if (active.length) fail('OVERSEAS_SAMPLE_ACTIVE_COLLECTION');
    const [source] = await q('SELECT * FROM po_sources WHERE id=? FOR UPDATE', [SOURCE]);
    const [account] = await q('SELECT * FROM po_accounts WHERE id=? FOR UPDATE', [ACCOUNT]);
    const [game] = await q('SELECT region_code,enabled FROM po_games WHERE id=?', [GAME]);
    const [community] = await q('SELECT status FROM po_communities WHERE id=?', [COMMUNITY]);
    if (source?.platform !== 'bigplayer_h5' || source.game_id !== GAME || source.community_id !== COMMUNITY
      || source.default_account_id !== ACCOUNT || Number(source.enabled) !== 1 || account?.source_id !== SOURCE
      || account.game_id !== GAME || account.community_id !== COMMUNITY || account.auth_status !== 'authorized'
      || Number(account.enabled) !== 1 || game?.region_code !== 'overseas' || Number(game.enabled) !== 1 || community?.status !== 'enabled') fail('OVERSEAS_SAMPLE_SCOPE_CHANGED');
    const config = parse(source.config);
    if (String(config.boardId) !== '100017') fail('OVERSEAS_SAMPLE_BOARD_CHANGED');
    const sites = await q('SELECT * FROM po_source_sites WHERE source_id=? ORDER BY site_id FOR UPDATE', [SOURCE]);
    if (sites.length !== 3 || sites.some(s => Number(s.enabled) !== 1)) fail('OVERSEAS_SAMPLE_SITES_CHANGED');
    for (const site of items.sites) {
      const r = sites.find(s => s.site_id === site.siteId), c = config.siteUrls?.find(s => (s.siteId || s.site_id) === site.siteId);
      if (!r || !c || r.url !== c.url || r.url_hash !== sha(r.url)) fail('OVERSEAS_SAMPLE_SITES_CHANGED');
      const u = new URL(r.url);
      if (u.origin !== 'https://club-en.q1.com' || u.searchParams.get('gameId') !== '2177'
        || !['2','9','16'].includes(u.searchParams.get('languageId'))) fail('OVERSEAS_SAMPLE_SITES_CHANGED');
    }
    const columns = await q("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='po_contents'");
    const modern = ['board_id','board_name','board_key'].every(c => columns.some(r => r.COLUMN_NAME === c));
    const pinned = { query: async (sql, params = []) => {
      const adapted = modern ? { sql, params } : stripBoardInsert(sql, params);
      return conn.query(adapted.sql, adapted.params);
    }, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
    const facade = Object.create(repo); facade.pool = { getConnection: async () => pinned };
    facade.query = async (sql, params) => (await pinned.query(sql, params))[0];
    const preserved = [], incoming = [];
    for (const [id, observations] of [...byId].sort(([a],[b]) => a.localeCompare(b))) {
      const rows = await q('SELECT * FROM po_contents WHERE source_id=? AND external_id=? FOR UPDATE', [SOURCE, id]);
      if (rows.length > 1) fail('OVERSEAS_SAMPLE_EXISTING_DUPLICATE');
      const row = rows[0], raw = observations[0].item;
      if (row) {
        if (row.account_id !== ACCOUNT || row.game_id !== GAME || row.community_id !== COMMUNITY || row.content_type !== 'post') fail('OVERSEAS_SAMPLE_EXISTING_SCOPE_CONFLICT');
        const payload = parse(row.raw_payload), markers = [row.board_id, payload.boardId, payload.board_id, payload._overseasScope?.boardId, payload._lastNightScope?.boardId].filter(x => x != null);
        const memberships = await q('SELECT feed_metadata FROM po_content_feed_memberships WHERE content_id=? FOR UPDATE', [row.id]);
        markers.push(...memberships.map(m => parse(m.feed_metadata).boardId).filter(x => x != null));
        if (markers.some(x => String(x) !== '100017')) fail('OVERSEAS_SAMPLE_EXISTING_BOARD_CONFLICT');
        // Importing old evidence never overwrites a live row or resets its content version.
        if (!row.fingerprint) fail('OVERSEAS_SAMPLE_EXISTING_VERSION_MISSING');
        preserved.push({ content: row, change: 'unchanged', raw: { ...raw, fingerprint: row.fingerprint } });
      } else {
        incoming.push({ ...raw, boardId: modern ? raw.boardId : null, boardName: modern ? raw.boardName : null,
          rawPayload: { ...raw.rawPayload, boardId: '100017', _overseasScope: { sourceId: SOURCE, accountId: ACCOUNT, gameId: GAME, communityId: COMMUNITY, boardId: '100017' },
            _overseasOriginal: { artifactSha256: artifactSha, observations: observations.map(x => ({ siteId: x.siteId, itemSha256: x.itemSha256 })) } } });
      }
    }
    const stored = incoming.length ? await repo._upsertContentPageAttempt.call(facade, { account, source: { ...source, region_code: 'overseas' }, syncScope: 'posts', items: incoming, hasMore: false }) : { contents: [] };
    if (stored.contents.length !== incoming.length || stored.contents.some(e => !e.content)) fail('OVERSEAS_SAMPLE_STORE_INCOMPLETE');
    const all = [...preserved, ...stored.contents.map((e,i) => ({ ...e, raw: incoming[i] }))];
    const priorJobs = new Map();
    for (const e of all) {
      for (const j of await q('SELECT id,status,content_fingerprint FROM po_analysis_jobs WHERE content_id=? AND analysis_profile=? AND analysis_version=? FOR UPDATE', [e.content.id,'light',analysisVersion])) priorJobs.set(j.id, j);
      for (const j of await q('SELECT id,status,content_fingerprint FROM po_translation_jobs WHERE content_id=? AND target_language=? AND translation_version=? FOR UPDATE', [e.content.id,'zh-CN',translationVersion])) priorJobs.set(j.id, j);
    }
    await jobs({ facade, contents: all, items: all.map(e => e.raw) });
    // Existing canonical consumers only claim pending/retryable. Hold newly
    // admitted versions in the content transaction until exact bounded release.
    // Existing unchanged jobs, leases and completed versions remain untouched.
    for (const e of all) {
      for (const [table, query, params] of [
        ['po_analysis_jobs','SELECT id,status,content_fingerprint FROM po_analysis_jobs WHERE content_id=? AND analysis_profile=? AND analysis_version=?',[e.content.id,'light',analysisVersion]],
        ['po_translation_jobs','SELECT id,status,content_fingerprint FROM po_translation_jobs WHERE content_id=? AND target_language=? AND translation_version=?',[e.content.id,'zh-CN',translationVersion]]
      ]) for (const j of await q(query,params)) {
        const prior = priorJobs.get(j.id);
        if ((!prior || prior.content_fingerprint !== j.content_fingerprint) && j.status === 'pending')
          await q(`UPDATE ${table} SET status='retryable',next_retry_at='2099-01-01 00:00:00',error_code='OVERSEAS_BOUNDED_VERIFICATION_HOLD' WHERE id=? AND status='pending' AND content_fingerprint=?`, [j.id,j.content_fingerprint]);
      }
    }
    const runIds = [];
    let associationsInserted = 0, membershipsInserted = 0;
    for (const site of items.sites) {
      const r = sites.find(s => s.site_id === site.siteId), runId = deterministicRunId(artifactSha, site.siteId);
      runIds.push(runId);
      const receipt = { operation: 'sample_import', scope: 'single_merged_page_sample_only', artifactSha256: artifactSha, siteUrlSha256: r.url_hash,
        boardId: '100017', observedCount: 20, nextCursor: site.nextCursor, hasMore: true, fullCollection: false,
        detailsEnriched: 18, summaryFallback: 2, preservedExistingContent: true };
      const [existingRun] = await q('SELECT * FROM po_sync_runs WHERE id=? FOR UPDATE', [runId]);
      if (existingRun) {
        if (existingRun.source_id !== SOURCE || existingRun.account_id !== ACCOUNT || existingRun.site_id !== site.siteId
          || existingRun.trigger_type !== 'manual' || existingRun.status !== 'partial'
          || existingRun.error_message !== JSON.stringify(receipt)) fail('OVERSEAS_SAMPLE_RECEIPT_CONFLICT');
      } else {
        // Terminal rows and content become visible in the same commit; no queued
        // sample task can be stolen by the shared Worker during import/recovery.
        await q("INSERT INTO po_sync_runs (created_at,requested_at,id,source_id,account_id,site_id,status,sync_mode,trigger_type,started_at,finished_at,discovered_count,fetched_count,stored_count,inserted_count,unchanged_count,error_code,error_message) VALUES (UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),?,?,?,?,'partial','incremental','manual',UTC_TIMESTAMP(),UTC_TIMESTAMP(),20,20,?,?,?,'OVERSEAS_SAMPLE_INCOMPLETE',?)", [runId,SOURCE,ACCOUNT,site.siteId,incoming.length,incoming.length,preserved.length,JSON.stringify(receipt)]);
      }
      for (const observation of site.items) {
        const entry = all.find(e => e.content.external_id === String(observation.externalId));
        const feedKey = `overseas:${site.siteId}:100017:home:merged`;
        const metadata = { feedKey, boardId: '100017', endpointKind: 'merged', pageKind: 'home', siteId: site.siteId,
          siteUrl: r.url, siteUrlSha256: r.url_hash, artifactSha256: artifactSha,
          observationSha256: sha(JSON.stringify(observation)), observedIntegrity: observation.rawPayload._contentIntegrity.status,
          contentVersionPreserved: entry.change === 'unchanged' };
        const prior = await q('SELECT id,feed_metadata FROM po_content_feed_memberships WHERE account_id=? AND content_id=? AND feed_key=? FOR UPDATE', [ACCOUNT,entry.content.id,feedKey]);
        if (prior.length > 1 || prior.some(m => {
          const p = parse(m.feed_metadata);
          return ['boardId','siteId','siteUrlSha256','artifactSha256','observationSha256'].some(k => p[k] !== metadata[k]);
        })) fail('OVERSEAS_SAMPLE_MEMBERSHIP_CONFLICT');
        await q('INSERT INTO po_content_feed_memberships (id,account_id,content_id,feed_key,page_kind,feed_metadata) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE last_seen_at=last_seen_at', [crypto.randomUUID(),ACCOUNT,entry.content.id,feedKey,'home',JSON.stringify(metadata)]);
        if (!prior.length) membershipsInserted++;
        const result = await q("INSERT IGNORE INTO po_sync_run_contents (run_id,content_id,change_type,sync_scope) VALUES (?,?,?,'posts')", [runId,entry.content.id,entry.change]);
        associationsInserted += result.affectedRows;
      }
      const associations = await q('SELECT c.external_id FROM po_sync_run_contents rc JOIN po_contents c ON c.id=rc.content_id WHERE rc.run_id=? AND rc.sync_scope=?', [runId,'posts']);
      if (associations.length !== 20 || new Set(associations.map(r => String(r.external_id))).size !== 20
        || associations.some(r => !byId.has(String(r.external_id)))) fail('OVERSEAS_SAMPLE_ASSOCIATIONS_INCOMPLETE');
    }
    // Fingerprint and exact job receipts are safe to display; bodies and credentials are not.
    const records = [];
    for (const e of all) records.push({ contentId: e.content.id, externalId: e.content.external_id,
      fingerprint: e.content.fingerprint, change: e.change,
      analysisJobs: await q('SELECT id,status,content_fingerprint,error_code,next_retry_at FROM po_analysis_jobs WHERE content_id=? AND analysis_profile=? AND analysis_version=?', [e.content.id,'light',analysisVersion]),
      translationJobs: await q('SELECT id,status,content_fingerprint,error_code,next_retry_at FROM po_translation_jobs WHERE content_id=? AND target_language=? AND translation_version=?', [e.content.id,'zh-CN',translationVersion]) });
    committing = true; await conn.commit(); committing = false; started = false;
    return { status: 'SAMPLE_IMPORT_COMMITTED', sourceId: SOURCE, artifactSha256: artifactSha, fullChainVerified: false,
      observations: 60, uniqueContents: all.length, insertedContents: incoming.length, preservedContents: preserved.length,
      associationsInserted, membershipsInserted, runIds, records };
  } catch (error) {
    error.diagnostic = { errno: error.errno, sqlState: error.sqlState, operation: error.operation,
      constraint: error.sqlMessage?.match(/CONSTRAINT\s+[`'"]([A-Za-z0-9_.]+)[`'"]/)?.[1] || null,
      sqlMessageCategory: /check constraint|CONSTRAINT.*failed/i.test(error.sqlMessage || '') ? 'CHECK_CONSTRAINT_FAILED'
        : /table.*doesn.t exist/i.test(error.sqlMessage || '') ? 'MISSING_TABLE'
          : /read.only|readonly/i.test(error.sqlMessage || '') ? 'READ_ONLY' : 'DATABASE_ERROR' };
    if (committing) { error.code = 'OVERSEAS_SAMPLE_COMMIT_UNKNOWN'; unusable = true; conn.destroy(); }
    else if (started) { try { await conn.rollback(); } catch { error.rollbackUnknown = true; unusable = true; conn.destroy(); } }
    throw error;
  } finally {
    if (!unusable) {
      try { if (locked) await q('SELECT RELEASE_LOCK(?)', [`po-overseas-sample:${SOURCE}`]); conn.release(); }
      catch { conn.destroy(); } // A cleanup failure cannot undo an acknowledged commit.
    }
  }
}
module.exports = { importSample, prepareSample, deterministicRunId };
