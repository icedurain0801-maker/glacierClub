'use strict';
const crypto = require('node:crypto');
const { contractOf, canonical } = require('../../../worker/src/overseasBigPlayerRunContractJournal');
const { iso } = require('../../../worker/src/overseasBigPlayerNetworkContractVerifier');
const { normalizeSiteUrls } = require('../services/bigplayerSiteConfig');
const { isTrustedManualReceipt, cursorEvidence, evidenceOf, dbIso } = require('../../../worker/src/overseasManualReceipt');
const fail = code => { throw Object.assign(new Error(code), { code }); };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
// Explicit pending-marker receipt only. This does not invent a click ID or a
// historical scope from current config, and is not installed by service main.
function requestOf(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'bindings,expectedMarker,requestId'
    || !/^[a-f0-9]{64}$/.test(value.requestId || '') || !Array.isArray(value.bindings)
    || !value.bindings.length || value.bindings.length > 100) fail('OVERSEAS_MANUAL_REQUEST_INVALID');
  const expectedMarker = iso(value.expectedMarker);
  const bindings = value.bindings.map(binding => {
    if (!binding || Object.hasOwn(binding, 'leaseOwner') || Object.hasOwn(binding, 'leaseEpoch')) fail('OVERSEAS_MANUAL_REQUEST_INVALID');
    const c = contractOf({ ...binding, leaseOwner: 'manual-receipt-validation', leaseEpoch: 1 });
    if (Date.parse(c.windowEnd) - Date.parse(c.windowStart) > 7 * 86400000) fail('OVERSEAS_MANUAL_REQUEST_INVALID');
    const { leaseOwner, leaseEpoch, ...scope } = c;
    return Object.freeze(scope);
  }).sort((a, b) => a.siteId.localeCompare(b.siteId));
  const first = bindings[0], sites = new Set();
  for (const b of bindings) {
    for (const key of ['sourceId', 'accountId', 'gameId', 'communityId', 'boardId', 'manifestSha256']) if (b[key] !== first[key]) fail('OVERSEAS_MANUAL_REQUEST_INVALID');
    if (sites.has(b.siteId)) fail('OVERSEAS_MANUAL_REQUEST_INVALID');
    sites.add(b.siteId);
    // Same request/site cannot escape a scope conflict by choosing another ID.
    const hex = sha(canonical(['overseas-manual-v1', value.requestId, b.sourceId, b.accountId, b.siteId])).slice(0, 32);
    const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    if (b.runId !== id) fail('OVERSEAS_MANUAL_REQUEST_INVALID');
  }
  return Object.freeze({ requestId: value.requestId, expectedMarker, bindings: Object.freeze(bindings) });
}
function assertRun(row, b) {
  if (!row || row.id !== b.runId || row.source_id !== b.sourceId || row.account_id !== b.accountId
    || row.site_id !== b.siteId || row.parent_run_id != null || row.trigger_type !== 'manual'
    || row.sync_mode !== 'incremental' || row.scheduled_at != null
    || iso(row.window_start) !== b.windowStart || iso(row.window_end) !== b.windowEnd) fail('OVERSEAS_MANUAL_RUN_CONFLICT');
}
async function handoffOverseasManualMarker(repo, { request, receipt } = {}) {
  const r = requestOf(request), b = r.bindings[0];
  if (!isTrustedManualReceipt(receipt) || typeof repo?.pool?.getConnection !== 'function') fail('OVERSEAS_MANUAL_RECEIPT_REQUIRED');
  // A prepared immutable receipt must already exist. A fixture reader is only
  // an injection seam, never persistence or permission to run production.
  if (canonical(await receipt.read(r)) !== canonical(r)) fail('OVERSEAS_MANUAL_RECEIPT_MISMATCH');
  const evidence = evidenceOf(await receipt.readEvidence(r),r);
  const conn = await repo.pool.getConnection();
  let started = false, committing = false, destroyed = false;
  const destroy = () => { destroyed = true; conn.destroy(); };
  try {
    await conn.beginTransaction(); started = true;
    const [sources] = await conn.query(`SELECT s.id,s.game_id,s.community_id,s.platform,s.config,s.enabled,s.default_account_id,
      s.auth_status,(s.auth_expire_at IS NOT NULL AND s.auth_expire_at<=UTC_TIMESTAMP(3)) AS auth_expired,
      DATE_FORMAT(s.collect_requested_at,'%Y-%m-%d %H:%i:%s.%f') AS marker,
      g.region_code,g.enabled AS game_enabled,c.game_id AS community_game,c.status AS community_status
      FROM po_sources s JOIN po_games g ON g.id=s.game_id JOIN po_communities c ON c.id=s.community_id
      WHERE s.id=? FOR UPDATE`, [b.sourceId]);
    const s = sources[0];
    if (sources.length !== 1 || !s || s.game_id !== b.gameId || s.community_id !== b.communityId
      || s.community_game !== b.gameId || s.platform !== 'bigplayer_h5' || s.region_code !== 'overseas'
      || Number(s.enabled) !== 1 || Number(s.game_enabled) !== 1 || s.community_status !== 'enabled'
      || s.default_account_id !== b.accountId || s.auth_status !== 'authorized' || Number(s.auth_expired) !== 0) fail('OVERSEAS_MANUAL_SCOPE_INVALID');
    const marker = s.marker == null ? null : iso(String(s.marker).replace(/(\.\d{3})000$/, '$1'));
    let config; try { config = typeof s.config === 'string' ? JSON.parse(s.config) : s.config; } catch { fail('OVERSEAS_MANUAL_SCOPE_INVALID'); }
    if (!config || Array.isArray(config) || (Object.hasOwn(config, 'deleted') && config.deleted !== false)
      || String(config.boardId) !== b.boardId) fail('OVERSEAS_MANUAL_SCOPE_INVALID');
    const [accounts] = await conn.query(`SELECT id,source_id,game_id,community_id,platform,enabled,auth_status,
      (auth_expire_at IS NOT NULL AND auth_expire_at<=UTC_TIMESTAMP(3)) AS auth_expired
      FROM po_accounts WHERE id=? FOR UPDATE`, [b.accountId]);
    const a = accounts[0];
    if (accounts.length !== 1 || !a || a.source_id !== b.sourceId || a.game_id !== b.gameId
      || a.community_id !== b.communityId || a.platform !== 'bigplayer_h5' || Number(a.enabled) !== 1
      || a.auth_status !== 'authorized' || Number(a.auth_expired) !== 0) fail('OVERSEAS_MANUAL_SCOPE_INVALID');
    const [credentials] = await conn.query(`SELECT id,status,
      (expire_at IS NOT NULL AND expire_at<=UTC_TIMESTAMP(3)) AS credential_expired,
      (secret_cipher IS NOT NULL AND OCTET_LENGTH(secret_cipher)>0) AS has_secret_cipher
      FROM po_credentials WHERE source_id=? AND account_id=? AND credential_type='api_token'
      ORDER BY updated_at DESC,id DESC LIMIT 1 FOR UPDATE`, [b.sourceId,b.accountId]);
    if (credentials.length !== 1 || credentials[0].status !== 'active'
      || Number(credentials[0].credential_expired) !== 0 || Number(credentials[0].has_secret_cipher) !== 1) fail('OVERSEAS_MANUAL_CREDENTIAL_INVALID');
    const sites = normalizeSiteUrls(config).siteUrls.filter(site => site.enabled).sort((a,b) => a.siteId.localeCompare(b.siteId));
    const [registry] = await conn.query('SELECT site_id,url,url_hash,enabled FROM po_source_sites WHERE source_id=? AND enabled=1 ORDER BY site_id FOR UPDATE', [b.sourceId]);
    if (sites.length !== r.bindings.length || registry.length !== sites.length) fail('OVERSEAS_MANUAL_SITE_CONFLICT');
    for (const scope of r.bindings) {
      const selected = sites.filter(site => site.siteId === scope.siteId && site.url === scope.siteUrl);
      const stored = registry.filter(site => site.site_id === scope.siteId && site.url === scope.siteUrl && site.url_hash === scope.siteUrlSha256 && Number(site.enabled) === 1);
      if (selected.length !== 1 || stored.length !== 1) fail('OVERSEAS_MANUAL_SITE_CONFLICT');
    }
    const runs = [];
    for (const scope of r.bindings) {
      const [rows] = await conn.query('SELECT * FROM po_sync_runs WHERE id=? FOR UPDATE', [scope.runId]);
      if (rows.length > 1) fail('OVERSEAS_MANUAL_RUN_CONFLICT');
      if (rows[0]) assertRun(rows[0], scope);
      runs.push(rows[0] || null);
    }
    // Committed request replay never clears a newer marker or resets a run.
    if (runs.every(Boolean)) { await conn.rollback(); started = false; return { status: 'already_accepted', runs }; }
    if (runs.some(Boolean)) fail('OVERSEAS_MANUAL_PARTIAL_EVIDENCE');
    if (marker !== r.expectedMarker) fail('WORKER_MANUAL_MARKER_CHANGED');
    for (const scope of r.bindings) {
      const actual = await cursorEvidence(conn,scope), expected = evidence.cursors.find(cursor=>cursor.siteId===scope.siteId);
      if (canonical(actual) !== canonical(expected)) fail('OVERSEAS_MANUAL_CURSOR_CHANGED');
    }
    // The fixed prepare anchor must not lie in the DB's future. No invented
    // freshness interval or retry-time window recomputation here.
    const [clock] = await conn.query("SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%d %H:%i:%s.%f') AS now_utc");
    if(clock.length!==1||dbIso(clock[0].now_utc)<evidence.admissionAnchor)fail('OVERSEAS_MANUAL_WINDOW_EVIDENCE_INVALID');
    const [active] = await conn.query("SELECT id FROM po_sync_runs WHERE source_id=? AND status IN ('queued','running','pausing','paused','cancelling') LIMIT 1 FOR UPDATE", [b.sourceId]);
    if (active.length) fail('PREVIOUS_RUN_ACTIVE');
    for (const scope of r.bindings) {
      await conn.query("INSERT INTO po_sync_runs (id,source_id,account_id,site_id,trigger_type,status,sync_mode,scheduled_at,window_start,window_end,started_at) VALUES (?,?,?,?,'manual','queued','incremental',NULL,?,?,NULL)",
        [scope.runId,scope.sourceId,scope.accountId,scope.siteId,scope.windowStart.replace('T',' ').replace('Z',''),scope.windowEnd.replace('T',' ').replace('Z','')]);
      const [rows] = await conn.query('SELECT * FROM po_sync_runs WHERE id=?', [scope.runId]);
      if (rows.length !== 1) fail('OVERSEAS_MANUAL_RUN_CONFLICT');
      assertRun(rows[0], scope); runs.push(rows[0]);
    }
    const [cleared] = await conn.query('UPDATE po_sources SET collect_requested_at=NULL WHERE id=? AND collect_requested_at<=>?', [b.sourceId,r.expectedMarker.replace('T',' ').replace('Z','')]);
    if (Number(cleared.affectedRows) !== 1) fail('WORKER_MANUAL_MARKER_CHANGED');
    committing = true; await conn.commit(); committing = false; started = false;
    return { status: 'accepted', runs: runs.filter(Boolean) };
  } catch (error) {
    if (committing) { destroy(); fail('OVERSEAS_MANUAL_HANDOFF_COMMIT_UNKNOWN'); }
    if (started) try { await conn.rollback(); } catch { destroy(); }
    throw error;
  } finally { if (!destroyed) conn.release(); }
}
async function reconcileOverseasManualMarker(repo,{request,receipt}={}) {
  const r=requestOf(request);
  if(!isTrustedManualReceipt(receipt))fail('OVERSEAS_MANUAL_RECEIPT_REQUIRED');
  await receipt.read(r);
  const conn=await repo.pool.getConnection();let started=false,destroyed=false;
  try {
    // Read-only snapshot: no marker cleanup, claim, Journal creation or retry.
    await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION READ ONLY');started=true;
    const [rows]=await conn.query(`SELECT * FROM po_sync_runs WHERE id IN (${r.bindings.map(()=>'?').join(',')}) ORDER BY id`,r.bindings.map(b=>b.runId));
    const [sources]=await conn.query("SELECT DATE_FORMAT(collect_requested_at,'%Y-%m-%d %H:%i:%s.%f') AS marker FROM po_sources WHERE id=?",[r.bindings[0].sourceId]);
    let status='unknown';
    if(rows.length===r.bindings.length) {
      try {
        for(const b of r.bindings) {
          const found=rows.filter(row=>row.id===b.runId);if(found.length!==1)fail('OVERSEAS_MANUAL_RUN_CONFLICT');
          assertRun(found[0],b);
          if(!['queued','running','pausing','paused','cancelling','completed','completed_full','completed_authorized_scope','partial','failed','cancelled','canceled','awaiting_manual_verification'].includes(found[0].status))fail('OVERSEAS_MANUAL_RUN_CONFLICT');
        }
        status='accepted';
      } catch {status='unknown';}
    } else if(rows.length===0&&sources.length===1&&sources[0].marker!=null&&dbIso(sources[0].marker)===r.expectedMarker)status='not_committed';
    await conn.rollback();started=false;return {status,automaticWriteAllowed:false};
  } finally {
    if(started)try{await conn.rollback();}catch{destroyed=true;conn.destroy();}
    if(!destroyed)conn.release();
  }
}
module.exports = { requestOf, handoffOverseasManualMarker, reconcileOverseasManualMarker };
