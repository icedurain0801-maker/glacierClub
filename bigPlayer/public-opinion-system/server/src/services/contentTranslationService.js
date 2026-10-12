const crypto = require('node:crypto');
const { AiTranslator } = require('../integrations/aiTranslator');

class ContentTranslationService {
  constructor(repo, translator = new AiTranslator(process.env, { reserveCall: limit => repo.reserveTranslationCall(limit) })) {
    this.repo = repo; this.translator = translator; this.inflight = new Map();
  }
  async translate(content) {
    if (content.translation_status === 'completed' && (content.translated_title || content.translated_body)) return { status: 'completed' };
    this.translator.requireConfigured();
    const key = `${content.id}:${content.fingerprint}`;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const promise = this.run(content).finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise); return promise;
  }
  async run(content) {
    const version = process.env.AI_TRANSLATION_VERSION || 'translation-v1';
    const queued = await this.repo.enqueueTranslationJob(content.id, { targetLanguage: 'zh-CN', version, contentFingerprint: content.fingerprint });
    if (!queued) return { status: 'unavailable' };
    const [job] = await this.repo.claimTranslationJobs({ targetLanguage: 'zh-CN', version, jobIds: [queued.id], contentIds: [content.id], leaseOwner: `on-demand-translation:${crypto.randomUUID()}`, limit: 1 });
    if (!job) return { status: queued.status };
    try {
      const translation = await this.translator.translate(job);
      const completed = await this.repo.completeTranslationJob(job.id, { leaseOwner: job.lease_owner, translation: { ...translation, targetLanguage: job.target_language, translationVersion: job.translation_version, contentFingerprint: job.content_fingerprint } });
      return { status: completed ? 'completed' : 'pending' };
    } catch (error) {
      const code = error.code || 'AI_TRANSLATION_FAILED';
      const quota = code === 'AI_TRANSLATION_DAILY_LIMIT_REACHED';
      const tomorrow = new Date(); tomorrow.setUTCHours(24, 0, 0, 0);
      await this.repo.finishTranslationJob(job.id, { leaseOwner: job.lease_owner, status: quota ? 'retryable' : 'failed', errorCode: code, errorMessage: code, retryAt: quota ? tomorrow : null, decrementAttempts: quota });
      return { status: quota ? 'retryable' : 'failed', errorCode: code };
    }
  }
}
module.exports = { ContentTranslationService };
