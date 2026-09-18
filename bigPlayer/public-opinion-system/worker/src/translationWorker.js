const { loadRuntimeEnv } = require('../../server/src/runtimeEnv');
loadRuntimeEnv();

const crypto = require('node:crypto');
const { Repository } = require('../../server/src/db/repository');
const { AiTranslator } = require('../../server/src/integrations/aiTranslator');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const errorCode = error => error?.code || String(error?.message || 'AI_TRANSLATION_FAILED').replace(/\s+/g, '_').slice(0, 120);
const retryAt = (attempts, baseSeconds) => new Date(Date.now() + Math.max(1, baseSeconds) * 1000 * (2 ** Math.max(0, attempts - 1)));

function buildDeps(env = process.env) {
  const repo = new Repository();
  return { repo, translator: new AiTranslator(env, { reserveCall: limit => repo.reserveTranslationCall(limit) }), version: env.AI_TRANSLATION_VERSION || 'translation-v1', batchSize: Number(env.AI_TRANSLATION_JOB_BATCH_SIZE || 20), backfillBatchSize: Number(env.AI_TRANSLATION_BACKFILL_BATCH_SIZE || 100), maxAttempts: Number(env.AI_TRANSLATION_JOB_MAX_ATTEMPTS || 3), retryBaseSeconds: Number(env.AI_TRANSLATION_JOB_RETRY_BASE_SECONDS || 60), leaseOwner: `translation-${process.pid}-${crypto.randomUUID()}` };
}

async function processJob(deps, job) {
  try {
    const translation = await deps.translator.translate(job);
    const completed = await deps.repo.completeTranslationJob(job.id, { leaseOwner: job.lease_owner, translation: { ...translation, targetLanguage: job.target_language, translationVersion: job.translation_version, contentFingerprint: job.content_fingerprint } });
    return completed ? 'completed' : 'leaseLost';
  } catch (error) {
    const quotaReached = error?.code === 'AI_TRANSLATION_DAILY_LIMIT_REACHED';
    const terminal = !quotaReached && (Boolean(error?.noRetry) || Number(job.attempts || 0) >= deps.maxAttempts);
    const tomorrow = new Date(); tomorrow.setUTCHours(24, 0, 0, 0);
    const finished = await deps.repo.finishTranslationJob(job.id, { leaseOwner: job.lease_owner, status: terminal ? 'failed' : 'retryable', errorCode: errorCode(error), errorMessage: error?.message, retryAt: quotaReached ? tomorrow : terminal ? null : retryAt(job.attempts, deps.retryBaseSeconds), ...(quotaReached ? { decrementAttempts: true } : {}) });
    return finished ? (terminal ? 'failed' : 'retryable') : 'leaseLost';
  }
}

function normalizeControlledAllowlist(options = {}) {
  const rawJobId = options.jobId ?? options.job_id;
  const jobId = rawJobId == null ? null : String(rawJobId).trim();
  const rawContentIds = options.contentIds ?? options.content_ids;
  const contentIds = Array.isArray(rawContentIds)
    ? [...new Set(rawContentIds.map(value => String(value || '').trim()).filter(Boolean))]
    : [];
  if (!jobId && !contentIds.length) {
    const error = new Error('controlled translation run requires a non-empty jobId or contentIds');
    error.code = 'INVALID_INPUT';
    throw error;
  }
  return { jobId, contentIds };
}

async function runOnce(deps = buildDeps(), options = {}) {
  const controlled = options && (options.jobId != null || options.job_id != null || options.contentIds != null || options.content_ids != null);
  const allowlist = controlled ? normalizeControlledAllowlist(options) : null;
  if (!deps.translator.configured()) return { skipped: true, reason: 'AI_TRANSLATION_NOT_CONFIGURED' };
  if (typeof deps.repo.translationCallBudget === 'function' && await deps.repo.translationCallBudget() >= deps.translator.dailyCallLimit) return { skipped: true, reason: 'AI_TRANSLATION_DAILY_LIMIT_REACHED' };
  if (controlled) {
    // A job id cannot be used by the backfill query, so omit backfill unless
    // explicit content ids are supplied. This keeps a job-only run scoped.
    if (allowlist.contentIds.length) {
      await deps.repo.enqueueMissingTranslations({ targetLanguage: 'zh-CN', version: deps.version, limit: allowlist.contentIds.length, contentIds: allowlist.contentIds });
    }
  } else {
    await deps.repo.enqueueMissingTranslations({ targetLanguage: 'zh-CN', version: deps.version, limit: deps.backfillBatchSize });
  }
  const claimInput = { targetLanguage: 'zh-CN', version: deps.version, leaseOwner: deps.leaseOwner, limit: controlled ? Math.max(1, allowlist.contentIds.length || 1) : deps.batchSize };
  if (controlled) {
    if (allowlist.jobId) claimInput.jobIds = [allowlist.jobId];
    if (allowlist.contentIds.length) claimInput.contentIds = allowlist.contentIds;
  }
  const jobs = await deps.repo.claimTranslationJobs(claimInput);
  const result = { completed: 0, retryable: 0, failed: 0, leaseLost: 0 };
  for (const job of jobs) result[await processJob(deps, job)] += 1;
  return result;
}

async function runControlled(deps = buildDeps(), options = {}) {
  normalizeControlledAllowlist(options);
  return runOnce(deps, options);
}

async function runLoop(deps = buildDeps(), { sleepFn = sleep } = {}) {
  const idleMs = Math.max(1000, Number(process.env.AI_TRANSLATION_WORKER_IDLE_MS || 5000));
  console.log(JSON.stringify({ task: 'translation-worker', phase: 'configured', dailyCallLimit: deps.translator.dailyCallLimit, batchSize: deps.batchSize, budgetTimezone: 'UTC', pid: process.pid }));
  const priorityJobId = String(process.env.TRANSLATION_PRIORITY_JOB_ID || '').trim();
  let priorityActive = Boolean(priorityJobId);
  for (;;) {
    const result = priorityActive ? await runControlled(deps, { jobId: priorityJobId }) : await runOnce(deps);
    if (priorityActive) {
      const job = await deps.repo.getTranslationJob(priorityJobId);
      if (!job) throw Object.assign(new Error('priority translation job not found'), { code: 'TRANSLATION_PRIORITY_NOT_FOUND' });
      if (['completed', 'failed'].includes(job.status)) priorityActive = false;
      console.log(JSON.stringify({ task: 'translation-worker', phase: 'priority', jobId: priorityJobId, status: job.status, ...result }));
      await sleepFn(idleMs);
      continue;
    }
    if (result.skipped) { console.error('[translation-worker]', result.reason); await sleepFn(idleMs); continue; }
    console.log('[translation-worker]', JSON.stringify(result));
    await sleepFn(result.completed || result.retryable || result.failed || result.leaseLost ? 100 : idleMs);
  }
}

if (require.main === module) runLoop().catch(error => { console.error('[translation-worker]', errorCode(error)); process.exit(1); });

module.exports = { buildDeps, processJob, runOnce, runControlled, normalizeControlledAllowlist, runLoop, retryAt, errorCode };
