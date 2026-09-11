const { randomUUID } = require('node:crypto');

const { createSchedulerRepositoryAdapter } = require('./schedulerRepositoryAdapter');
const { scheduleSources } = require('./sourceScheduler');

function sanitizeDatabaseError(error) {
  const rawCode = typeof error?.code === 'string' ? error.code : '';
  const errorCode = /^[A-Z0-9_]{1,80}$/.test(rawCode) ? rawCode : 'DATABASE_ERROR';
  const rawMessage = error?.sqlMessage || error?.message || 'Database operation failed';
  const errorMessage = String(rawMessage)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, '[REDACTED_CONNECTION]')
    .replace(/Access denied for user\s+'[^']+'@'[^']+'/gi, "Access denied for user '[REDACTED_USER]'@'[REDACTED_HOST]'")
    .replace(/Unknown database\s+'[^']+'/gi, "Unknown database '[REDACTED_DATABASE]'")
    .replace(/\b((?:connect|getaddrinfo|read)\s+(?:ECONNREFUSED|ENOTFOUND|ETIMEDOUT)\s+)[^\s,;]+/gi, '$1[REDACTED_HOST]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, '[REDACTED_HOST]')
    .replace(/\b(password|passwd|pwd|token|secret|authorization)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]')
    .replace(/\b(host|hostname|user|username|database)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1=[REDACTED]')
    .trim()
    .slice(0, 512);
  return { errorCode, errorMessage };
}

function createSourceSchedulerRuntime({
  connection,
  workerId,
  leaseDurationMs = 5 * 60 * 1000,
  idFactory = randomUUID
} = {}) {
  if (!connection || typeof connection.query !== 'function') throw new TypeError('connection.query is required');
  if (typeof workerId !== 'string' || !workerId.trim()) throw new TypeError('workerId is required');
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) throw new TypeError('leaseDurationMs must be positive');
  if (typeof idFactory !== 'function') throw new TypeError('idFactory must be a function');

  const repository = createSchedulerRepositoryAdapter(connection);

  async function run(options = {}) {
    const { now, existingEvidence = [] } = options;
    const attempts = new Map();
    const leaseUntil = new Date(now.getTime() + leaseDurationMs);

    const leaseAdapter = {
      async acquire(intent) {
        const runId = idFactory();
        const attempt = { runId, leaseEpoch: null };
        attempts.set(intent.sourceId, attempt);
        const lease = await repository.acquireLease({
          sourceId: intent.sourceId,
          runId,
          ownerId: workerId,
          now,
          leaseUntil
        });
        if (lease?.leaseToken) attempt.leaseEpoch = lease.leaseToken.epoch;
        return lease;
      },

      async release(_intent, lease) {
        if (!lease?.leaseToken) return { released: false };
        return repository.releaseLease({ ...lease.leaseToken, now });
      }
    };

    const scheduled = await scheduleSources({
      ...options,
      now,
      existingEvidence,
      leaseAdapter,
      async enqueue(intent) {
        try {
          return await repository.enqueueScheduled({
            ...intent,
            runId: intent.leaseToken?.runId
          });
        } catch (error) {
          const attempt = attempts.get(intent.sourceId);
          if (attempt) attempt.databaseError = sanitizeDatabaseError(error);
          throw error;
        }
      }
    });

    const decisions = scheduled.decisions.map(decision => {
      const attempt = attempts.get(decision.sourceId);
      const databaseError = decision.reasonCode === 'ENQUEUE_FAILED' ? attempt?.databaseError : null;
      return {
        ...decision,
        ...(databaseError || {}),
        runId: decision.runId || decision.existingRunId || attempt?.runId || null,
        leaseEpoch: decision.leaseToken?.epoch ?? attempt?.leaseEpoch ?? null
      };
    });

    return { decisions, evidence: [...existingEvidence, ...decisions] };
  }

  return { run };
}

module.exports = { createSourceSchedulerRuntime };
