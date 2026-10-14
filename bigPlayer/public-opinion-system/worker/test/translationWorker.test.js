const test = require('node:test');
test('daily budget exhaustion remains retryable beyond the error attempt ceiling', async () => {
  const { processJob } = require('../src/translationWorker');
  let patch;
  const outcome = await processJob({ translator: { async translate() { throw Object.assign(new Error('budget'), { code: 'AI_TRANSLATION_DAILY_LIMIT_REACHED' }); } }, repo: { async finishTranslationJob(id, value) { patch = value; return true; } }, maxAttempts: 3 }, { id: 'budget-job', lease_owner: 'owner', attempts: 9 });
  require('node:assert/strict').equal(outcome, 'retryable');
  require('node:assert/strict').equal(patch.retryAt.getUTCHours(), 0);
  require('node:assert/strict').equal(patch.decrementAttempts, true);
});
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildDeps, processJob, runOnce, runControlled, normalizeControlledAllowlist } = require('../src/translationWorker');
const workerPackage = require('../package.json');

test('offline priority state machine never enters bulk until the next terminal iteration', async () => {
  const { runLoop } = require('../src/translationWorker');
  const previous = process.env.TRANSLATION_PRIORITY_JOB_ID;
  process.env.TRANSLATION_PRIORITY_JOB_ID = 'priority-test';
  try {
    for (const status of ['retryable', 'completed', 'failed']) {
      const claims = []; let sleeps = 0; let backfills = 0;
      await assert.rejects(runLoop({ translator: { configured() { return true; }, dailyCallLimit: 5000 }, version: 'v1', batchSize: 1, backfillBatchSize: 1, repo: {
        async enqueueMissingTranslations() { backfills += 1; },
        async claimTranslationJobs(input) { claims.push(input); return []; },
        async getTranslationJob() { return { status }; }
      } }, { sleepFn: async () => { if (++sleeps === 2) throw Object.assign(new Error('test stop'), { code: 'TEST_STOP' }); } }), { code: 'TEST_STOP' });
      assert.deepEqual(claims[0].jobIds, ['priority-test']);
      if (status === 'retryable') { assert.deepEqual(claims[1].jobIds, ['priority-test']); assert.equal(backfills, 0); }
      else { assert.equal(claims[1].jobIds, undefined); assert.equal(backfills, 1); }
    }
  } finally {
    if (previous === undefined) delete process.env.TRANSLATION_PRIORITY_JOB_ID;
    else process.env.TRANSLATION_PRIORITY_JOB_ID = previous;
  }
});

const job = { id: 'j1', content_id: 'c1', target_language: 'zh-CN', translation_version: 'translation-v1', content_fingerprint: 'fp1', lease_owner: 'lease-1', attempts: 1, title: 'Hello', body: 'World' };

test('翻译成功时写入译文并完成任务', async () => {
  const calls = [];
  const result = await processJob({
    translator: { async translate() { return { translatedTitle: '你好', translatedBody: '世界', sourceLanguage: 'en', modelName: 'model', usage: {} }; } },
    repo: { async completeTranslationJob(...args) { calls.push(['complete', ...args]); return true; } },
    maxAttempts: 3, retryBaseSeconds: 60
  }, job);
  assert.equal(result, 'completed');
  assert.equal(calls[0][1], 'j1');
  assert.equal(calls[0][2].leaseOwner, 'lease-1');
  assert.deepEqual(calls[0][2].translation, {
    translatedTitle: '你好', translatedBody: '世界', sourceLanguage: 'en', modelName: 'model', usage: {},
    targetLanguage: 'zh-CN', translationVersion: 'translation-v1', contentFingerprint: 'fp1'
  });
});

test('临时翻译失败进入退避重试', async () => {
  let finished;
  const result = await processJob({
    translator: { async translate() { const error = new Error('timeout'); error.code = 'AI_TRANSLATION_TIMEOUT'; throw error; } },
    repo: { async finishTranslationJob(id, patch) { finished = { id, ...patch }; return true; } }, maxAttempts: 3, retryBaseSeconds: 60
  }, job);
  assert.equal(result, 'retryable');
  assert.equal(finished.status, 'retryable');
  assert.equal(finished.errorCode, 'AI_TRANSLATION_TIMEOUT');
  assert.equal(finished.leaseOwner, 'lease-1');
  assert.ok(finished.retryAt instanceof Date);
});

test('达到最大尝试次数后任务终止且不再安排重试', async () => {
  let finished;
  const result = await processJob({
    translator: { async translate() { const error = new Error('timeout'); error.code = 'AI_TRANSLATION_TIMEOUT'; throw error; } },
    repo: { async finishTranslationJob(id, patch) { finished = { id, ...patch }; return true; } }, maxAttempts: 3, retryBaseSeconds: 60
  }, { ...job, attempts: 3, lease_owner: 'lease-final' });
  assert.equal(result, 'failed');
  assert.deepEqual(finished, {
    id: 'j1', leaseOwner: 'lease-final', status: 'failed', errorCode: 'AI_TRANSLATION_TIMEOUT', errorMessage: 'timeout', retryAt: null
  });
});

test('不可重试失败直接终止任务', async () => {
  let finished;
  const result = await processJob({
    translator: { async translate() { const error = new Error('bad request'); error.code = 'AI_TRANSLATION_HTTP_400'; error.noRetry = true; throw error; } },
    repo: { async finishTranslationJob(id, patch) { finished = { id, ...patch }; return true; } }, maxAttempts: 3, retryBaseSeconds: 60
  }, job);
  assert.equal(result, 'failed');
  assert.equal(finished.status, 'failed');
});

test('成功落库时若租约已丢失则不报告 completed', async () => {
  const result = await processJob({
    translator: { async translate() { return { translatedBody: '旧译文', usage: {} }; } },
    repo: { async completeTranslationJob() { return false; } },
    maxAttempts: 3, retryBaseSeconds: 60
  }, job);
  assert.equal(result, 'leaseLost');
});

test('失败回写时若租约已丢失则不报告 retryable', async () => {
  const result = await processJob({
    translator: { async translate() { throw new Error('temporary failure'); } },
    repo: { async finishTranslationJob() { return false; } },
    maxAttempts: 3, retryBaseSeconds: 60
  }, job);
  assert.equal(result, 'leaseLost');
});

test('未配置翻译服务时不领取积压任务', async () => {
  const calls = { backfill: 0, claim: 0, translate: 0 };
  const result = await runOnce({
    translator: { configured() { return false; }, async translate() { calls.translate += 1; } },
    repo: {
      async enqueueMissingTranslations() { calls.backfill += 1; },
      async claimTranslationJobs() { calls.claim += 1; return []; }
    }
  });
  assert.deepEqual(result, { skipped: true, reason: 'AI_TRANSLATION_NOT_CONFIGURED' });
  assert.deepEqual(calls, { backfill: 0, claim: 0, translate: 0 });
});

test('每轮先补偿积压任务再领取并处理', async () => {
  const calls = [];
  const result = await runOnce({
    translator: { configured() { return true; }, async translate() { return { translatedBody: '世界', usage: {} }; } },
    repo: {
      async enqueueMissingTranslations(input) { calls.push(['backfill', input]); },
      async claimTranslationJobs(input) { calls.push(['claim', input]); return [job]; },
      async completeTranslationJob() { return true; }, async finishTranslationJob() { return true; }
    }, version: 'translation-v1', batchSize: 20, backfillBatchSize: 100, maxAttempts: 3, retryBaseSeconds: 60, leaseOwner: 'worker-1'
  });
  assert.deepEqual(result, { completed: 1, retryable: 0, failed: 0, leaseLost: 0 });
  assert.deepEqual(calls[0], ['backfill', { targetLanguage: 'zh-CN', version: 'translation-v1', limit: 100 }]);
  assert.deepEqual(calls[1], ['claim', { targetLanguage: 'zh-CN', version: 'translation-v1', leaseOwner: 'worker-1', limit: 20 }]);
});

test('受控入口必须提供非空 jobId 或 contentIds', async () => {
  assert.throws(() => normalizeControlledAllowlist({}), error => error.code === 'INVALID_INPUT');
  assert.throws(() => normalizeControlledAllowlist({ jobId: '  ', contentIds: [] }), error => error.code === 'INVALID_INPUT');
  assert.deepEqual(normalizeControlledAllowlist({ jobId: ' j1 ', contentIds: [' c1 ', 'c1', ''] }), { jobId: 'j1', contentIds: ['c1'] });
  await assert.rejects(() => runControlled({ translator: { configured() { return true; } }, repo: {} }, {}), error => error.code === 'INVALID_INPUT');
});

test('受控 contentIds 只补入并领取 allowlist 内容', async () => {
  const calls = [];
  const result = await runControlled({
    translator: { configured() { return true; }, async translate() { return { translatedBody: '世界', usage: {} }; } },
    repo: {
      async enqueueMissingTranslations(input) { calls.push(['backfill', input]); },
      async claimTranslationJobs(input) { calls.push(['claim', input]); return [job]; },
      async completeTranslationJob() { return true; }, async finishTranslationJob() { return true; }
    }, version: 'translation-v1', batchSize: 20, backfillBatchSize: 100, maxAttempts: 3, retryBaseSeconds: 60, leaseOwner: 'worker-1'
  }, { contentIds: ['c1', ' c1 '] });
  assert.deepEqual(result, { completed: 1, retryable: 0, failed: 0, leaseLost: 0 });
  assert.deepEqual(calls[0], ['backfill', { targetLanguage: 'zh-CN', version: 'translation-v1', limit: 1, contentIds: ['c1'] }]);
  assert.deepEqual(calls[1], ['claim', { targetLanguage: 'zh-CN', version: 'translation-v1', leaseOwner: 'worker-1', limit: 1, contentIds: ['c1'] }]);
});

test('受控 jobId 不触发全队列补入并向领取接口传递 jobIds', async () => {
  const calls = [];
  const result = await runControlled({
    translator: { configured() { return true; }, async translate() { return { translatedBody: '世界', usage: {} }; } },
    repo: {
      async enqueueMissingTranslations() { throw new Error('must not scan backfill'); },
      async claimTranslationJobs(input) { calls.push(input); return [job]; },
      async completeTranslationJob() { return true; }, async finishTranslationJob() { return true; }
    }, version: 'translation-v1', batchSize: 20, maxAttempts: 3, retryBaseSeconds: 60, leaseOwner: 'worker-1'
  }, { jobId: 'j1' });
  assert.equal(result.completed, 1);
  assert.deepEqual(calls[0], { targetLanguage: 'zh-CN', version: 'translation-v1', leaseOwner: 'worker-1', limit: 1, jobIds: ['j1'] });
});

test('worker package 暴露独立翻译工作器入口', () => {
  assert.equal(workerPackage.scripts['start:translation'], 'node src/translationWorker.js');
  const source = fs.readFileSync(path.resolve(__dirname, '../src/translationWorker.js'), 'utf8');
  assert.match(source, /require\('\.\.\/\.\.\/server\/src\/runtimeEnv'\)/);
  assert.match(source, /loadRuntimeEnv\(\);/);
  assert.ok(source.indexOf('loadRuntimeEnv();') < source.indexOf("require('../../server/src/db/repository')"));
});

test('buildDeps 从独立环境变量读取回填批量', async () => {
  const deps = buildDeps({ AI_TRANSLATION_BACKFILL_BATCH_SIZE: '37', AI_TRANSLATION_JOB_BATCH_SIZE: '11' });
  try {
    assert.equal(deps.backfillBatchSize, 37);
    assert.equal(deps.batchSize, 11);
  } finally {
    await deps.repo.pool.end();
  }
});
