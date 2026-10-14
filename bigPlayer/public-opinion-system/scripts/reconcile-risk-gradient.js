'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const COMMUNITY = '00000000-0000-0000-0000-000000000101';
const FROM = '2026-10-05 16:00:00', TO = '2026-10-12 16:00:00';

function target(analysis, content, policy, issue) {
  if (content.is_deleted || !analysis.content_fingerprint || analysis.content_fingerprint !== content.fingerprint) return null;
  // Keep unrelated normal content out of this correction. Never manufacture
  // negative contents just to produce a target percentage.
  if (analysis.severity === 'normal' && !issue.productIssueEvidence(content)) return null;
  const result = policy.normalizeAnalysisResult(analysis, content);
  if (result.severity === analysis.severity) return null;
  return { severity: result.severity, riskContext: JSON.stringify({
    gameComplaint: result.gameComplaint, gameExperienceRelated: result.gameExperienceRelated,
    originalSeverity: result.originalSeverity, rawAnalysis: result.rawAnalysis,
    riskPolicyVersion: result.riskPolicyVersion
  }) };
}
async function preview(repo, policy, issue) {
  const conn = await repo.pool.getConnection();
  try {
    await conn.query('START TRANSACTION READ ONLY');
    const [contents] = await conn.query('SELECT id,game_id,community_id,source_id,account_id,title,body,fingerprint,is_deleted,published_at FROM po_contents WHERE community_id=? AND published_at>=? AND published_at<? AND COALESCE(is_deleted,0)=0 ORDER BY id', [COMMUNITY, FROM, TO]);
    const [analyses] = await conn.query('SELECT a.* FROM po_analyses a JOIN po_contents c ON c.id=a.content_id WHERE c.community_id=? AND c.published_at>=? AND c.published_at<? AND COALESCE(c.is_deleted,0)=0 ORDER BY a.content_id,a.id', [COMMUNITY, FROM, TO]);
    const byContent = new Map(contents.map(c => [c.id, c])), before = {}, after = {};
    const records = [], cacheRecords = new Map(), skippedStale = [];
    for (const analysis of analyses) {
      const content = byContent.get(analysis.content_id);
      before[analysis.severity] = (before[analysis.severity] || 0) + 1;
      if (analysis.content_fingerprint !== content.fingerprint) skippedStale.push(content.id);
      const final = target(analysis, content, policy, issue);
      const severity = final?.severity || analysis.severity;
      after[severity] = (after[severity] || 0) + 1;
      if (!final) continue;
      records.push({ content, before: analysis, final });
      const [caches] = await conn.query('SELECT * FROM po_analysis_cache WHERE content_fingerprint=? AND analysis_profile=? AND analysis_version=? AND model_name=? ORDER BY cache_key', [content.fingerprint, analysis.analysis_level, analysis.analysis_version, analysis.model_name]);
      for (const cache of caches) {
        const cacheFinal = target(cache, content, policy, issue);
        if (!cacheFinal) continue;
        if (cacheRecords.has(cache.cache_key) && !same(cacheRecords.get(cache.cache_key).final, cacheFinal)) throw new Error('conflicting shared cache correction');
        cacheRecords.set(cache.cache_key, { content, before: cache, final: cacheFinal });
      }
    }
    return { schema: 1, communityId: COMMUNITY, from: FROM, to: TO, policyVersion: policy.RISK_POLICY_VERSION,
      historicalNotifications: false, batchId: crypto.randomUUID(), before, after, skippedStale, records, cacheRecords: [...cacheRecords.values()] };
  } finally { await conn.rollback(); conn.release(); }
}
async function apply(repo, plan, policy, issue) {
  if (plan.schema !== 1 || plan.communityId !== COMMUNITY || plan.from !== FROM || plan.to !== TO
    || plan.policyVersion !== policy.RISK_POLICY_VERSION || plan.historicalNotifications !== false) throw new Error('plan scope or policy mismatch');
  const conn = await repo.pool.getConnection();
  const counts = { analyses: 0, caches: 0, historicalNotifications: false };
  try {
    await conn.beginTransaction();
    for (const record of plan.records) {
      const [[content]] = await conn.query('SELECT id,game_id,community_id,source_id,account_id,title,body,fingerprint,is_deleted,published_at FROM po_contents WHERE id=? FOR UPDATE', [record.content.id]);
      const [[analysis]] = await conn.query('SELECT * FROM po_analyses WHERE id=? FOR UPDATE', [record.before.id]);
      if (!same(content, record.content) || !same(analysis, record.before) || !same(target(analysis, content, policy, issue), record.final)) throw new Error('content or analysis changed; regenerate preview');
      const [updated] = await conn.query('UPDATE po_analyses SET severity=?,risk_context=? WHERE id=? AND severity=? AND content_fingerprint=?', [record.final.severity, record.final.riskContext, analysis.id, analysis.severity, content.fingerprint]);
      if (updated.affectedRows !== 1) throw new Error('analysis update lost');
      await audit(record, null); counts.analyses++;
    }
    for (const record of plan.cacheRecords) {
      const [[content]] = await conn.query('SELECT id,game_id,community_id,source_id,account_id,title,body,fingerprint,is_deleted,published_at FROM po_contents WHERE id=? FOR UPDATE', [record.content.id]);
      const [[cache]] = await conn.query('SELECT * FROM po_analysis_cache WHERE cache_key=? FOR UPDATE', [record.before.cache_key]);
      if (!same(content, record.content) || !same(cache, record.before) || !same(target(cache, content, policy, issue), record.final)) throw new Error('cache changed; regenerate preview');
      const [updated] = await conn.query('UPDATE po_analysis_cache SET severity=?,risk_context=? WHERE cache_key=? AND severity=? AND content_fingerprint=?', [record.final.severity, record.final.riskContext, cache.cache_key, cache.severity, content.fingerprint]);
      if (updated.affectedRows !== 1) throw new Error('cache update lost');
      await audit(record, cache.cache_key); counts.caches++;
    }
    async function audit(record, cacheKey) {
      await conn.query('INSERT INTO po_audit_events (id,game_id,source_id,account_id,actor_type,actor_id,event_type,outcome,detail) VALUES (?,?,?,?,?,?,?,?,?)', [crypto.randomUUID(), record.content.game_id, record.content.source_id, record.content.account_id || null, 'system', null, 'risk_gradient_reconciled', 'success', JSON.stringify({ batchId: plan.batchId, contentId: record.content.id, cacheKey, policyVersion: plan.policyVersion, originalAnalysis: record.before, finalSeverity: record.final.severity, historicalNotifications: false })]);
    }
    await conn.commit(); return counts;
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}
async function main(argv) {
  const args = {}, allowed = ['runtime-root', 'plan', 'apply', 'sha256'];
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || !allowed.includes(key)) throw new Error('unsupported argument');
    args[key] = key === 'apply' ? true : argv[++i];
  }
  if (!args['runtime-root'] || !args.plan) throw new Error('runtime-root and plan required');
  const root = path.resolve(args['runtime-root']);
  const policy = require(path.join(root, 'server/src/services/riskSeverityNormalizer'));
  const issue = require(path.join(root, 'server/src/services/productIssueEvidence'));
  require('../server/src/runtimeEnv').loadRuntimeEnv();
  const { Repository } = require('../server/src/db/repository');
  const repo = new Repository();
  try {
    if (args.apply) {
      const bytes = fs.readFileSync(args.plan);
      if (!args.sha256 || digest(bytes) !== args.sha256) throw new Error('exact approved preview sha256 required');
      console.log(JSON.stringify(await apply(repo, JSON.parse(bytes), policy, issue)));
    } else {
      const plan = await preview(repo, policy, issue), bytes = JSON.stringify(plan, null, 2) + '\n';
      fs.writeFileSync(args.plan, bytes, { flag: 'wx' });
      console.log(JSON.stringify({ productionChanged: false, before: plan.before, after: plan.after, analyses: plan.records.length, caches: plan.cacheRecords.length, skippedStale: plan.skippedStale.length, sha256: digest(bytes) }));
    }
  } finally { await repo.pool.end(); }
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { target, preview, apply };
