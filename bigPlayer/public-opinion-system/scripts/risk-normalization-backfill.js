'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { loadRuntimeEnv } = require('../server/src/runtimeEnv');
const { Repository } = require('../server/src/db/repository');
const { RISK_POLICY_VERSION } = require('../server/src/services/riskSeverityNormalizer');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const uuid = () => crypto.randomUUID();
function args(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error('invalid argument');
    result[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || !argv[i + 1] ? true : argv[++i];
  }
  return result;
}
function target(row) {
  if (row.sentiment === 'positive' && ['attention', 'urgent'].includes(row.severity)) return 'normal';
  if (row.sentiment === 'negative' && row.severity !== 'urgent' && Number(row.negative_score) >= 0.5) return 'urgent';
  return row.severity;
}
function same(a, b) {
  return ['id', 'content_id', 'analysis_version', 'analysis_level', 'content_fingerprint', 'analyzed_at', 'sentiment', 'severity', 'negative_score', 'confidence', 'model_name']
    .every(key => String(a[key] ?? '') === String(b[key] ?? ''));
}
function sameCache(a, b) {
  return ['cache_key', 'updated_at', 'content_fingerprint', 'analysis_profile', 'analysis_version', 'model_name', 'sentiment', 'severity', 'negative_score', 'confidence']
    .every(key => String(a[key] ?? '') === String(b[key] ?? ''));
}
function detail(row, finalSeverity, batchId, extra = {}) {
  return { contentId: row.content_id, originalSeverity: row.severity, finalSeverity,
    reasons: [row.sentiment === 'positive' ? 'positive_forced_normal' : 'negative_score_upgrade'],
    policyVersion: RISK_POLICY_VERSION, batchId, originalAnalysis: row, suppressHistoricalNotifications: true, ...extra };
}
async function preview(repo, output) {
  const conn = await repo.pool.getConnection();
  try {
    await conn.query('START TRANSACTION READ ONLY');
    const [rows] = await conn.query("SELECT a.*,c.fingerprint AS current_fingerprint,c.game_id,c.source_id,c.account_id,c.is_deleted FROM po_analyses a LEFT JOIN po_contents c ON c.id=a.content_id WHERE (a.sentiment='positive' AND a.severity IN ('attention','urgent')) OR (a.sentiment='negative' AND a.severity<>'urgent') ORDER BY a.content_id,a.id");
    const records = [], stale = [], orphan = [], semantic = [];
    for (const row of rows) {
      if (!row.current_fingerprint) { orphan.push({ contentId: row.content_id, analysisId: row.id }); continue; }
      if (row.content_fingerprint !== row.current_fingerprint) { stale.push({ contentId: row.content_id, analysisId: row.id, profile: row.analysis_level, analysisVersion: row.analysis_version, expectedFingerprint: row.current_fingerprint }); continue; }
      if (target(row) === row.severity) { semantic.push({ contentId: row.content_id, analysisId: row.id, profile: row.analysis_level, analysisVersion: row.analysis_version, expectedFingerprint: row.current_fingerprint }); continue; }
      records.push({ before: row, finalSeverity: target(row) });
    }
    const cacheByFingerprint = new Map();
    for (let offset = 0; offset < records.length; offset += 100) {
      const fingerprints = [...new Set(records.slice(offset, offset + 100).map(record => record.before.current_fingerprint).filter(fp => !cacheByFingerprint.has(fp)))];
      if (!fingerprints.length) continue;
      for (const fingerprint of fingerprints) cacheByFingerprint.set(fingerprint, []);
      const [cached] = await conn.query(`SELECT * FROM po_analysis_cache WHERE content_fingerprint IN (${fingerprints.map(() => '?').join(',')})`, fingerprints);
      for (const cache of cached) if (target(cache) !== cache.severity) cacheByFingerprint.get(cache.content_fingerprint).push(cache);
    }
    for (const record of records) record.caches = cacheByFingerprint.get(record.before.current_fingerprint) || [];
    const batchId = `risk-v5-${uuid()}`;
    const estimate = records.reduce((bytes, record) => bytes + Buffer.byteLength(JSON.stringify(detail(record.before, record.finalSeverity, batchId)))
      + record.caches.reduce((n, cache) => n + Buffer.byteLength(JSON.stringify({ ...detail(cache, target(cache), batchId), contentId: record.before.content_id })), 0), 0);
    const cacheRecords = [...new Map(records.flatMap(record => record.caches.map(cache => [cache.cache_key, { before: cache, contentId: record.before.content_id, fingerprint: record.before.current_fingerprint, gameId: record.before.game_id, sourceId: record.before.source_id }]))).values()];
    const plan = { schemaVersion: 2, status: 'dry-run-only', createdAt: new Date().toISOString(), batchId, policyVersion: RISK_POLICY_VERSION,
      productionChanged: false, historicalNotifications: false, batchSize: 100, records, cacheRecords, stale, orphan, semantic,
      counts: { deterministic: records.length, positive: records.filter(x => x.before.sentiment === 'positive').length,
        negative: records.filter(x => x.before.sentiment === 'negative').length, stale: stale.length, orphan: orphan.length,
        lowScoreSemantic: semantic.length, cacheCorrections: new Set(records.flatMap(x => x.caches.map(c => c.cache_key))).size },
      estimatedAuditJsonBytes: estimate, estimatedAuditMiB: +(estimate / 1024 ** 2).toFixed(2) };
    const bytes = JSON.stringify(plan, null, 2) + '\n';
    fs.writeFileSync(output, bytes, { flag: 'wx' });
    return { status: 'DRY_RUN', productionChanged: false, output, sha256: digest(bytes), counts: plan.counts, estimatedAuditJsonBytes: estimate, estimatedAuditMiB: plan.estimatedAuditMiB };
  } finally { await conn.rollback(); conn.release(); }
}
async function apply(repo, plan, approval, expectedHash) {
  if (approval.planSha256 !== expectedHash || approval.policyVersion !== RISK_POLICY_VERSION
    || approval.action !== 'risk-backfill-deterministic-only' || approval.historicalNotifications !== false
    || approval.writerCutoverVerified !== true || approval.sharedWorkerEnqueueRaceResolved !== true) throw new Error('exact reviewed backfill approval and writer cutover evidence required');
  if (plan.schemaVersion !== 2 || !Array.isArray(plan.cacheRecords) || plan.policyVersion !== RISK_POLICY_VERSION || plan.historicalNotifications !== false || plan.batchSize !== 100) throw new Error('plan mismatch');
  const gate = await repo.pool.getConnection();
  try {
    const [[lock]] = await gate.query("SELECT GET_LOCK('po-analysis-consumer',30) AS acquired");
    if (Number(lock.acquired) !== 1) throw new Error('analysis consumer did not drain within 30 seconds');
  } catch (error) { gate.release(); throw error; }
  const counts = { changed: 0, alreadyCompleted: 0, updatedOrMissing: 0, cachesChanged: 0, activePositiveAlertsClosed: 0, mixedAlertsSkipped: 0, committedBatches: 0 };
  try {
    const assertGate = async () => {
      const [[owner]] = await gate.query("SELECT IS_USED_LOCK('po-analysis-consumer')=CONNECTION_ID() AS owned");
      if (Number(owner.owned) !== 1) throw new Error('analysis gate lost');
    };
    for (let offset = 0; offset < plan.records.length; offset += 100) {
      await assertGate();
      const conn = await repo.pool.getConnection();
      const pendingCounts = { changed: 0, alreadyCompleted: 0, updatedOrMissing: 0, cachesChanged: 0, activePositiveAlertsClosed: 0, mixedAlertsSkipped: 0 };
      try {
        await conn.beginTransaction();
        for (const record of plan.records.slice(offset, offset + 100)) {
          const before = record.before;
          const [contents] = await conn.query('SELECT id,game_id,source_id,account_id,fingerprint FROM po_contents WHERE id=? FOR UPDATE', [before.content_id]);
          const [analyses] = await conn.query('SELECT * FROM po_analyses WHERE content_id=? FOR UPDATE', [before.content_id]);
          const current = analyses[0], content = contents[0];
          if (!current || !content || content.fingerprint !== before.current_fingerprint) { pendingCounts.updatedOrMissing++; continue; }
          if (current.severity === record.finalSeverity && current.id === before.id && current.content_fingerprint === before.content_fingerprint) { pendingCounts.alreadyCompleted++; continue; }
          if (!same(current, before) || target(current) !== record.finalSeverity) { pendingCounts.updatedOrMissing++; continue; }
          const [updated] = await conn.query('UPDATE po_analyses SET severity=? WHERE id=? AND analysis_version=? AND analysis_level=? AND analyzed_at=? AND content_fingerprint<=>? AND severity=?', [record.finalSeverity, before.id, before.analysis_version, before.analysis_level, before.analyzed_at, before.content_fingerprint, before.severity]);
          if (updated.affectedRows !== 1) throw new Error('analysis CAS lost');
          async function audit(eventType, auditDetail) {
            await conn.query('INSERT INTO po_audit_events(id,game_id,source_id,account_id,actor_type,actor_id,event_type,outcome,detail) VALUES (?,?,?,?,?,?,?,?,?)', [uuid(), content.game_id, content.source_id, content.account_id || null, 'system', null, eventType, 'success', JSON.stringify(auditDetail)]);
          }
          await audit('risk_backfill_analysis_normalized', detail(current, record.finalSeverity, plan.batchId, { batchOffset: offset }));
          pendingCounts.changed++;
          if (current.sentiment === 'positive') {
            const [alerts] = await conn.query("SELECT a.id FROM po_alerts a JOIN po_alert_contents ac ON ac.alert_id=a.id WHERE ac.content_id=? AND a.status IN ('pending','processing') ORDER BY a.id FOR UPDATE", [before.content_id]);
            for (const alert of alerts) {
              const [[related]] = await conn.query("SELECT COUNT(*) AS nonPositive FROM po_alert_contents ac LEFT JOIN po_analyses a ON a.content_id=ac.content_id WHERE ac.alert_id=? AND (a.sentiment IS NULL OR a.sentiment<>'positive')", [alert.id]);
              if (Number(related.nonPositive)) { pendingCounts.mixedAlertsSkipped++; continue; }
              await conn.query("UPDATE po_alerts SET status='false_positive',resolution_note=?,resolved_at=UTC_TIMESTAMP(3) WHERE id=? AND status IN ('pending','processing')", [`system: positive_normal_reconciliation; batchId=${plan.batchId}`, alert.id]);
              await audit('positive_risk_alerts_reconciled', { contentId: before.content_id, alertIds: [alert.id], runId: plan.batchId, batchId: plan.batchId, originalSeverity: current.severity, finalSeverity: 'normal', reasons: ['positive_forced_normal'] });
              pendingCounts.activePositiveAlertsClosed++;
            }
          }
        }
        await assertGate();
        await conn.commit();
        for (const key of Object.keys(pendingCounts)) counts[key] += pendingCounts[key];
        counts.committedBatches++;
        console.log(JSON.stringify({ batchOffset: offset, batchId: plan.batchId, counts }));
      } catch (error) { await conn.rollback(); error.committedCounts = counts; throw error; }
      finally { conn.release(); }
    }
    // Independent cache phase: a completed analysis must not prevent a skipped
    // or interrupted cache correction from being retried from the same plan.
    counts.cacheSkipped = 0; counts.cacheAlreadyCompleted = 0;
    for (let offset = 0; offset < plan.cacheRecords.length; offset += 100) {
      await assertGate();
      const conn = await repo.pool.getConnection();
      let changed = 0, skipped = 0, already = 0;
      try {
        await conn.beginTransaction();
        for (const record of plan.cacheRecords.slice(offset, offset + 100)) {
          const cache = record.before;
          const [contents] = await conn.query('SELECT id,fingerprint FROM po_contents WHERE id=? FOR UPDATE', [record.contentId]);
          if (contents[0]?.fingerprint !== record.fingerprint) { skipped++; continue; }
          const [cached] = await conn.query('SELECT * FROM po_analysis_cache WHERE cache_key=? FOR UPDATE', [cache.cache_key]);
          const actual = cached[0];
          if (actual?.severity === target(cache) && actual.content_fingerprint === cache.content_fingerprint && actual.sentiment === cache.sentiment) { already++; continue; }
          if (!actual || !sameCache(actual, cache) || target(actual) !== target(cache)) { skipped++; continue; }
          const [updated] = await conn.query('UPDATE po_analysis_cache SET severity=? WHERE cache_key=? AND updated_at=? AND severity=? AND content_fingerprint=?', [target(actual), cache.cache_key, cache.updated_at, cache.severity, cache.content_fingerprint]);
          if (updated.affectedRows !== 1) throw new Error('cache CAS lost');
          await conn.query('INSERT INTO po_audit_events(id,game_id,source_id,account_id,actor_type,actor_id,event_type,outcome,detail) VALUES (?,?,?,?,?,?,?,?,?)', [uuid(), record.gameId, record.sourceId, null, 'system', null, 'risk_backfill_cache_normalized', 'success', JSON.stringify({ ...detail(actual, target(actual), plan.batchId), contentId: record.contentId, cacheKey: cache.cache_key })]);
          changed++;
        }
        await assertGate(); await conn.commit();
        counts.cachesChanged += changed; counts.cacheSkipped += skipped; counts.cacheAlreadyCompleted += already;
        console.log(JSON.stringify({ cacheBatchOffset: offset, batchId: plan.batchId, counts }));
      } catch (error) { await conn.rollback(); error.committedCounts = counts; throw error; }
      finally { conn.release(); }
    }
    return { status: 'APPLIED', batchId: plan.batchId, counts, historicalNotifications: false };
  } finally { await gate.query("SELECT RELEASE_LOCK('po-analysis-consumer')"); gate.release(); }
}
async function main() {
  const options = args(process.argv.slice(2));
  if (Boolean(options['dry-run']) === Boolean(options.apply)) throw new Error('choose --dry-run or --apply');
  loadRuntimeEnv();
  const repo = new Repository({ ...process.env, DB_POOL_SIZE: '2' });
  try {
    if (options['dry-run']) {
      if (!options.output) throw new Error('--output required');
      console.log(JSON.stringify(await preview(repo, path.resolve(options.output))));
    } else {
      if (!options.plan || !options['plan-sha256'] || !options['approval-record']) throw new Error('exact plan/hash/approval required');
      const bytes = fs.readFileSync(options.plan), actualHash = digest(bytes);
      if (actualHash !== options['plan-sha256']) throw new Error('plan hash mismatch');
      console.log(JSON.stringify(await apply(repo, JSON.parse(bytes), JSON.parse(fs.readFileSync(options['approval-record'])), actualHash)));
    }
  } finally { await repo.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ error: error.code || error.message, committedCounts: error.committedCounts })); process.exitCode = 1; });
module.exports = { target, same, sameCache, preview, apply };
