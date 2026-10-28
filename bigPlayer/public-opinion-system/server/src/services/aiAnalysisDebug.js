'use strict';
const crypto = require('node:crypto');
const { normalizePolicy } = require('./aiAnalysisPolicy');
const { commentContext } = require('./commentAnalysisContext');
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
class AiAnalysisDebug {
  constructor({ ai, now = Date.now } = {}) { this.ai = ai; this.now = now; this.jobs = new Map(); }
  start({ owner, communityId, context = {}, policy, items }) {
    policy = normalizePolicy(policy, { strict: true });
    if (!Array.isArray(items) || !items.length || items.length > 25) fail('INVALID_INPUT', '每次测试1至25条文本');
    const normalized = items.map((item, index) => {
      if (!item || !['post', 'comment'].includes(item.contentType) || typeof item.body !== 'string' || !item.body.trim() || item.body.length > 2000 || (item.title != null && (typeof item.title !== 'string' || item.title.length > 200))) fail('INVALID_INPUT', `第${index + 1}条文本无效（正文最多2000字，标题最多200字）`);
      if (item.originalPost != null && (typeof item.originalPost !== 'object' || Array.isArray(item.originalPost) || typeof item.originalPost.body !== 'string' || item.originalPost.body.length > 4000 || (item.originalPost.title != null && (typeof item.originalPost.title !== 'string' || item.originalPost.title.length > 200)))) fail('INVALID_INPUT', `第${index + 1}条原帖无效`);
      const analysisContext = commentContext({ contentType: item.contentType, analysisContext: item.originalPost ? { root: { id: 'debug-original', title: item.originalPost.title || '', body: item.originalPost.body } } : null });
      return { contentType: item.contentType, title: item.contentType === 'post' ? item.title || '' : '', body: item.body.trim(), ...context, analysisContext, analysisPolicy: policy };
    });
    if (!this.ai?.singlePass || !this.ai.configured('light')) fail('TYPESAFE_NOT_CONFIGURED', '当前TypeSafe服务尚未配置');
    for (const [id, job] of this.jobs) if (job.expiresAt <= this.now() && job.status !== 'running') this.jobs.delete(id);
    const running = [...this.jobs.values()].filter(job => job.status === 'running');
    if (running.some(job => job.owner === owner) || running.length >= 2 || this.jobs.size >= 100) fail('DEBUG_BUSY', '已有调试任务运行，请稍后重试');
    const job = { id: crypto.randomUUID(), owner, communityId, status: 'running', total: normalized.length, completed: 0, results: [], expiresAt: this.now() + 10 * 60 * 1000 };
    this.jobs.set(job.id, job);
    // Process small batches so the UI can show progress and a 25-item debug
    // request never holds the HTTP connection open during model calls.
    job.promise = (async () => {
      for (let offset = 0; offset < normalized.length; offset += 5) {
        const batch = normalized.slice(offset, offset + 5);
        try {
          const results = await this.ai.analyzeBatch(batch, 'light', { settleErrors: true });
          if (!Array.isArray(results) || results.length !== batch.length) throw Error('invalid model batch');
          results.forEach((result, index) => {
            const input = batch[index], decision = result.rawAnalysis?.policyOriginalDecision || result.typeSafeDecision;
            job.results.push({ index: offset + index + 1, contentType: input.contentType, title: input.title, body: input.body,
              ...(result.analysisError ? { error: result.analysisError.code || 'ANALYSIS_FAILED' } : {
                level: decision?.final_level || '未知', finalLevel: result.typeSafeDecision?.final_level || '未知', sentiment: result.sentiment,
                intensity: policy.levels[decision?.final_level]?.intensity || '', filtered: result.rawAnalysis?.analysisPolicy?.filtered === true,
                reason: result.analysisReason || result.reason || '', sentimentReason: result.rawAnalysis?.sentimentReason || '', contextStatus: result.rawAnalysis?.urgentReview?.contextStatus || null, reviewModel: result.rawAnalysis?.urgentReview?.model || null, confidence: result.confidence, topics: result.topics || [], qualityScore: result.qualityScore,
                qualityEligibility: result.rawAnalysis?.qualityEligibility || null,
                recommendHome: result.recommendHome === true, recommendPin: result.recommendPin === true, recommendFeature: result.recommendFeature === true
              }) });
          });
        } catch (error) {
          batch.forEach((input, index) => job.results.push({ index: offset + index + 1, contentType: input.contentType, title: input.title, body: input.body, error: error.code || 'ANALYSIS_FAILED' }));
        }
        job.completed = job.results.length;
      }
      job.status = 'completed'; job.expiresAt = this.now() + 10 * 60 * 1000;
    })();
    return this.get(job.id, owner, communityId);
  }
  get(id, owner, communityId) {
    const job = this.jobs.get(id);
    if (!job || job.owner !== owner || job.communityId !== communityId || (job.status !== 'running' && job.expiresAt <= this.now())) fail('NOT_FOUND', '调试任务不存在或已过期，请重新测试');
    return { id: job.id, status: job.status, total: job.total, completed: job.completed, results: job.results.map(row => ({ ...row })) };
  }
}
module.exports = { AiAnalysisDebug };
