const test = require('node:test');
const assert = require('node:assert/strict');

const { activeCount, analyzeWindow, enqueueWindow, enqueueOnlyDeps, runAnalysisPump, preflightSources, runDaily } = require('../src/dailyRunner');

const window = {
  publishedFrom: new Date('2026-08-10T16:00:00.000Z'),
  publishedTo: new Date('2026-08-11T16:00:00.000Z')
};

function ai() {
  return {
    configured() { return true; },
    profiles: { light: { version: 'sentiment-v1', model: 'light' }, deep: { version: 'sentiment-v1', model: 'deep' } },
    selectProfile(profile) { return { name: profile, ...this.profiles[profile] }; },
    async analyzeBatch(items) { return items.map(() => ({ sentiment: 'neutral', severity: 'normal', confidence: 1, needsDeep: false })); }
  };
}

function dailyDeps(overrides = {}) {
  const source = { id: 'source-1', game_id: 'game-1', platform: 'test' };
  const state = { status: 'completed', jobs: [], claims: [], enqueues: [], released: [] };
  const repo = {
    async health() {},
    async acquireAdvisoryLock() { return true; },
    async releaseAdvisoryLock(name) { state.released.push(name); },
    async listEnabledSources() { return [source]; },
    async getDefaultAccount() { return { id: 'account-1' }; },
    async updateAccount() {},
    async updateSourceAuth() {},
    async createRun() { return { id: 'run-1' }; },
    async insertContent() { return null; },
    async finishRun() {},
    async markSourceRun() {},
    async getLatestSyncRunForSource() { return { status: state.status, discovered_count: 2, stored_count: 2 }; },
    async enqueueMissingAnalysis(input) { state.enqueues.push(input); return 0; },
    async enqueueAnalysisJob() {},
    async countAnalysisJobs(input) {
      const active = state.jobs.filter(job => job.status === 'pending' && job.profile === input.profile).length;
      return active ? { pending: active } : {};
    },
    async claimAnalysisJobs(input) {
      state.claims.push(input);
      const job = state.jobs.find(item => item.status === 'pending' && item.profile === input.profile);
      if (!job) return [];
      job.status = 'running';
      return [{ ...job, content_id: job.content_id || 'content-1', title: 'safe title', body: 'safe body', fingerprint: 'fp', attempts: 1, matched_keywords: '[]', lease_owner: 'daily-test' }];
    },
    async loadKeywordRules() { return []; },
    async getAnalysisCache() { return []; },
    async insertAnalysis() {},
    async upsertAnalysisCache() {},
    async finishAnalysisJob(id) { const job = state.jobs.find(item => item.id === id); if (job) job.status = 'completed'; },
    async countContentsByType() { return { posts: 2 }; }
  };
  const deps = {
    repo, ai: ai(), alertEngine: {}, sourceConcurrency: 1, leaseOwner: 'daily-test',
    connectors: { test: { async installationHealth() { return { installed: true, configured: true }; }, async healthCheck() { return { configured: true }; }, async collect() { return []; }, hasSourceCapability() { return true; } } },
    credentialContext: { async load() { return { token: 'fixture-only' }; } },
    setInterval() { return { unref() {} }; }, clearInterval() {}, emitter() {}
  };
  return { deps: { ...deps, ...overrides, repo: { ...repo, ...(overrides.repo || {}) } }, state, source };
}

test('activeCount only counts lifecycle states that still require work', () => {
  assert.equal(activeCount({ pending: 2, running: 3, retryable: 4, failed: 9, completed: 10 }), 9);
});

test('enqueueWindow respects a bounded batch budget', async () => {
  const calls = [];
  const deps = { ai: ai(), dailyAnalysisMaxBatches: 2, repo: { async enqueueMissingAnalysis(input) { calls.push(input); return 500; } } };
  assert.equal(await enqueueWindow(deps, window), 1000);
  assert.equal(calls.length, 2);
});

test('enqueueWindow drains all missing yesterday jobs without force', async () => {
  const calls = [];
  const batches = [500, 500, 12];
  const deps = {
    ai: ai(),
    repo: { async enqueueMissingAnalysis(input) { calls.push(input); return batches.shift(); } }
  };
  assert.equal(await enqueueWindow(deps, window), 1012);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.force === false && call.limit === 500));
  assert.ok(calls.every(call => call.publishedFrom === window.publishedFrom && call.publishedTo === window.publishedTo));
});

test('collection deps enqueue analysis without claiming and forces the daily scope', async () => {
  const calls = [];
  const deps = { repo: { async enqueueMissingAnalysis(input) { calls.push(input); return 1; }, async claimAnalysisJobs() { throw new Error('must not claim'); } } };
  const scoped = enqueueOnlyDeps(deps, window);
  assert.deepEqual(await scoped.repo.claimAnalysisJobs({}), []);
  await scoped.repo.enqueueMissingAnalysis({ profile: 'light', force: true });
  assert.equal(calls[0].force, false);
  assert.equal(calls[0].publishedFrom, window.publishedFrom);
  assert.equal(calls[0].publishedTo, window.publishedTo);
});

test('analysis pump stops new claims but lets the current call finish', async () => {
  const claims = []; let release; let active = true;
  const repo = {
    async enqueueMissingAnalysis() { return 0; },
    async enqueueAnalysisJob() {},
    async countAnalysisJobs() { return active ? { pending: 1 } : {}; },
    async claimAnalysisJobs(input) { claims.push(input); await new Promise(resolve => { release = resolve; }); active = false; return []; },
    async loadKeywordRules() { return []; },
    async finishAnalysisJob() {}
  };
  const pump = await runAnalysisPump({ repo, ai: ai(), leaseOwner: 'daily', deadlineAt: Date.now() + 3000 }, window, { idleMs: 1 });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  pump.stop(); release();
  const result = await pump.done;
  assert.equal(result.stopped, true);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].publishedFrom, window.publishedFrom);
  assert.equal(claims[0].publishedTo, window.publishedTo);
});
test('analyzeWindow stops at its deadline without claiming outside scope', async () => {
  const deps = { deadlineAt: Date.now() - 1, ai: ai(), repo: { async enqueueMissingAnalysis() { throw new Error('must not enqueue'); } } };
  await assert.rejects(() => analyzeWindow(deps, window, { timeoutMs: 1000 }), error => error.code === 'DAILY_RUN_TIMEOUT');
});


test('analyzeWindow passes yesterday bounds to every claim and never consumes outside backlog', async () => {
  const claims = [];
  const finishes = [];
  let cycle = 0;
  let claimed = false;
  const repo = {
    async enqueueMissingAnalysis() { return 0; },
    async enqueueAnalysisJob() {},
    async countAnalysisJobs({ profile }) {
      if (profile === 'deep') cycle += 1;
      if (cycle === 0) return profile === 'light' ? { pending: 1 } : {};
      return claimed ? (profile === 'light' ? { completed: 1 } : {}) : (profile === 'light' ? { pending: 1 } : {});
    },
    async claimAnalysisJobs(input) {
      claims.push(input);
      if (input.profile !== 'light' || claimed) return [];
      claimed = true;
      return [{ id: 'yesterday-job', content_id: 'c1', title: '昨日帖子', body: '正文', fingerprint: 'fp', attempts: 1, matched_keywords: '[]', lease_owner: 'scoped-claim' }];
    },
    async loadKeywordRules() { return []; },
    async getAnalysisCache() { return []; },
    async insertAnalysis() {},
    async upsertAnalysisCache() {},
    async finishAnalysisJob(id, input) { finishes.push({ id, input }); }
  };

  const result = await analyzeWindow({ repo, ai: ai(), alertEngine: {}, leaseOwner: 'base-worker' }, window, { timeoutMs: 1000, idleMs: 1 });
  assert.equal(result.analyzed, 1);
  assert.ok(claims.length >= 2);
  assert.ok(claims.every(call => call.publishedFrom === window.publishedFrom && call.publishedTo === window.publishedTo));
  assert.equal(finishes[0].input.leaseOwner, 'scoped-claim');
});

test('runDaily completes collection then drains jobs enqueued at the end within the exact window', async () => {
  const { deps, state } = dailyDeps();
  deps.connectors.test.collect = async () => {
    state.jobs.push({ id: 'late-job', profile: 'light', status: 'pending' });
    return [];
  };

  const result = await runDaily(deps, { now: new Date('2026-08-12T02:00:00.000Z') });

  assert.equal(result.collectionStatus, 'collection_completed');
  assert.equal(result.analysis.analyzed, 1);
  assert.equal(result.analysis.completed, true);
  assert.equal(state.jobs[0].status, 'completed');
  assert.ok(state.claims.length > 0);
  assert.ok(state.claims.every(call => call.publishedFrom.getTime() === window.publishedFrom.getTime() && call.publishedTo.getTime() === window.publishedTo.getTime()));
  assert.ok(state.enqueues.every(call => call.force === false && call.publishedFrom.getTime() === window.publishedFrom.getTime() && call.publishedTo.getTime() === window.publishedTo.getTime()));
});

test('runDaily stops new claims after partial collection and preserves source counts', async () => {
  const { deps, state } = dailyDeps();
  state.status = 'partial';
  deps.connectors.test.collect = async () => {
    state.jobs.push({ id: 'unclaimed-job', profile: 'light', status: 'pending' });
    return [];
  };

  const result = await runDaily(deps, { now: new Date('2026-08-12T02:00:00.000Z') });

  assert.equal(result.collectionStatus, 'collection_failed');
  assert.equal(result.incompleteSources.length, 1);
  assert.equal(result.incompleteSources[0].discovered, 2);
  assert.equal(result.incompleteSources[0].stored, 2);
  assert.equal(result.analysis.stopped, true);
  assert.equal(state.jobs[0].status, 'pending');
});

test('runDaily progress uses approved phases, timing metadata, scoped counts, and redacts content and credentials', async () => {
  const events = [];
  const { deps, state } = dailyDeps({ emitter(payload) { events.push(JSON.parse(payload)); } });
  state.jobs.push({ id: 'job-secret', profile: 'light', status: 'pending', body: 'private content', credential: 'secret-token' });

  await runDaily(deps, { now: new Date('2026-08-12T02:00:00.000Z') });

  assert.deepEqual([...new Set(events.map(event => event.phase))], ['preflight', 'collecting', 'draining_commits', 'draining_analysis', 'completed']);
  for (const event of events) {
    assert.equal(event.businessDate, '2026-08-11');
    assert.equal(typeof event.elapsedMs, 'number');
    assert.ok(event.remainingMs === null || typeof event.remainingMs === 'number');
    const serialized = JSON.stringify(event);
    assert.equal(serialized.includes('private content'), false);
    assert.equal(serialized.includes('secret-token'), false);
    assert.equal(serialized.includes('credential'), false);
    assert.equal(serialized.includes('body'), false);
  }
  assert.deepEqual(events[0].sourceCounts, { ready: 1, skipped: 0, total: 1 });
  assert.deepEqual(events.at(-1).jobCounts, { analyzed: 1, alerted: 0 });
});

test('preflightSources preserves manual verification as a resumable authorization state', async () => {
  const source = { id: 'manual', game_id: 'g1', platform: 'locked' };
  const deps = {
    repo: {
      async listEnabledSources() { return [source]; },
      async getDefaultAccount() { return { id: 'a-manual' }; },
      async updateAccount() {},
      async updateSourceAuth() {}
    },
    connectors: {
      locked: { async installationHealth() { return { installed: false, configured: false, reason: 'CAPTCHA_REQUIRED' }; } }
    },
    credentialContext: { async load() { return {}; } },
    loginSessionClient: {}
  };

  const result = await preflightSources(deps);

  assert.deepEqual(result.ready, []);
  assert.deepEqual(result.skipped, [{
    sourceId: 'manual',
    platform: 'locked',
    status: 'awaiting_manual_verification',
    reason: 'CAPTCHA_REQUIRED'
  }]);
});

test('runDaily does not start collection or claim analysis while manual authorization is unresolved', async () => {
  let collectionCalls = 0;
  const { deps, state } = dailyDeps();
  deps.connectors.test.installationHealth = async () => ({ installed: false, configured: false, reason: 'DEVICE_CONFIRMATION_REQUIRED' });
  deps.connectors.test.collect = async () => { collectionCalls += 1; return []; };

  const result = await runDaily(deps, { now: new Date('2026-08-12T02:00:00.000Z') });

  assert.equal(result.readySources, 0);
  assert.equal(result.skippedSources[0].status, 'awaiting_manual_verification');
  assert.equal(collectionCalls, 0);
  assert.equal(state.claims.length, 0);
  assert.equal(state.enqueues.length, 0);
  assert.equal(result.collectionStatus, 'awaiting_manual_verification');
  assert.equal(result.contents, null);
  assert.equal(result.analysis.skipped, true);
});

test('preflightSources fails closed for missing connector, account, and authorization', async () => {
  const authWrites = [];
  const sources = [
    { id: 'unsupported', game_id: 'g1', platform: 'missing' },
    { id: 'no-account', game_id: 'g1', platform: 'ok' },
    { id: 'unauthorized', game_id: 'g1', platform: 'locked' },
    { id: 'ready', game_id: 'g1', platform: 'ok' }
  ];
  const deps = {
    repo: {
      async listEnabledSources() { return sources; },
      async getDefaultAccount({ sourceId }) { return sourceId === 'no-account' ? null : { id: `a-${sourceId}` }; },
      async updateAccount() {},
      async updateSourceAuth(id, patch) { authWrites.push({ id, patch }); }
    },
    connectors: {
      ok: { async installationHealth() { return { installed: true, configured: true }; }, hasSourceCapability() { return true; } },
      locked: { async installationHealth() { return { installed: false, configured: false, reason: 'credentials required' }; } }
    },
    credentialContext: { async load() { return {}; } },
    loginSessionClient: {}
  };

  const result = await preflightSources(deps);
  assert.deepEqual(result.ready.map(item => item.source.id), ['ready']);
  assert.deepEqual(result.skipped.map(item => item.sourceId), ['unsupported', 'no-account', 'unauthorized']);
  assert.equal(authWrites.at(-1).patch.authStatus, 'authorized');
});
