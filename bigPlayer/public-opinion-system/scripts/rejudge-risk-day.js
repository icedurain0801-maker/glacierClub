'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Bounded replay. Reads and AI responses are snapshotted before business writes.
// It deliberately never imports AlertEngine or notifications and never deletes alerts.
const SCOPE = Object.freeze({ communityId: '00000000-0000-0000-0000-000000000101', platform: 'bigplayer_h5', region: 'domestic', from: '2026-10-10 16:00:00', to: '2026-10-11 16:00:00' });
const SQL = `SELECT c.*,s.platform,g.name AS game_name,g.region_code,cm.name AS community_name,
 a.id AS analysis_id,a.severity AS old_severity,a.analysis_level,a.analysis_version,a.risk_context,a.analyzed_at
 FROM po_contents c JOIN po_sources s ON s.id=c.source_id JOIN po_games g ON g.id=c.game_id
 JOIN po_communities cm ON cm.id=c.community_id LEFT JOIN po_analyses a ON a.content_id=c.id
 WHERE c.is_deleted=0 AND c.community_id=? AND s.platform=? AND g.region_code=?
 AND c.published_at>=? AND c.published_at<? ORDER BY c.published_at,c.id`;
const PARAMS = [SCOPE.communityId, SCOPE.platform, SCOPE.region, SCOPE.from, SCOPE.to];
function policyOf(row) { try { return (typeof row.risk_context === 'string' ? JSON.parse(row.risk_context) : row.risk_context)?.riskPolicyVersion; } catch { return null; } }
function itemOf(r) { return { title: r.title || '', body: r.body || '', fingerprint: r.fingerprint, gameId: r.game_id, gameName: r.game_name, communityId: r.community_id, communityName: r.community_name, regionCode: r.region_code, platform: r.platform }; }
function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw Error('invalid argument');
    out[argv[i].slice(2)] = !argv[i + 1] || argv[i + 1].startsWith('--') ? true : argv[++i];
  }
  return out;
}
async function run({ repo, ai, normalizeAnalysisResult, policyVersion, output, apply = false }) {
  fs.mkdirSync(output, { recursive: true });
  const current = await repo.query(SQL, PARAMS);
  const plan = { scope: SCOPE, policyVersion, total: current.length,
    types: current.reduce((a, r) => (a[r.content_type] = (a[r.content_type] || 0) + 1, a), {}),
    needsPolicy: current.filter(r => policyOf(r) !== policyVersion).length,
    lightCallsEstimate: Math.ceil(current.length / ai.profiles.light.batchSize),
    deepWorstCaseCalls: Math.ceil(current.length / ai.profiles.deep.batchSize),
    historicalNotifications: false };
  console.log(JSON.stringify({ stage: 'scope', ...plan }));
  if (!apply) return plan;
  if (!ai.configured('light') || !ai.configured('deep')) throw Error('AI profiles unavailable');
  const snapshotPath = path.join(output, 'snapshot.json');
  const snapshot = fs.existsSync(snapshotPath) ? JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    : { runId: `risk-v8-oct11-${crypto.randomUUID()}`, at: new Date().toISOString(), ...plan, scopeIdsAtSnapshot: current.map(r => r.id), rows: current.filter(r => policyOf(r) !== policyVersion) };
  if (JSON.stringify(snapshot.scope) !== JSON.stringify(SCOPE) || snapshot.policyVersion !== policyVersion) throw Error('snapshot policy/scope mismatch');
  if (!fs.existsSync(snapshotPath)) fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  const resultsPath = path.join(output, 'responses.json');
  const results = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, 'utf8')) : {};
  const result = { runId: snapshot.runId, ...plan, selected: snapshot.rows.length, completed: 0, deep: 0,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, levels: {}, skipped: [], historicalNotifications: false, createdAlerts: 0 };
  const currentIds = new Set(current.map(r => r.id));
  if (snapshot.rows.some(r => !currentIds.has(r.id))) throw Error('snapshot contents removed from scope; review required before writing');
  const save = () => fs.writeFileSync(resultsPath, JSON.stringify(results));
  async function analyze(items, profile) {
    let last;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return await ai.analyzeBatch(items, profile); }
      catch (error) { last = error; if (!/INVALID|INCOMPLETE|Timeout/i.test(error.message + error.name)) throw error; }
    }
    if (items.length > 1) {
      const half = Math.ceil(items.length / 2);
      return [...await analyze(items.slice(0, half), profile), ...await analyze(items.slice(half), profile)];
    }
    throw last;
  }
  // Collect AI results first. A failed request leaves no partially written batch.
  async function collectBatch(offset) {
    const rows = snapshot.rows.slice(offset, offset + ai.profiles.light.batchSize).filter(r => !results[r.id]);
    if (!rows.length) return;
    const items = rows.map(itemOf);
    const light = await analyze(items, 'light');
    const indices = light.map((a, i) => a.needsDeep || a.confidence < 0.6 || a.severity === 'urgent' ? i : -1).filter(i => i >= 0);
    const deep = indices.length ? await analyze(indices.map(i => items[i]), 'deep') : [];
    rows.forEach((row, i) => {
      const d = indices.indexOf(i);
      // A validated urgent light result is kept for human review if deep suggests
      // a downgrade, as required by the prompt. Old DB urgent is not inherited.
      let final = d >= 0 ? deep[d] : light[i];
      if (light[i].severity === 'urgent' && final.severity !== 'urgent') {
        final = normalizeAnalysisResult({ ...light[i], needsDeep: true,
          riskDecision: { ...light[i].riskDecision, downgrade_suggest: `深度分析建议${final.riskDecision.level_name}，请人工复核` } }, items[i]);
      }
      results[row.id] = { fingerprint: row.fingerprint, light: light[i], deep: d >= 0 ? deep[d] : null, final, profile: d >= 0 && final === deep[d] ? 'deep' : 'light' };
    });
    save();
    console.log(JSON.stringify({ stage: 'AI', analyzed: Object.keys(results).length, total: snapshot.rows.length }));
  }
  let nextOffset = 0;
  const collectors = Array.from({ length: 3 }, async () => {
    while (nextOffset < snapshot.rows.length) {
      const offset = nextOffset; nextOffset += ai.profiles.light.batchSize;
      await collectBatch(offset);
    }
  });
  const collected = await Promise.allSettled(collectors);
  const failed = collected.find(entry => entry.status === 'rejected');
  if (failed) throw failed.reason;
  let locked = false;
  try {
    locked = await repo.acquireAdvisoryLock('po-analysis-consumer', 60);
    if (!locked) throw Error('analysis consumer busy; responses saved, no writes made');
    for (const row of snapshot.rows) {
      const data = results[row.id];
      if (!data || data.fingerprint !== row.fingerprint || !data.final.riskDecision) throw Error('missing or changed response');
      const fresh = (await repo.query('SELECT fingerprint,is_deleted,community_id,published_at FROM po_contents WHERE id=?', [row.id]))[0];
      if (!fresh || fresh.is_deleted || fresh.community_id !== SCOPE.communityId || fresh.fingerprint !== row.fingerprint) { result.skipped.push(row.id); continue; }
      const analysis = normalizeAnalysisResult({ ...data.final, profile: data.profile, analysisLevel: data.profile,
        contentFingerprint: row.fingerprint, triggerReason: 'historical_risk_policy_v8_no_notify', normalizationBatchId: snapshot.runId, runId: snapshot.runId }, itemOf(row));
      await repo.insertAnalysis(row.id, analysis);
      for (const [profile, entry] of [['light', data.light], ...(data.deep ? [['deep', data.deep]] : [])]) {
        await repo.upsertAnalysisCache({ ...entry, profile, version: ai.profiles[profile].version,
          contentFingerprint: row.fingerprint, cacheKey: ai.cacheKey(row.fingerprint, ai.profiles[profile], itemOf(row)),
          normalizationBatchId: snapshot.runId, usage: { inputTokens: entry.inputTokens, outputTokens: entry.outputTokens, totalTokens: entry.totalTokens, estimated: entry.usageEstimated } });
        for (const k of Object.keys(result.usage)) result.usage[k] += entry[k] || 0;
      }
      result.completed++; if (data.deep) result.deep++;
      result.levels[analysis.severity] = (result.levels[analysis.severity] || 0) + 1;
      if (result.completed % 50 === 0) console.log(JSON.stringify({ stage: 'persist', completed: result.completed, total: result.selected }));
    }
  } finally { if (locked) await repo.releaseAdvisoryLock('po-analysis-consumer'); }
  const after = await repo.query(SQL, PARAMS);
  result.remainingOldPolicy = after.filter(r => policyOf(r) !== policyVersion).length;
  result.currentLevels = after.reduce((a, r) => (a[r.old_severity] = (a[r.old_severity] || 0) + 1, a), {});
  const finalById = new Map(after.map(row => [row.id, row.old_severity]));
  result.transitions = snapshot.rows.reduce((a, row) => { const key = `${row.old_severity || 'unanalyzed'}->${finalById.get(row.id) || 'skipped'}`; a[key] = (a[key] || 0) + 1; return a; }, {});
  result.completedAt = new Date().toISOString(); result.callsThisProcess = ai.callState;
  result.status = result.remainingOldPolicy || result.skipped.length ? 'partial' : 'completed';
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  return result;
}
async function main() {
  const options = args(process.argv.slice(2));
  if (!options.output || !options['runtime-root']) throw Error('--output and --runtime-root required');
  const runtime = path.resolve(options['runtime-root']);
  if (!runtime.replaceAll('\\', '/').startsWith('C:/ProgramData/PublicOpinion/releases/')) throw Error('runtime must be a verified local release');
  const { loadRuntimeEnv } = require(path.join(runtime, 'server/src/runtimeEnv'));
  loadRuntimeEnv();
  const { Repository } = require(path.join(runtime, 'server/src/db/repository'));
  const { AiAnalyzer } = require(path.join(runtime, 'server/src/integrations/aiAnalyzer'));
  const { normalizeAnalysisResult, RISK_POLICY_VERSION } = require(path.join(runtime, 'server/src/services/riskSeverityNormalizer'));
  if (RISK_POLICY_VERSION !== 'verifiable-issue-gates-v8') throw Error('v8 release required');
  const repo = new Repository({ ...process.env, DB_POOL_SIZE: '3' });
  const ai = new AiAnalyzer(process.env);
  ai.timeoutMs = Math.max(ai.timeoutMs, 120000);
  for (const p of Object.values(ai.profiles)) { p.batchSize = Math.min(p.batchSize, 5); p.maxOutputTokens = Math.max(p.maxOutputTokens, 12000); p.maxChars = 12000; }
  try { await run({ repo, ai, normalizeAnalysisResult, policyVersion: RISK_POLICY_VERSION, output: path.resolve(options.output), apply: options.apply === true }); }
  finally { await repo.pool.end(); }
}
if (require.main === module) main().catch(e => { console.error(JSON.stringify({ error: e.code || e.message })); process.exitCode = 1; });
module.exports = { run, main, SCOPE, SQL, PARAMS, policyOf, itemOf };
