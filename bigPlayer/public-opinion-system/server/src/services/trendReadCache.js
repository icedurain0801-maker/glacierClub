// Share completed and in-flight trend reads without caching failures.
class TrendReadCache {
  constructor({ ttlMs = 300000, maxEntries = 128, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map();
  }
  async get(key, loader) {
    const existing = this.entries.get(key);
    if (existing && (existing.pending || existing.expiresAt > this.now())) {
      const status = existing.pending ? 'shared' : 'hit';
      return { data: await existing.promise, status };
    }
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const removable = [...this.entries].find(([, entry]) => !entry.pending);
      if (removable) this.entries.delete(removable[0]);
      else return { data: await loader(), status: 'miss' };
    }
    const entry = { pending: true, expiresAt: 0 };
    entry.promise = Promise.resolve().then(loader).then(data => {
      entry.pending = false; entry.expiresAt = this.now() + this.ttlMs;
      return data;
    }).catch(error => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, entry);
    return { data: await entry.promise, status: 'miss' };
  }
}
module.exports = { TrendReadCache };
