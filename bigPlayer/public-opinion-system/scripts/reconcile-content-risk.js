'use strict';
// Reconcile one explicitly selected historical analysis against a verified runtime.
// Dry-run is the default. Apply requires the exact plan hash and rechecks every row.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function correction(row, content, policy) {
  if (content.is_deleted || !row.content_fingerprint || row.content_fingerprint !== content.fingerprint) throw new Error('content deleted or analysis fingerprint stale');
  let context = row.risk_context || {};
  if (typeof context === 'string') context = JSON.parse(context);
  const result = policy.normalizeSeverity({ ...context, ...row, severity: context.originalSeverity ?? row.severity, title: content.title, body: content.body });
  // This repair only promotes an observed game problem to negative pending.
  // Never downgrade an urgent result or reclassify ordinary consultations.
  if (!['attention', 'negative'].includes(row.severity) || !result.gameIssueMatched || result.severity !== 'negative') throw new Error('not an eligible game-problem correction');
  return 'negative';
}
async function preview(repo, contentId, policy) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(contentId || '')) throw new Error('explicit UUID contentId required');
  if (policy.SEVERITY_RANK?.negative !== 2 || !policy.RISK_POLICY_VERSION) throw new Error('runtime must support progressive negative pending policy');
  const conn = await repo.pool.getConnection();
  try {
    await conn.query('START TRANSACTION READ ONLY');
    const [[content]] = await conn.query('SELECT id,game_id,source_id,account_id,title,body,fingerprint,is_deleted FROM po_contents WHERE id=?', [contentId]);
    const [[analysis]] = await conn.query('SELECT * FROM po_analyses WHERE content_id=?', [contentId]);
    if (!content || !analysis) throw new Error('content or analysis not found');
    correction(analysis, content, policy);
    const [caches] = await conn.query('SELECT * FROM po_analysis_cache WHERE content_fingerprint=? AND analysis_profile=? AND analysis_version=? AND model_name=? ORDER BY cache_key', [content.fingerprint, analysis.analysis_level, analysis.analysis_version, analysis.model_name]);
    for (const cache of caches) correction(cache, content, policy);
    return { schemaVersion: 1, content, analysis, caches, finalSeverity: 'negative', policyVersion: policy.RISK_POLICY_VERSION };
  } finally { await conn.rollback(); conn.release(); }
}
async function apply(repo, plan, policy) {
  if (plan.schemaVersion !== 1 || plan.finalSeverity !== 'negative' || plan.policyVersion !== policy.RISK_POLICY_VERSION) throw new Error('plan or policy mismatch');
  const conn = await repo.pool.getConnection();
  const result = { contentId: plan.content.id, analysisChanged: 0, cacheChanged: 0, historicalNotifications: false };
  try {
    await conn.beginTransaction();
    const [[content]] = await conn.query('SELECT id,game_id,source_id,account_id,title,body,fingerprint,is_deleted FROM po_contents WHERE id=? FOR UPDATE', [plan.content.id]);
    const [[analysis]] = await conn.query('SELECT * FROM po_analyses WHERE content_id=? FOR UPDATE', [plan.content.id]);
    if (JSON.stringify(content) !== JSON.stringify(plan.content) || JSON.stringify(analysis) !== JSON.stringify(plan.analysis)) throw new Error('content or analysis changed since preview');
    correction(analysis, content, policy);
    const [caches] = await conn.query('SELECT * FROM po_analysis_cache WHERE content_fingerprint=? AND analysis_profile=? AND analysis_version=? AND model_name=? ORDER BY cache_key FOR UPDATE', [content.fingerprint, analysis.analysis_level, analysis.analysis_version, analysis.model_name]);
    if (JSON.stringify(caches) !== JSON.stringify(plan.caches)) throw new Error('cache changed since preview');
    for (const cache of caches) correction(cache, content, policy);
    const batchId = crypto.randomUUID();
    async function audit(before, cacheKey) {
      await conn.query('INSERT INTO po_audit_events (id,game_id,source_id,account_id,actor_type,actor_id,event_type,outcome,detail) VALUES (?,?,?,?,?,?,?,?,?)', [crypto.randomUUID(), content.game_id, content.source_id, content.account_id || null, 'system', null, 'game_problem_risk_reconciled', 'success', JSON.stringify({ batchId, contentId: content.id, cacheKey: cacheKey || null, policyVersion: policy.RISK_POLICY_VERSION, originalSeverity: before.severity, finalSeverity: 'negative', originalAnalysis: before, historicalNotifications: false })]);
    }
    if (analysis.severity !== 'negative') {
      const [updated] = await conn.query("UPDATE po_analyses SET severity='negative' WHERE id=? AND severity='attention'", [analysis.id]);
      if (updated.affectedRows !== 1) throw new Error('analysis update lost');
      await audit(analysis); result.analysisChanged++;
    }
    for (const cache of caches) if (cache.severity !== 'negative') {
      const [updated] = await conn.query("UPDATE po_analysis_cache SET severity='negative' WHERE cache_key=? AND severity='attention'", [cache.cache_key]);
      if (updated.affectedRows !== 1) throw new Error('cache update lost');
      await audit(cache, cache.cache_key); result.cacheChanged++;
    }
    await conn.commit(); return result;
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
async function main(argv) {
  const args = {};
  const allowed = new Set(['runtime-root', 'content-id', 'plan', 'apply', 'sha256']);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!allowed.has(key) || !argv[i].startsWith('--')) throw new Error('unsupported argument');
    args[key] = key === 'apply' ? true : argv[++i];
  }
  if (!args['runtime-root'] || !args.plan) throw new Error('--runtime-root and --plan required');
  const runtime = path.resolve(args['runtime-root']);
  const policy = require(path.join(runtime, 'server/src/services/riskSeverityNormalizer'));
  require('../server/src/runtimeEnv').loadRuntimeEnv();
  const { Repository } = require(path.join(runtime, 'server/src/db/repository'));
  const repo = new Repository();
  try {
    if (args.apply) {
      const bytes = fs.readFileSync(args.plan);
      if (!args.sha256 || digest(bytes) !== args.sha256) throw new Error('exact preview sha256 required');
      console.log(JSON.stringify(await apply(repo, JSON.parse(bytes), policy)));
    } else {
      const plan = await preview(repo, args['content-id'], policy);
      const bytes = JSON.stringify(plan, null, 2) + '\n';
      fs.writeFileSync(args.plan, bytes, { flag: 'wx' });
      console.log(JSON.stringify({ contentId: plan.content.id, from: plan.analysis.severity, to: plan.finalSeverity, matchingCaches: plan.caches.length, sha256: digest(bytes), productionChanged: false }));
    }
  } finally { await repo.pool.end(); }
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { correction, preview, apply };
