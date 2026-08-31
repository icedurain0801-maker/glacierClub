const { loadRuntimeEnv } = require('../../server/src/runtimeEnv');
loadRuntimeEnv();

const { Repository } = require('../../server/src/db/repository');
const { AiAnalyzer } = require('../../server/src/integrations/aiAnalyzer');
const { AlertEngine } = require('../../server/src/pipeline/alertEngine');
const { matchRules } = require('../../server/src/pipeline/ruleEngine');
const crypto = require('node:crypto');

const ACTIVE = new Set(['pending', 'running', 'retryable']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const parseJson = value => { if (!value) return []; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch (_) { return []; } };
const errorCode = error => error?.code || 'Q1_ANALYSIS_BATCH_FAILED';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[name] = argv[i + 1]?.startsWith('--') ? true : (argv[i + 1] ?? true);
    if (args[name] !== true) i += 1;
  }
  return args;
}
function requireArg(args, name) { if (!args[name]) throw new Error(`missing --${name}`); return String(args[name]); }
function inWindow(value, from, to) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= new Date(from).getTime() && time < new Date(to).getTime();
}
function shouldDeep(analysis, hit, options = {}) {
  const negativeThreshold = Number(options.negativeThreshold ?? 0.8);
  const confidenceThreshold = Number(options.confidenceThreshold ?? 0.55);
  return Boolean(hit?.needAI || analysis?.needsDeep || analysis?.severity === 'urgent'
    || Number(analysis?.negativeScore) >= negativeThreshold
    || Number(analysis?.confidence) < confidenceThreshold);
}
function cacheKey(ai, job, profile) { return ai.cacheKey(job.content_fingerprint || job.fingerprint, ai.selectProfile(profile), job); }
function normalizeAnalysis(value, profile, fingerprint) {
  const sentiment = ['positive', 'neutral', 'negative'].includes(String(value?.sentiment || '').toLowerCase())
    ? String(value.sentiment).toLowerCase() : 'neutral';
  const severity = ['normal', 'attention', 'urgent'].includes(String(value?.severity || '').toLowerCase())
    ? String(value.severity).toLowerCase() : 'normal';
  const bounded = (input, fallback = 0) => {
    const number = Number(input);
    return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
  };
  return {
    ...value,
    sentiment,
    severity,
    negativeScore: bounded(value?.negativeScore ?? value?.negative_score),
    confidence: bounded(value?.confidence),
    qualityScore: bounded(value?.qualityScore ?? value?.quality_score),
    needsDeep: Boolean(value?.needsDeep ?? value?.needs_deep),
    reason: String(value?.reason || ''),
    topics: Array.isArray(value?.topics) ? value.topics.slice(0, 3).map(String) : [],
    summary: String(value?.summary || ''),
    recommendHome: value?.recommendHome === true || value?.recommend_home === true,
    recommendPin: value?.recommendPin === true || value?.recommend_pin === true,
    recommendFeature: value?.recommendFeature === true || value?.recommend_feature === true,
    qualityReason: String(value?.qualityReason || value?.quality_reason || ''),
    analysisLevel: profile,
    profile,
    analysisVersion: value?.analysisVersion || value?.analysis_version,
    contentFingerprint: fingerprint
  };
}

function qualityOf(analysis) {
  if (!analysis?.recommendHome && !analysis?.recommendPin && !analysis?.recommendFeature) return null;
  return { qualityScore: analysis.qualityScore, recommendHome: analysis.recommendHome, recommendPin: analysis.recommendPin, recommendFeature: analysis.recommendFeature, qualityReason: analysis.qualityReason, analysisVersion: analysis.analysisVersion, modelName: analysis.modelName, contentFingerprint: analysis.contentFingerprint };
}

async function analyzeWithFallback(ai, items, profile) {
  if (!items.length) return [];
  try {
    return await ai.analyzeBatch(items, profile);
  } catch (error) {
    if (!['AI_ANALYSIS_INVALID_RESPONSE', 'AI_ANALYSIS_INCOMPLETE_RESPONSE'].includes(error?.message) || items.length === 1) throw error;
    const middle = Math.ceil(items.length / 2);
    const left = await analyzeWithFallback(ai, items.slice(0, middle), profile);
    const right = await analyzeWithFallback(ai, items.slice(middle), profile);
    return left.concat(right);
  }
}

class Q1AnalysisRunner {
  constructor({ repo = new Repository(), ai = new AiAnalyzer(), alertEngine = new AlertEngine(), sourceId, contentIds = null, publishedFrom, publishedTo, batchSize = 100, parallel = 4, deepBatchSize = 10, deepParallel = 4, maxAttempts = 2, retryBaseMs = 1000, pollMs = 1000, timeoutMs = 2 * 60 * 60 * 1000, deepNegativeThreshold = 0.8, deepConfidenceThreshold = 0.55, log = console.log } = {}) {
    this.repo = repo; this.ai = ai; this.alertEngine = alertEngine; this.sourceId = sourceId; this.contentIds = Array.isArray(contentIds) ? [...new Set(contentIds.map(String).filter(Boolean))] : null; this.publishedFrom = publishedFrom; this.publishedTo = publishedTo; this.batchSize = Math.min(Math.max(Number(batchSize) || 100, 1), 500); this.deepBatchSize = Math.min(Math.max(Number(deepBatchSize) || 10, 1), 100); this.parallel = Math.min(Math.max(Number(parallel) || 4, 1), 16); this.deepParallel = Math.min(Math.max(Number(deepParallel) || 4, 1), 16); this.maxAttempts = Math.max(Number(maxAttempts) || 2, 1); this.retryBaseMs = Math.max(Number(retryBaseMs) || 1000, 100); this.pollMs = Math.max(Number(pollMs) || 1000, 100); this.timeoutMs = Math.max(Number(timeoutMs) || 7200000, 1000); this.deepNegativeThreshold = Number(deepNegativeThreshold); this.deepConfidenceThreshold = Number(deepConfidenceThreshold); this.log = log;
  }
  async enqueueMissing(profile) {
    const spec = this.ai.selectProfile(profile); let total = 0;
    for (;;) {
      const count = await this.repo.enqueueMissingAnalysis({ profile, version: spec.version, sourceId: this.sourceId, contentIds: this.contentIds, publishedFrom: this.publishedFrom, publishedTo: this.publishedTo, limit: 500, force: false });
      total += count; if (count < 500) return total;
    }
  }
  async processBatch(profile) {
    const spec = this.ai.selectProfile(profile);
    const jobs = await this.repo.claimAnalysisJobs({ profile, version: spec.version, leaseOwner: `q1-daily:${process.pid}`, leaseSeconds: 900, limit: profile === 'deep' ? this.deepBatchSize : this.batchSize, sourceId: this.sourceId, contentIds: this.contentIds, publishedFrom: this.publishedFrom, publishedTo: this.publishedTo });
    if (!jobs.length) return 0;
    const keys = jobs.map(job => cacheKey(this.ai, job, profile));
    const cached = new Map((await this.repo.getAnalysisCache(keys)).map(row => [row.cache_key, row]));
    const pending = jobs.filter((job, index) => !cached.has(keys[index]));
    let results = jobs.map((job, index) => cached.get(keys[index]) || null);
    try {
      if (pending.length) {
        const fresh = await analyzeWithFallback(this.ai, pending.map(job => ({ title: job.title, body: job.body, platform: job.platform, fingerprint: job.fingerprint, gameId: job.game_id, gameName: job.game_name, communityId: job.community_id, communityName: job.community_name, regionCode: job.region_code })), profile);
        let cursor = 0; results = results.map(result => result || fresh[cursor++]);
      }
      for (let i = 0; i < jobs.length; i += 1) {
        const job = jobs[i]; const analysis = { ...normalizeAnalysis(results[i], profile, job.content_fingerprint || job.fingerprint), analysisVersion: results[i]?.analysisVersion || spec.version, triggerReason: job.trigger_reason || null, matchedKeywords: parseJson(job.matched_keywords) };
        await this.repo.insertAnalysis(job.content_id, analysis);
        if (!cached.has(keys[i])) await this.repo.upsertAnalysisCache({ ...analysis, cacheKey: keys[i], contentFingerprint: analysis.contentFingerprint, profile, version: analysis.analysisVersion, usage: { inputTokens: analysis.inputTokens, outputTokens: analysis.outputTokens, totalTokens: analysis.totalTokens, estimated: analysis.usageEstimated } });
        if (profile === 'deep') { const quality = qualityOf(analysis); await this.repo.upsertQualityCandidate(job.content_id, { ...(quality || {}), body: job.body, sentiment: analysis.sentiment || '', analysisVersion: analysis.analysisVersion, modelName: analysis.modelName, contentFingerprint: analysis.contentFingerprint }); }
        await this.repo.finishAnalysisJob(job.id, { leaseOwner: job.lease_owner, status: 'completed' });
        if (profile === 'light') {
          const rules = await this.repo.loadKeywordRules(job.game_id, job.platform, job.community_id);
          const hit = matchRules({ title: job.title, body: job.body, authorName: job.author_name }, rules);
          if (shouldDeep(analysis, hit) && this.ai.configured('deep')) await this.repo.enqueueAnalysisJob(job.content_id, { profile: 'deep', version: this.ai.selectProfile('deep').version, contentFingerprint: analysis.contentFingerprint, triggerReason: hit.matchedKeywords?.length ? 'keyword_match' : 'light_escalation', matchedKeywords: hit.matchedKeywords || [] });
          if (hit.needAI && this.alertEngine?.process) await this.alertEngine.process({ game: { id: job.game_id, name: job.game_name, region_code: job.region_code, community_id: job.community_id }, content: { ...job, id: job.content_id }, hit, analysis });
        }
      }
      return jobs.length;
    } catch (error) {
      await Promise.all(jobs.map(job => { const attempts = Number(job.attempts || 1); const status = attempts >= this.maxAttempts ? 'failed' : 'retryable'; const retryAt = status === 'retryable' ? new Date(Date.now() + this.retryBaseMs * 2 ** Math.max(0, attempts - 1)) : null; return this.repo.finishAnalysisJob(job.id, { leaseOwner: job.lease_owner, status, errorCode: errorCode(error), errorMessage: error.message, retryAt }); }));
      this.log(`[q1-analysis] ${profile} batch failed: ${error.message}`);
      return 0;
    }
  }
  async counts(profile) { return this.repo.countAnalysisJobs({ profile, version: this.ai.selectProfile(profile).version, sourceId: this.sourceId, contentIds: this.contentIds, publishedFrom: this.publishedFrom, publishedTo: this.publishedTo }); }
  async run() {
    if (!this.sourceId || !this.publishedFrom || !this.publishedTo) throw new Error('sourceId and published window are required');
    if (!this.ai.configured('light')) throw new Error('AI_ANALYSIS_NOT_CONFIGURED');
    const deadline = Date.now() + this.timeoutMs; const report = { sourceId: this.sourceId, publishedFrom: this.publishedFrom, publishedTo: this.publishedTo, discovered: 0, completed: 0, failed: 0, passes: [] };
    const profiles = ['light'];
    if (this.ai.configured('deep')) profiles.push('deep');
    for (const profile of profiles) {
      const enqueued = await this.enqueueMissing(profile); report.passes.push({ profile, enqueued });
      for (;;) {
        if (Date.now() >= deadline) throw new Error('Q1_ANALYSIS_TIMEOUT');
        const processed = (await Promise.all(Array.from({ length: profile === 'deep' ? this.deepParallel : this.parallel }, () => this.processBatch(profile)))).reduce((sum, count) => sum + count, 0);
        const counts = await this.counts(profile); report.passes[report.passes.length - 1].counts = counts;
        if (!Object.keys(counts).some(status => ACTIVE.has(status))) break;
        if (!processed) await sleep(this.pollMs);
      }
    }
    const scopeClauses = ['c.source_id=?', 'c.is_deleted=0', 'c.published_at>=?', 'c.published_at<?'];
    const scopeParams = [this.sourceId, this.publishedFrom, this.publishedTo];
    if (this.contentIds?.length) {
      scopeClauses.push(`c.id IN (${this.contentIds.map(() => '?').join(',')})`);
      scopeParams.push(...this.contentIds);
    }
    const coverage = await this.repo.query(`SELECT COUNT(*) AS total, SUM(CASE WHEN a.content_id IS NOT NULL THEN 1 ELSE 0 END) AS analyzed FROM po_contents c LEFT JOIN po_analyses a ON a.content_id=c.id AND a.analysis_level='light' WHERE ${scopeClauses.join(' AND ')}`, scopeParams);
    report.total = Number(coverage[0]?.total || 0); report.analyzed = Number(coverage[0]?.analyzed || 0); report.completed = report.analyzed;
    const deepPass = report.passes.find(pass => pass.profile === 'deep');
    report.failed = Number(deepPass?.counts?.failed || 0) + Number(report.passes.find(pass => pass.profile === 'light')?.counts?.failed || 0);
    report.status = report.total === report.analyzed && report.failed === 0 ? 'completed' : 'analysis_incomplete';
    if (report.status !== 'completed') throw new Error(`Q1_ANALYSIS_INCOMPLETE ${report.analyzed}/${report.total}`);
    return report;
  }
}

async function main(argv = process.argv) {
  const args = parseArgs(argv); const runner = new Q1AnalysisRunner({ sourceId: requireArg(args, 'sourceId'), publishedFrom: requireArg(args, 'publishedFrom'), publishedTo: requireArg(args, 'publishedTo'), batchSize: args.batchSize, parallel: args.parallel, timeoutMs: args.timeoutMs, pollMs: args.pollMs });
  const report = await runner.run(); console.log(JSON.stringify(report));
}

if (require.main === module) main().catch(error => { console.error(`[q1-analysis] ${error.message}`); process.exitCode = 1; });
module.exports = { Q1AnalysisRunner, parseArgs, inWindow };
