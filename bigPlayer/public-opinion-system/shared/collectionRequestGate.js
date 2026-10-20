'use strict';
const { createHash } = require('node:crypto');
const { setTimeout: sleep } = require('node:timers/promises');
const { createFairCollectionPool } = require('./fairCollectionPool');
// Per-process transport guard. The scheduler's DB scan lease remains the
// cross-process owner; actual credentials are hashed and never logged.
function createCollectionRequestGate({ concurrency = 3, intervalMs = 500, now = Date.now, wait = sleep } = {}) {
  const pool = createFairCollectionPool(concurrency), next = new Map();
  return fetchImpl => (url, options = {}) => {
    const headers = new Headers(options.headers);
    const key = createHash('sha256').update(`${new URL(url).host}:${headers.get('authorization') || headers.get('cookie') || 'anonymous'}`).digest('hex');
    return pool.submit(key, async () => {
      options.signal?.throwIfAborted();
      const delay = Math.max(0, (next.get(key) || 0) - now());
      if (delay) await wait(delay, undefined, { signal: options.signal });
      options.signal?.throwIfAborted();
      next.set(key, now() + intervalMs);
      const response = await fetchImpl(url, options);
      if (response.status === 429) {
        const raw = response.headers?.get('retry-after');
        const duration = raw && Number.isFinite(Number(raw)) ? Number(raw) * 1000 : Date.parse(raw) - now();
        next.set(key, now() + Math.max(intervalMs, Number.isFinite(duration) ? Math.min(3600000, duration) : 30000));
      }
      return response;
    });
  };
}
const sharedGate = createCollectionRequestGate();
module.exports = { createCollectionRequestGate, sharedGate };
