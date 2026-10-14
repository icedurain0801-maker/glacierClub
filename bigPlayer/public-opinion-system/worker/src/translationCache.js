const crypto = require('node:crypto');

class TranslationCache {
  constructor({ limit = 1000 } = {}) {
    this.limit = limit;
    this.completed = new Map();
    this.inflight = new Map();
  }
  key(translator, job) {
    // Use the exact normalized prompt. Keep tenant/source and model/version boundaries.
    return crypto.createHash('sha256').update(JSON.stringify([
      job.community_id, job.source_id, job.target_language, job.translation_version,
      translator.model, translator.api, translator.buildMessages(job)
    ])).digest('hex');
  }
  reused(value) {
    return { ...value, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, reused: true };
  }
  async translate(translator, job) {
    const key = this.key(translator, job);
    if (this.completed.has(key)) {
      const value = this.completed.get(key);
      this.completed.delete(key); this.completed.set(key, value);
      return this.reused(value);
    }
    if (this.inflight.has(key)) return this.reused(await this.inflight.get(key));
    const promise = translator.translate(job);
    this.inflight.set(key, promise);
    try {
      const value = await promise;
      this.completed.set(key, value);
      while (this.completed.size > this.limit) this.completed.delete(this.completed.keys().next().value);
      return value;
    } finally { this.inflight.delete(key); }
  }
}

module.exports = { TranslationCache };
