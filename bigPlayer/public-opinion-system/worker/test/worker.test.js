const test = require('node:test');
const assert = require('node:assert/strict');
const { runSource, runOnce, checkAuthorization, syncStage, createCommitLane, enqueueDailyAnalysis, normalizePlatformItem, processDownstream, processAnalysisBacklog, shouldDeepAnalyze, effectiveAnalysisForAlert, SEVERITY_RANK, buildDeps } = require('../src/worker');
const { BigPlayerH5Connector } = require('../../server/src/connectors/bigPlayerH5Connector');

// 全注入依赖，避免真实 DB/网络。repo 记录关键落库调用。
function makeRepo(over = {}) {
  const state = { runs: [], analyses: [], sourceAuth: [], finished: [], sourceRuns: [] };
  return {
    state,
    async createRun(sourceId) { const run = { id: `run-${state.runs.length}`, sourceId }; state.runs.push(run); return run; },
    async finishRun(id, patch) { state.finished.push({ id, ...patch }); },
    async markSourceRun(sourceId, patch) { state.sourceRuns.push({ sourceId, ...patch }); },
    async updateSourceAuth(id, patch) { state.sourceAuth.push({ id, ...patch }); },
    async insertContent(source, raw) { return over.insertContent ? over.insertContent(raw) : { id: `c-${raw.externalId}` }; },
    async loadKeywordRules() { return over.rules ?? []; },
    async insertAnalysis(cid, a) { state.analyses.push({ cid, ...a }); },
    async countWindowHits() { return over.windowHits ?? 0; }
  };
}
const okConnector = (items) => ({ async healthCheck() { return { platform: 'p', configured: true }; }, async collect() { return items; } });
const unauthConnector = () => ({ async healthCheck() { return { platform: 'p', configured: false, reason: 'credentials required' }; }, async collect() { throw new Error('should not collect'); } });
const raw = (id, title, body) => ({ externalId: id, title, body, authorName: 'u', fingerprint: `fp-${id}`, sourceUrl: `https://x/${id}` });
const source = { id: 's1', account_id: 'a1', game_id: 'g1', community_id: 'c1', region_code: 'domestic', platform: 'bigplayer_h5', display_name: '大玩家', game_name: '冰川游戏', community_name: '国服版' };

test('buildDeps wires the production H5 connector to the auth refresh coordinator', () => {
  const deps = buildDeps();
  assert.ok(deps.authRefreshCoordinator);
  assert.equal(deps.connectors.bigplayer_h5.authRefreshCoordinator, deps.authRefreshCoordinator);
});

test('H5 connector refreshes once after 401, rereads the token, and retries successfully', async () => {
  let token = 'expired-token';
  let refreshes = 0;
  const seenTokens = [];
  const connector = new BigPlayerH5Connector({
    BIGPLAYER_H5_ENABLED: 'true',
    BIGPLAYER_H5_API_BASE_URL: 'https://community.example.com',
    BIGPLAYER_H5_ALLOWED_HOSTS: 'community.example.com'
  }, {
    credentialContext: { async loadApiToken() { return token; } },
    authRefreshCoordinator: { async refresh() { refreshes += 1; token = 'fresh-token'; } },
    fetchImpl: async (_url, options) => {
      seenTokens.push(options.headers.authorization);
      return seenTokens.length === 1
        ? { ok: false, status: 401, url: 'https://community.example.com/posts', headers: { get: () => null } }
        : { ok: true, status: 200, url: 'https://community.example.com/posts', headers: { get: () => null }, json: async () => ({ items: [{ id: 'p1' }], hasMore: false }) };
    }
  });
  const result = await connector.listPosts({ source: { ...source, config: { baseUrl: 'https://community.example.com' } }, account: { id: 'a1' } });
  assert.equal(result.items[0].id, 'p1');
  assert.equal(refreshes, 1);
  assert.deepEqual(seenTokens, ['Bearer expired-token', 'Bearer fresh-token']);
});

test('H5 connector does not refresh a second time after the retry is also 401', async () => {
  let refreshes = 0;
  let token = 'expired-token';
  const seenTokens = [];
  const connector = new BigPlayerH5Connector({
    BIGPLAYER_H5_ENABLED: 'true',
    BIGPLAYER_H5_API_BASE_URL: 'https://community.example.com',
    BIGPLAYER_H5_ALLOWED_HOSTS: 'community.example.com'
  }, {
    credentialContext: { async loadApiToken() { return token; } },
    authRefreshCoordinator: { async refresh() { refreshes += 1; token = 'fresh-token'; } },
    fetchImpl: async (_url, options) => {
      seenTokens.push(options.headers.authorization);
      return { ok: false, status: 401, url: 'https://community.example.com/posts', headers: { get: () => null } };
    }
  });
  await assert.rejects(
    () => connector.listPosts({ source: { ...source, config: { baseUrl: 'https://community.example.com' } }, account: { id: 'a1' } }),
    error => error.code === 'UNAUTHORIZED' || error.cause?.code === 'UNAUTHORIZED'
  );
  assert.equal(refreshes, 1);
  assert.deepEqual(seenTokens, ['Bearer expired-token', 'Bearer fresh-token']);
});

test('shouldDeepAnalyze is pure and combines keyword and light risk signals', () => {
  assert.equal(shouldDeepAnalyze({ severity: 'normal', confidence: 0.99 }, { matchedKeywords: [] }), false);
  assert.equal(shouldDeepAnalyze({ severity: 'normal', confidence: 0.99 }, { needAI: true }), true);
  assert.equal(shouldDeepAnalyze({ severity: 'attention', confidence: 0.5 }), true);
  assert.equal(shouldDeepAnalyze({ severity: 'urgent', confidence: 0.99 }), true);
  assert.equal(shouldDeepAnalyze({ needsDeep: true }), true);
});

test('persistent downstream enqueues every changed item, caches light, escalates selective deep, and alerts matched/unmatched urgent separately', async () => {
  const calls = { enqueue: [], claim: [], finish: [], cache: [], analyses: [], rules: 0, ai: [], ruleAlerts: 0, urgentAlerts: 0 };
  const jobs = {
    light: [
      { id: 'j1', content_id: 'c1', title: '普通', body: '普通', fingerprint: 'fp1', trigger_reason: 'all_content', matched_keywords: '[]', attempts: 1 },
      { id: 'j2', content_id: 'c2', title: '命中', body: '崩溃', fingerprint: 'fp2', trigger_reason: 'keyword_match', matched_keywords: '["闪退组"]', attempts: 1 }
    ],
    deep: []
  };
  const repo = {
    async loadKeywordRules() { calls.rules += 1; return [{ keyword: '崩溃', group_name: '闪退组', severity: 'urgent', trigger_mode: 'immediate', threshold_count: 1 }]; },
    async enqueueAnalysisJob(id, input) { calls.enqueue.push({ id, input }); },
    async claimAnalysisJobs(input) { calls.claim.push(input); return jobs[input.profile].splice(0); },
    async getAnalysisCache() { return []; },
    async insertAnalysis(id, analysis) { calls.analyses.push({ id, analysis }); },
    async upsertAnalysisCache(entry) { calls.cache.push(entry); },
    async finishAnalysisJob(id, input) { calls.finish.push({ id, input }); }
  };
  const ai = { profiles: { light: { version: 'l1', model: 'lm' }, deep: { version: 'd1', model: 'dm' } }, selectProfile(profile) { return { name: profile, ...this.profiles[profile] }; }, async analyzeBatch(items, profile) { calls.ai.push({ profile, items }); return items.map(item => profile === 'light' && item.fingerprint === 'fp1' ? { sentiment: 'neutral', severity: 'urgent', confidence: 0.9, needsDeep: false, reason: '内容使用中性陈述，但风险等级需要继续确认。', matchedKeywords: [], topics: [], summary: 'urgent' } : { sentiment: 'negative', severity: profile === 'light' ? 'attention' : 'urgent', confidence: 0.9, needsDeep: profile === 'light', reason: '内容明确提到崩溃，表达了对游戏稳定性的不满。', matchedKeywords: ['闪退组'], topics: [], summary: '崩溃' }); } };
  const alertEngine = { async process() { calls.ruleAlerts += 1; return [{ reused: false }]; }, async processAiUrgent() { calls.urgentAlerts += 1; return [{ reused: false }]; } };
  const entries = [{ content: { id: 'c1' }, raw: { title: '普通', body: '普通', fingerprint: 'fp1' }, change: 'inserted' }, { content: { id: 'c2' }, raw: { title: '命中', body: '崩溃', fingerprint: 'fp2' }, change: 'changed' }, { content: { id: 'c3', is_deleted: true }, raw: { title: '删除', body: '崩溃', fingerprint: 'fp3' }, change: 'inserted' }];
  const result = await processDownstream({ repo, ai, alertEngine, leaseOwner: 'w1', leaseSeconds: 10 }, source, entries);
  assert.equal(result.analyzed, 2);
  assert.equal(calls.enqueue.length, 4);
  assert.equal(calls.enqueue.filter(call => call.input.profile === 'deep').length, 2);
  assert.equal(calls.urgentAlerts, 0, '升级 deep 的 light 结果不应提前告警');
  assert.equal(calls.ruleAlerts, 0, '升级 deep 的关键词结果应等待最终 deep 结果');
  assert.equal(calls.cache.length, 2);
  assert.equal(calls.finish.length, 2);
  assert.deepEqual(calls.analyses.map(call => call.analysis.triggerReason), ['all_content', 'keyword_match']);
  assert.deepEqual(calls.analyses.map(call => call.analysis.reason), ['内容使用中性陈述，但风险等级需要继续确认。', '内容明确提到崩溃，表达了对游戏稳定性的不满。']);
  assert.deepEqual(calls.enqueue.filter(call => call.input.profile === 'deep').map(call => call.input.triggerReason), ['light_escalation', 'keyword_match']);
  assert.deepEqual(calls.claim.map(call => ({ sourceId: call.sourceId, gameId: call.gameId, communityId: call.communityId })), [
    { sourceId: 's1', gameId: 'g1', communityId: 'c1' },
    { sourceId: 's1', gameId: 'g1', communityId: 'c1' }
  ]);
});

test('effectiveAnalysisForAlert takes highest severity between light and deep', () => {
  const deepNormal = { severity: 'normal', summary: 'deep', analysisLevel: 'deep' };
  const lightUrgent = { severity: 'urgent' };
  const effective = effectiveAnalysisForAlert(deepNormal, lightUrgent);
  assert.equal(effective.severity, 'urgent', 'light urgent should override deep normal');
  assert.equal(effective._lightSeverity, 'urgent');
  assert.equal(effective.summary, 'deep', 'deep detail preserved');
  assert.equal(effective.analysisLevel, 'deep', 'deep level preserved');
});

test('effectiveAnalysisForAlert keeps deep severity when deep is higher or equal', () => {
  assert.equal(effectiveAnalysisForAlert({ severity: 'urgent' }, { severity: 'attention' }).severity, 'urgent');
  assert.equal(effectiveAnalysisForAlert({ severity: 'urgent' }, { severity: 'urgent' }).severity, 'urgent');
  assert.equal(effectiveAnalysisForAlert({ severity: 'attention' }, null).severity, 'attention', 'null light falls back to deep');
  assert.equal(effectiveAnalysisForAlert({ severity: 'normal' }, { severity: 'normal' }).severity, 'normal');
});

test('deep downgrade from light urgent still triggers ai_urgent alert', async () => {
  const calls = { urgentAlerts: 0, getLight: 0 };
  const lightJob = { id: 'jL', content_id: 'cD', game_id: 'g1', community_id: 'c1', title: '抽卡黑幕', body: '千抽无SSR', fingerprint: 'fpD', trigger_reason: 'all_content', matched_keywords: '[]', attempts: 1 };
  const deepJob = { id: 'jD', content_id: 'cD', game_id: 'g1', community_id: 'c1', title: '抽卡黑幕', body: '千抽无SSR', fingerprint: 'fpD', trigger_reason: 'light_escalation', matched_keywords: '[]', attempts: 1 };
  let phase = 'light';
  const repo = {
    async loadKeywordRules() { return []; },
    async enqueueAnalysisJob() {},
    async claimAnalysisJobs({ profile }) {
      if (profile === 'light') { phase = 'light'; return [lightJob]; }
      phase = 'deep'; return [deepJob];
    },
    async getAnalysisCache() { return []; },
    async getLightAnalysis(contentId) { calls.getLight += 1; return { severity: 'urgent', analysis_level: 'light' }; },
    async insertAnalysis() {},
    async upsertAnalysisCache() {},
    async finishAnalysisJob() {}
  };
  const ai = {
    profiles: { light: { version: 'l1', model: 'lm' }, deep: { version: 'd1', model: 'dm' } },
    selectProfile(profile) { return { name: profile, ...this.profiles[profile] }; },
    async analyzeBatch(items, profile) {
      return items.map(() => profile === 'light'
        ? { sentiment: 'negative', severity: 'urgent', confidence: 0.9, needsDeep: true, summary: 'light urgent', reason: '轻分析 urgent' }
        : { sentiment: 'negative', severity: 'normal', confidence: 0.8, needsDeep: false, summary: 'deep normal', reason: '深度分析降级' });
    }
  };
  const alertEngine = {
    async process() { return []; },
    async processAiUrgent({ analysis }) {
      calls.urgentAlerts += 1;
      assert.equal(analysis.severity, 'urgent', 'effective severity should be urgent despite deep downgrade');
      assert.equal(analysis._lightSeverity, 'urgent', 'light severity should be attached');
      return [{ reused: false }];
    }
  };
  const entries = [{ content: { id: 'cD' }, raw: { title: '抽卡黑幕', body: '千抽无SSR', fingerprint: 'fpD' }, change: 'inserted' }];
  const result = await processDownstream({ repo, ai, alertEngine, leaseOwner: 'w1', leaseSeconds: 10 }, source, entries);
  assert.equal(calls.urgentAlerts, 1, 'deep downgrade from light urgent must still trigger ai_urgent alert');
  assert.equal(calls.getLight, 1, 'getLightAnalysis should be called for light_escalation deep job');
});

test('deep without light_escalation trigger does not query light analysis', async () => {
  const calls = { getLight: 0, urgentAlerts: 0 };
  const deepJob = { id: 'jManual', content_id: 'cManual', game_id: 'g1', community_id: 'c1', title: 'x', body: 'x', fingerprint: 'fpM', trigger_reason: 'version_backfill', matched_keywords: '[]', attempts: 1 };
  const repo = {
    async loadKeywordRules() { return []; },
    async enqueueAnalysisJob() {},
    async claimAnalysisJobs({ profile }) { return profile === 'light' ? [] : [deepJob]; },
    async getAnalysisCache() { return []; },
    async getLightAnalysis() { calls.getLight += 1; return null; },
    async insertAnalysis() {},
    async upsertAnalysisCache() {},
    async finishAnalysisJob() {}
  };
  const ai = {
    profiles: { light: { version: 'l1', model: 'lm' }, deep: { version: 'd1', model: 'dm' } },
    selectProfile(profile) { return { name: profile, ...this.profiles[profile] }; },
    async analyzeBatch() { return [{ sentiment: 'negative', severity: 'urgent', confidence: 0.9, needsDeep: false }]; }
  };
  const alertEngine = { async process() { return []; }, async processAiUrgent() { calls.urgentAlerts += 1; return [{ reused: false }]; } };
  await processDownstream({ repo, ai, alertEngine, leaseOwner: 'w1', leaseSeconds: 10 }, source, []);
  assert.equal(calls.getLight, 0, 'non-escalation deep job should not query light analysis');
  assert.equal(calls.urgentAlerts, 1, 'deep urgent without light context should still alert using deep severity');
});

test('cached analysis keeps its model reason without calling AI', async () => {
  const inserted = []; let aiCalls = 0; let lightClaimed = false;
  const repo = {
    async loadKeywordRules() { return []; },
    async enqueueAnalysisJob() {},
    async claimAnalysisJobs({ profile }) {
      if (profile !== 'light' || lightClaimed) return [];
      lightClaimed = true;
      return [{ id: 'j-cache', content_id: 'c-cache', title: '公告', body: '例行更新', fingerprint: 'fp-cache', content_fingerprint: 'fp-cache', trigger_reason: 'all_content', matched_keywords: '[]', attempts: 1 }];
    },
    async getAnalysisCache() { return [{ cache_key: 'cache-key', analysis_profile: 'light', analysis_version: 'l1', sentiment: 'neutral', severity: 'normal', confidence: 0.9, negative_score: 0, needs_deep: 0, reason: '内容仅说明例行更新，没有明显正面或负面表达。', topics: '[]' }]; },
    async insertAnalysis(id, analysis) { inserted.push({ id, analysis }); },
    async finishAnalysisJob() {}
  };
  const ai = {
    profiles: { light: { version: 'l1', model: 'lm' }, deep: { version: 'd1', model: 'dm' } },
    selectProfile(profile) { return { name: profile, ...this.profiles[profile] }; },
    cacheKey() { return 'cache-key'; },
    async analyzeBatch() { aiCalls += 1; return []; }
  };
  await processDownstream({ repo, ai, alertEngine: { async process() { return []; } }, leaseOwner: 'w1' }, source, []);
  assert.equal(aiCalls, 0);
  assert.equal(inserted[0].analysis.reason, '内容仅说明例行更新，没有明显正面或负面表达。');
  assert.equal(inserted[0].analysis.triggerReason, 'all_content');
});

test('quality candidates are created only after deep analysis and include recommendation fields', async () => {
  const candidates = [];
  const jobs = {
    light: [{ id: 'j-light-quality', content_id: 'c-quality', game_id: 'g1', community_id: 'c1', title: '攻略', body: '完整攻略', fingerprint: 'fp-quality', trigger_reason: 'all_content', matched_keywords: '[]', attempts: 1 }],
    deep: [{ id: 'j-deep-quality', content_id: 'c-quality', game_id: 'g1', community_id: 'c1', title: '攻略', body: '完整攻略', fingerprint: 'fp-quality', trigger_reason: 'light_escalation', matched_keywords: '[]', attempts: 1 }]
  };
  const repo = {
    async loadKeywordRules() { return []; },
    async enqueueAnalysisJob() {},
    async claimAnalysisJobs({ profile }) { return jobs[profile].splice(0); },
    async getAnalysisCache() { return []; },
    async getLightAnalysis() { return { severity: 'normal' }; },
    async insertAnalysis() {},
    async upsertAnalysisCache() {},
    async upsertQualityCandidate(contentId, analysis) { candidates.push({ contentId, analysis }); },
    async finishAnalysisJob() {}
  };
  const ai = {
    configured() { return true; },
    profiles: { light: { version: 'l1', model: 'lm' }, deep: { version: 'd1', model: 'dm' } },
    selectProfile(profile) { return { name: profile, ...this.profiles[profile] }; },
    async analyzeBatch(items, profile) {
      return items.map(() => profile === 'light'
        ? { sentiment: 'positive', severity: 'normal', confidence: 0.9, needsDeep: true, qualityScore: 0.7, recommendFeature: true }
        : { sentiment: 'positive', severity: 'normal', confidence: 0.95, needsDeep: false, qualityScore: 0.93, recommendHome: true, recommendPin: false, recommendFeature: true, qualityReason: '内容完整、时效性强且具备长期参考价值。', analysisVersion: 'd1', modelName: 'dm' });
    }
  };
  await processDownstream({ repo, ai, alertEngine: {}, leaseOwner: 'w1' }, source, [{ content: { id: 'c-quality' }, raw: { title: '攻略', body: '完整攻略', fingerprint: 'fp-quality' }, change: 'inserted' }]);
  assert.equal(candidates.length, 1, 'light must not create a quality candidate');
  assert.equal(candidates[0].contentId, 'c-quality');
  assert.deepEqual(candidates[0].analysis, {
    sentiment: 'positive',
    qualityScore: 0.93,
    recommendHome: true,
    recommendPin: false,
    recommendFeature: true,
    qualityReason: '内容完整、时效性强且具备长期参考价值。',
    analysisVersion: 'd1',
    modelName: 'dm',
    contentFingerprint: 'fp-quality'
  });
});

test('cached deep quality analysis creates the same candidate without calling AI', async () => {
  const candidates = []; let aiCalls = 0; let deepClaimed = false;
  const repo = {
    async loadKeywordRules() { return []; },
    async enqueueAnalysisJob() {},
    async claimAnalysisJobs({ profile }) {
      if (profile !== 'deep' || deepClaimed) return [];
      deepClaimed = true;
      return [{ id: 'j-cached-deep', content_id: 'c-cached-deep', game_id: 'g1', community_id: 'c1', title: '攻略', body: '完整攻略', fingerprint: 'fp-cached-deep', content_fingerprint: 'fp-cached-deep', trigger_reason: 'version_backfill', matched_keywords: '[]', attempts: 1 }];
    },
    async getAnalysisCache(keys) { return keys.length ? [{ cache_key: 'deep-cache-key', analysis_profile: 'deep', analysis_version: 'd1', model_name: 'dm', sentiment: 'positive', severity: 'normal', confidence: 0.95, negative_score: 0, needs_deep: 0, topics: '[]', quality_score: 0.88, recommend_home: 0, recommend_pin: 1, recommend_feature: 0, quality_reason: '分区相关性强，适合在栏目内置顶。' }] : []; },
    async insertAnalysis() {},
    async upsertQualityCandidate(contentId, analysis) { candidates.push({ contentId, analysis }); },
    async finishAnalysisJob() {}
  };
  const ai = {
    configured() { return true; },
    profiles: { light: { version: 'l1', model: 'lm' }, deep: { version: 'd1', model: 'dm' } },
    selectProfile(profile) { return { name: profile, ...this.profiles[profile] }; },
    cacheKey() { return 'deep-cache-key'; },
    async analyzeBatch() { aiCalls += 1; return []; }
  };
  await processAnalysisBacklog({ repo, ai, alertEngine: {}, leaseOwner: 'w1' });
  assert.equal(aiCalls, 0);
  assert.deepEqual(candidates, [{ contentId: 'c-cached-deep', analysis: { sentiment: 'positive', qualityScore: 0.88, recommendHome: false, recommendPin: true, recommendFeature: false, qualityReason: '分区相关性强，适合在栏目内置顶。', analysisVersion: 'd1', modelName: 'dm', contentFingerprint: 'fp-cached-deep' } }]);
});

test('persistent analysis failure marks retryable and does not discard existing light analysis', async () => {
  const finished = []; const repo = {
    async loadKeywordRules() { return []; }, async enqueueAnalysisJob() {}, async claimAnalysisJobs() { return [{ id: 'j1', content_id: 'c1', title: 'x', body: 'x', fingerprint: 'fp', attempts: 1, matched_keywords: '[]' }]; }, async getAnalysisCache() { return []; }, async finishAnalysisJob(id, input) { finished.push({ id, input }); }, async insertAnalysis() { throw new Error('deep failed'); }
  };
  const ai = { profiles: { light: { version: 'l1', model: 'lm' }, deep: { version: 'd1', model: 'dm' } }, selectProfile(profile) { return { name: profile, ...this.profiles[profile] }; }, async analyzeBatch() { return [{ sentiment: 'neutral', severity: 'normal', confidence: 1, needsDeep: false }]; } };
  const result = await processDownstream({ repo, ai, alertEngine: { async process() { return []; } }, leaseOwner: 'w1', analysisRetryBaseMs: 1 }, source, [{ content: { id: 'c1' }, raw: { title: 'x', body: 'x', fingerprint: 'fp' }, change: 'inserted' }]);
  assert.equal(result.analyzed, 0);
  assert.equal(finished[0].input.status, 'retryable');
});
test('global analysis backlog resolves keyword rules for each claimed community', async () => {
  const ruleScopes = [];
  let lightClaimed = false;
  const repo = {
    async enqueueAnalysisJob() {},
    async claimAnalysisJobs({ profile }) {
      if (profile !== 'light' || lightClaimed) return [];
      lightClaimed = true;
      return [
        { id: 'j1', content_id: 'ct1', game_id: 'g1', community_id: 'c1', region_code: 'domestic', platform: 'q1', title: '国服', body: '崩溃', fingerprint: 'fp1', attempts: 1, matched_keywords: '[]' },
        { id: 'j2', content_id: 'ct2', game_id: 'g2', community_id: 'c2', region_code: 'overseas', platform: 'reddit', title: '海外', body: '退款', fingerprint: 'fp2', attempts: 1, matched_keywords: '[]' }
      ];
    },
    async loadKeywordRules(gameId, platform, communityId) {
      ruleScopes.push({ gameId, platform, communityId });
      return [];
    },
    async getAnalysisCache() { return []; },
    async insertAnalysis() {},
    async upsertAnalysisCache() {},
    async finishAnalysisJob() {}
  };
  const ai = {
    configured() { return true; },
    profiles: { light: { version: 'l1', model: 'lm' }, deep: { version: 'd1', model: 'dm' } },
    selectProfile(profile) { return { name: profile, ...this.profiles[profile] }; },
    async analyzeBatch(items) { return items.map(() => ({ sentiment: 'neutral', severity: 'normal', confidence: 1, needsDeep: false })); }
  };
  await processAnalysisBacklog({ repo, ai, alertEngine: {}, leaseOwner: 'w1' });
  assert.deepEqual(ruleScopes, [
    { gameId: 'g1', platform: 'q1', communityId: 'c1' },
    { gameId: 'g2', platform: 'reddit', communityId: 'c2' }
  ]);
});

test('comment normalization keeps root, direct parent, and explicit depth metadata', () => {
  const item = normalizePlatformItem({ id: 'r1', text: 'reply', root_platform_content_id: 'p1', parent_id: 'c1', depth: 3 }, { scope: 'comments', rootPlatformContentId: 'p1' });
  assert.equal(item.rootPlatformContentId, 'p1');
  assert.equal(item.platformParentId, 'c1');
  assert.equal(item.contentDepth, 3);
  assert.equal(item.rawPayload, null);
});

test('per-sync-run commit lane is FIFO and fixed at one active commit', async () => {
  const lane = createCommitLane(); const order = []; let active = 0; let peak = 0;
  const submit = id => lane.submit(async () => { active += 1; peak = Math.max(peak, active); order.push(`start-${id}`); await new Promise(resolve => setTimeout(resolve, id === 1 ? 8 : 1)); order.push(`end-${id}`); active -= 1; return id; });
  assert.deepEqual(await Promise.all([submit(1), submit(2), submit(3)]), [1, 2, 3]);
  await lane.drain(); lane.close();
  assert.equal(peak, 1);
  assert.deepEqual(order, ['start-1', 'end-1', 'start-2', 'end-2', 'start-3', 'end-3']);
  await assert.rejects(() => lane.submit(async () => {}), error => error.code === 'COMMIT_LANE_CLOSED');
});

test('daily analysis collection enqueues only and never claims or calls AI', async () => {
  const calls = { enqueue: 0, claim: 0, ai: 0 };
  const result = await enqueueDailyAnalysis({
    repo: {
      async loadKeywordRules() { return []; },
      async enqueueAnalysisJob() { calls.enqueue += 1; },
      async claimAnalysisJobs() { calls.claim += 1; return []; },
      async finishAnalysisJob() {}
    },
    ai: { configured() { return true; }, selectProfile() { return { version: 'l1' }; }, async analyzeBatch() { calls.ai += 1; return []; } },
    alertEngine: {}
  }, source, [{ content: { id: 'c-daily' }, raw: { title: '昨日', body: '内容', fingerprint: 'fp-daily', publishedAt: '2026-08-17T08:00:00Z' }, change: 'inserted' }], { publishedFrom: new Date('2026-08-17T00:00:00Z'), publishedTo: new Date('2026-08-18T00:00:00Z') });
  assert.equal(result.enqueued, 1);
  assert.deepEqual(calls, { enqueue: 1, claim: 0, ai: 0 });
});

test('syncStage keeps one lease across pages and rejects repeated current cursor', async () => {
  const releases = []; const commits = [];
  const repo = {
    async claimSyncCheckpoint() { return { id: 'cp1', cursor: 'start' }; },
    async upsertContentPage(input) { commits.push(input); return { contents: [], storedCount: 0 }; },
    async releaseSyncCheckpoint(id, patch) { releases.push({ id, ...patch }); }
  };
  const pages = [
    { items: [], nextCursor: 'next', hasMore: true, capability: 'authorized_scope' },
    { items: [], nextCursor: null, hasMore: false, capability: 'authorized_scope' }
  ];
  const connector = { async listPosts() { return pages.shift(); } };
  const result = await syncStage({ repo, leaseOwner: 'w1', leaseSeconds: 60, pageBudget: 3, pageSize: 10 }, { source, account: { id: 'a1' }, connector, credential: {}, scope: 'posts', syncMode: 'incremental' });
  assert.equal(result.completed, true);
  assert.equal(commits.length, 2);
  assert.equal(commits[0].leaseOwner, 'w1');
  assert.equal(releases.length, 0);

  const badConnector = { async listPosts() { return { items: [], nextCursor: 'same', hasMore: true }; } };
  const badRepo = { ...repo, async claimSyncCheckpoint() { return { id: 'cp2', cursor: 'same' }; } };
  await assert.rejects(() => syncStage({ repo: badRepo, leaseOwner: 'w1', leaseSeconds: 60, pageBudget: 2, pageSize: 10 }, { source, account: { id: 'a1' }, connector: badConnector, credential: {}, scope: 'posts', syncMode: 'incremental' }), error => error.code === 'MALFORMED_RESPONSE');
  assert.equal(releases.at(-1).status, 'failed');
});
test('syncStage times out a stalled page and releases its checkpoint', async () => {
  const releases = [];
  const repo = {
    async claimSyncCheckpoint() { return { id: 'cp-timeout', cursor: null }; },
    async releaseSyncCheckpoint(id, patch) { releases.push({ id, ...patch }); }
  };
  const connector = { async listComments() { return new Promise(() => {}); } };
  await assert.rejects(
    () => syncStage({ repo, leaseOwner: 'w1', leaseSeconds: 60, pageBudget: 1, pageSize: 10, pageTimeoutMs: 5 }, { source, account: { id: 'a1' }, connector, credential: {}, scope: 'comments', rootPlatformContentId: 'p-timeout', syncMode: 'backfill' }),
    error => error.code === 'SYNC_PAGE_TIMEOUT'
  );
  assert.equal(releases.length, 1);
  assert.equal(releases[0].status, 'failed');
  assert.equal(releases[0].errorCode, 'SYNC_PAGE_TIMEOUT');
});
test('syncStage waits for page N commit before fetching page N+1', async () => {
  let committedFirst = false; let calls = 0;
  const repo = {
    async claimSyncCheckpoint() { return { id: 'cp-order', cursor: null }; },
    async upsertContentPage(input) { if (input.nextCursor === 'next') { await new Promise(resolve => setTimeout(resolve, 8)); committedFirst = true; } return { contents: [], storedCount: 0 }; },
    async releaseSyncCheckpoint() {}
  };
  const connector = { async listPosts() { calls += 1; if (calls === 2) assert.equal(committedFirst, true); return calls === 1 ? { items: [], nextCursor: 'next', hasMore: true } : { items: [], nextCursor: null, hasMore: false }; } };
  const result = await syncStage({ repo, commitLane: createCommitLane(), leaseOwner: 'w', leaseSeconds: 10, pageBudget: 2, pageSize: 10 }, { source, account: { id: 'a1' }, connector, scope: 'posts', syncMode: 'incremental' });
  assert.equal(result.completed, true);
  assert.equal(calls, 2);
});

test('late post-deadline fetch does not commit and keeps its checkpoint cursor', async () => {
  const releases = []; let commits = 0;
  const repo = {
    async claimSyncCheckpoint() { return { id: 'cp-late', cursor: 'keep' }; },
    async upsertContentPage() { commits += 1; return { contents: [], storedCount: 0 }; },
    async releaseSyncCheckpoint(id, patch) { releases.push({ id, ...patch }); }
  };
  const deps = { repo, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10, deadlineAt: Date.now() + 5 };
  const connector = { async listPosts() { await new Promise(resolve => setTimeout(resolve, 10)); return { items: [{ id: 'late' }], nextCursor: null, hasMore: false }; } };
  await assert.rejects(() => syncStage(deps, { source, account: { id: 'a1' }, connector, scope: 'posts', syncMode: 'incremental' }), error => error.code === 'DAILY_RUN_TIMEOUT');
  assert.equal(commits, 0);
  assert.equal(releases[0].cursor, 'keep');
  assert.equal(releases[0].errorCode, 'DAILY_RUN_TIMEOUT');
});

test('syncStage releases its checkpoint when the repository rejects a page commit', async () => {
  const releases = [];
  const repo = {
    async claimSyncCheckpoint() { return { id: 'cp-commit-timeout', cursor: null }; },
    async upsertContentPage() { const error = new Error('database lock wait timeout'); error.code = 'SYNC_PAGE_COMMIT_TIMEOUT'; throw error; },
    async releaseSyncCheckpoint(id, patch) { releases.push({ id, ...patch }); }
  };
  const connector = { async listPosts() { return { items: [{ id: 'p-commit-timeout' }], nextCursor: null, hasMore: false }; } };
  await assert.rejects(
    () => syncStage({ repo, leaseOwner: 'w1', leaseSeconds: 60, pageBudget: 1, pageSize: 10, pageTimeoutMs: 5 }, { source, account: { id: 'a1' }, connector, credential: {}, scope: 'posts', syncMode: 'backfill' }),
    error => error.code === 'SYNC_PAGE_COMMIT_TIMEOUT'
  );
  assert.equal(releases[0].errorCode, 'SYNC_PAGE_COMMIT_TIMEOUT');
});
test('runPagedSource schedules one comments checkpoint per post and never reply scope', async () => {
  const claims = [];
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', metadata: {} }; }, async updateAccount() {},
    async createSyncRun() { return { id: 'sr1' }; }, async finishSyncRun() {}, async listSyncParents(accountId, scope) { return scope === 'comments' ? [{ root_platform_content_id: 'p1', post_platform_id: 'p1' }, { root_platform_content_id: 'p1', post_platform_id: 'p1' }] : [{ root_platform_content_id: 'c1', post_platform_id: 'p1' }]; },
    async claimSyncCheckpoint(input) { claims.push(input); return { id: `cp-${claims.length}`, cursor: null }; }, async upsertContentPage() { return { contents: [], storedCount: 0 }; }, async releaseSyncCheckpoint() {}
  });
  const calls = [];
  const connector = { async installationHealth() { return { installed: true, configured: true }; }, async listOwnedContents() { return { items: [{ id: 'p1' }], nextCursor: null, hasMore: false }; }, async listComments(input) { calls.push(input); return { items: [], nextCursor: null, hasMore: false }; } };
  await runSource({ repo, connectors: { bigplayer_h5: connector }, credentialContext: { async load() { return { apiToken: 'token' }; } }, ai: {}, alertEngine: {}, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10 }, source);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].commentId, null, '顶层评论不能把帖子 ID 当成 commentId');
  assert.deepEqual(claims.filter(item => item.syncScope === 'comments').map(item => item.rootPlatformContentId), ['p1']);
  assert.equal(claims.some(item => item.syncScope === 'replies'), false);
});

test('Q1 dynamically schedules every discovered feed with an independent checkpoint and safe default concurrency', async () => {
  const claims = []; const feedCalls = []; let activeFeedCalls = 0; let maxActiveFeedCalls = 0;
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', metadata: {} }; }, async updateAccount() {},
    async createSyncRun() { return { id: 'sr1' }; }, async finishSyncRun() {},
    async claimSyncCheckpoint(input) { claims.push(input); return { id: `cp-${claims.length}`, cursor: null }; },
    async upsertContentPage() { return { contents: [], storedCount: 0 }; }, async releaseSyncCheckpoint() {}, async listSyncParents() { return []; }
  });
  const feeds = [
    { feedKey: 'home', pageKind: 'home' },
    { feedKey: 'info:11', pageKind: 'info', sectionId: 11 },
    { feedKey: 'info:12', pageKind: 'info', sectionId: 12 },
    { feedKey: 'circle:22', pageKind: 'circle', sectionId: 22 },
    { feedKey: 'circle:23', pageKind: 'circle', sectionId: 23 }
  ];
  const connector = {
    async installationHealth() { return { installed: true, configured: true }; },
    async discoverFeeds() { return feeds; },
    async listFeedContents(input) {
      activeFeedCalls += 1; maxActiveFeedCalls = Math.max(maxActiveFeedCalls, activeFeedCalls);
      await new Promise(resolve => setTimeout(resolve, 5));
      feedCalls.push(input); activeFeedCalls -= 1;
      return { items: [], nextCursor: null, hasMore: false };
    }
  };
  const previousConcurrency = process.env.SYNC_FEED_CONCURRENCY;
  delete process.env.SYNC_FEED_CONCURRENCY;
  try {
    await runSource({ repo, connectors: { bigplayer_h5: connector }, credentialContext: { async load() { return { apiToken: 'token' }; } }, ai: {}, alertEngine: {}, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10 }, source);
  } finally {
    if (previousConcurrency == null) delete process.env.SYNC_FEED_CONCURRENCY;
    else process.env.SYNC_FEED_CONCURRENCY = previousConcurrency;
  }
  assert.deepEqual(feedCalls.map(call => call.feed.feedKey).sort(), feeds.map(feed => feed.feedKey).sort());
  assert.equal(maxActiveFeedCalls, 1);
  assert.deepEqual(claims.filter(item => item.taskKind === 'q1_feed').map(item => item.taskKey), feeds.map(feed => feed.feedKey));
});

test('daily Q1 overlaps feed fetches, serializes commits, and starts comments before all feeds finish', async () => {
  let activeFetches = 0; let peakFetches = 0; let activeCommits = 0; let peakCommits = 0; let slowFeedFinished = false; let commentStartedEarly = false; let claimedAnalysis = 0; let aiCalls = 0;
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', metadata: {} }; }, async updateAccount() {}, async createSyncRun() { return { id: 'sr-daily' }; }, async finishSyncRun() {},
    async claimSyncCheckpoint(input) { return { id: `cp-${input.taskKey}`, cursor: null }; },
    async upsertContentPage(input) {
      activeCommits += 1; peakCommits = Math.max(peakCommits, activeCommits); await new Promise(resolve => setTimeout(resolve, 3)); activeCommits -= 1;
      return { contents: input.items.map(item => ({ content: { id: `c-${item.externalId}`, content_type: input.taskKind === 'q1_feed' ? 'post' : 'comment' }, change: 'inserted' })), storedCount: input.items.length };
    },
    async releaseSyncCheckpoint() {}, async loadKeywordRules() { return []; }, async enqueueAnalysisJob() {}, async claimAnalysisJobs() { claimedAnalysis += 1; return []; }
  });
  const connector = {
    async installationHealth() { return { installed: true, configured: true }; }, hasSourceCapability() { return true; },
    async discoverFeeds() { return [{ feedKey: 'fast' }, { feedKey: 'slow' }]; },
    async listFeedContents({ feed }) {
      activeFetches += 1; peakFetches = Math.max(peakFetches, activeFetches); await new Promise(resolve => setTimeout(resolve, feed.feedKey === 'slow' ? 25 : 5)); activeFetches -= 1;
      if (feed.feedKey === 'slow') slowFeedFinished = true;
      return { items: [raw(`p-${feed.feedKey}`, feed.feedKey, 'body')].map(item => ({ ...item, publishedAt: '2026-08-17T08:00:00Z' })), nextCursor: null, hasMore: false };
    },
    async listComments(input) { if (input.postId === 'p-fast' && !slowFeedFinished) commentStartedEarly = true; return { items: [], nextCursor: null, hasMore: false }; }
  };
  await runSource({ repo, connectors: { bigplayer_h5: connector }, credentialContext: { async load() { return {}; } }, ai: { configured() { return true; }, selectProfile() { return { version: 'l1' }; }, async analyzeBatch() { aiCalls += 1; return []; } }, alertEngine: {}, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10, collectionWindow: { dailyBounded: true, publishedFrom: new Date('2026-08-17T00:00:00Z'), publishedTo: new Date('2026-08-18T00:00:00Z') }, analysisScope: { publishedFrom: new Date('2026-08-17T00:00:00Z'), publishedTo: new Date('2026-08-18T00:00:00Z') } }, source);
  assert.equal(peakFetches, 2);
  assert.equal(peakCommits, 1);
  assert.equal(commentStartedEarly, true);
  assert.equal(claimedAnalysis, 0);
  assert.equal(aiCalls, 0);
});

test('daily Q1 multipage feed does not finish partial', async () => {
  const finished = []; const requestedCursors = []; let checkpointCursor = null;
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', metadata: {} }; }, async updateAccount() {},
    async createSyncRun() { return { id: 'sr-daily-multipage' }; }, async finishSyncRun(id, patch) { finished.push({ id, ...patch }); },
    async claimSyncCheckpoint() { return { id: 'cp-home', cursor: checkpointCursor }; },
    async upsertContentPage(input) { checkpointCursor = input.nextCursor; return { contents: input.items.map(item => ({ content: { id: `c-${item.externalId}`, content_type: 'post' }, change: 'inserted' })), storedCount: input.items.length }; },
    async releaseSyncCheckpoint(id, patch) { checkpointCursor = patch.cursor; }, async loadKeywordRules() { return []; }, async enqueueAnalysisJob() {}
  });
  let page = 0;
  const connector = {
    async installationHealth() { return { installed: true, configured: true }; }, hasSourceCapability() { return false; },
    async discoverFeeds() { return [{ feedKey: 'home' }]; },
    async listFeedContents(input) {
      requestedCursors.push(input.cursor);
      page += 1;
      return page === 1
        ? { items: [raw('p1', '第一条', '内容')], nextCursor: 'page-2', hasMore: true }
        : { items: [raw('p2', '第二条', '内容')], nextCursor: null, hasMore: false };
    }
  };
  await runSource({ repo, connectors: { bigplayer_h5: connector }, credentialContext: { async load() { return {}; } }, ai: {}, alertEngine: {}, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10, collectionWindow: { dailyBounded: true, publishedFrom: new Date('2026-08-17T00:00:00Z'), publishedTo: new Date('2026-08-18T00:00:00Z') } }, source);
  assert.equal(page, 2);
  assert.deepEqual(requestedCursors, [null, 'page-2']);
  assert.equal(finished.at(-1).status, 'completed_authorized_scope');
  assert.equal(finished.at(-1).errorCode, null);
});

test('daily failure drains and closes the commit lane before finishing the sync run', async () => {
  const lane = createCommitLane();
  let pendingCommitFinished = false; let closedBeforeFinish = false;
  lane.submit(async () => { await new Promise(resolve => setTimeout(resolve, 8)); pendingCommitFinished = true; });
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', metadata: {} }; }, async updateAccount() {}, async createSyncRun() { return { id: 'sr-daily-failure' }; },
    async finishSyncRun() {
      closedBeforeFinish = await lane.submit(async () => {}).then(() => false, error => error.code === 'COMMIT_LANE_CLOSED');
      assert.equal(pendingCommitFinished, true);
    },
    async claimSyncCheckpoint() { return { id: 'unused', cursor: null }; }, async upsertContentPage() { return { contents: [], storedCount: 0 }; }, async releaseSyncCheckpoint() {}
  });
  const connector = {
    async installationHealth() { return { installed: true, configured: true }; },
    async discoverFeeds() { const error = new Error('feed discovery failed'); error.code = 'DISCOVERY_FAILED'; throw error; },
    async listFeedContents() { throw new Error('should not fetch'); }
  };
  await runSource({ repo, connectors: { bigplayer_h5: connector }, credentialContext: { async load() { return {}; } }, ai: {}, alertEngine: {}, commitLane: lane, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10, collectionWindow: { dailyBounded: true } }, source);
  assert.equal(closedBeforeFinish, true);
  assert.equal(repo.state.finished.at(-1).status, 'failed');
});

test('daily Q1 schedules replies immediately from a committed comment page', async () => {
  let slowCommentFinished = false; let replyStartedEarly = false;
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', metadata: {} }; }, async updateAccount() {}, async createSyncRun() { return { id: 'sr-reply-daily' }; }, async finishSyncRun() {},
    async claimSyncCheckpoint(input) { return { id: `cp-${input.taskKey}`, cursor: null }; }, async upsertContentPage(input) { return { contents: input.items.map(item => ({ content: { id: `c-${item.externalId}`, content_type: input.taskKind === 'q1_feed' ? 'post' : 'comment' }, change: 'inserted' })), storedCount: input.items.length }; }, async releaseSyncCheckpoint() {}, async loadKeywordRules() { return []; }, async enqueueAnalysisJob() {}
  });
  const connector = {
    async installationHealth() { return { installed: true, configured: true }; }, hasSourceCapability() { return true; }, async discoverFeeds() { return [{ feedKey: 'home' }]; },
    async listFeedContents() { return { items: ['p-fast', 'p-slow'].map(id => ({ ...raw(id, id, 'body'), publishedAt: '2026-08-17T08:00:00Z' })), nextCursor: null, hasMore: false }; },
    async listComments(input) {
      if (input.commentId) { if (!slowCommentFinished) replyStartedEarly = true; return { items: [], nextCursor: null, hasMore: false }; }
      if (input.postId === 'p-slow') { await new Promise(resolve => setTimeout(resolve, 20)); slowCommentFinished = true; return { items: [], nextCursor: null, hasMore: false }; }
      return { items: [], nextCursor: null, hasMore: false, replyTargets: [{ postId: 'p-fast', commentId: 'top-1', sortType: 0 }] };
    }
  };
  await runSource({ repo, connectors: { bigplayer_h5: connector }, credentialContext: { async load() { return {}; } }, ai: { configured() { return true; }, selectProfile() { return { version: 'l1' }; } }, alertEngine: {}, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10, collectionWindow: { dailyBounded: true, publishedFrom: new Date('2026-08-17T00:00:00Z'), publishedTo: new Date('2026-08-18T00:00:00Z') }, analysisScope: { publishedFrom: new Date('2026-08-17T00:00:00Z'), publishedTo: new Date('2026-08-18T00:00:00Z') } }, source);
  assert.equal(replyStartedEarly, true);
});

test('Q1 feed syncStage accumulates all pages after the first 20 items', async () => {
  const calls = [];
  const commits = [];
  const repo = {
    async claimSyncCheckpoint() { return { id: 'cp-q1', cursor: null }; },
    async upsertContentPage(input) { commits.push(input); return { contents: input.items.map((item, index) => ({ id: `c-${item.externalId || index}` })), storedCount: input.items.length }; },
    async releaseSyncCheckpoint() {}
  };
  const firstItems = Array.from({ length: 20 }, (_, index) => raw(`q1-${index}`, `帖子-${index}`, `正文-${index}`));
  const secondItems = Array.from({ length: 11 }, (_, index) => raw(`q1-${20 + index}`, `帖子-${20 + index}`, `正文-${20 + index}`));
  const connector = {
    async listFeedContents(input) {
      calls.push(input);
      return calls.length === 1
        ? { items: firstItems, nextCursor: 'q1-page-2', hasMore: true, capability: 'authorized_scope' }
        : { items: secondItems, nextCursor: null, hasMore: false, capability: 'authorized_scope' };
    }
  };
  const result = await syncStage({ repo, leaseOwner: 'w1', leaseSeconds: 60, pageBudget: 3, pageSize: 50 }, {
    source, account: { id: 'a1' }, connector, credential: {}, scope: 'posts', syncMode: 'incremental', taskKind: 'q1_feed', taskKey: 'home', feed: { feedKey: 'home' }
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].cursor, 'q1-page-2');
  assert.equal(commits.length, 2);
  assert.equal(commits[0].items.length + commits[1].items.length, 31);
  assert.equal(result.discovered, 31);
  assert.equal(result.completed, true);
});
test('Q1 reply targets are processed with bounded concurrency', async () => {
  const previousConcurrency = process.env.SYNC_REPLY_CONCURRENCY;
  process.env.SYNC_REPLY_CONCURRENCY = '2';
  let activeReplies = 0; let maxActiveReplies = 0;
  const calls = [];
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', metadata: {} }; }, async updateAccount() {}, async createSyncRun() { return { id: 'sr-reply' }; }, async finishSyncRun() {},
    async claimSyncCheckpoint() { return { id: `cp-${calls.length}`, cursor: null }; }, async upsertContentPage() { return { contents: [], storedCount: 0 }; }, async releaseSyncCheckpoint() {},
    async listSyncParents() { return [{ root_platform_content_id: 'p1', post_platform_id: 'p1' }]; }
  });
  const connector = {
    async installationHealth() { return { installed: true, configured: true }; },
    async listOwnedContents() { return { items: [], nextCursor: null, hasMore: false }; },
    async listComments(input) {
      if (!input.commentId) return { items: [], nextCursor: null, hasMore: false, replyTargets: [1, 2, 3].map(id => ({ postId: 'p1', commentId: `c${id}`, sortType: 0 })) };
      activeReplies += 1; maxActiveReplies = Math.max(maxActiveReplies, activeReplies); calls.push(input); await new Promise(resolve => setTimeout(resolve, 5)); activeReplies -= 1;
      return { items: [], nextCursor: null, hasMore: false };
    }
  };
  try {
    await runSource({ repo, connectors: { bigplayer_h5: connector }, credentialContext: { async load() { return { apiToken: 'token' }; } }, ai: {}, alertEngine: {}, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10 }, source);
  } finally {
    if (previousConcurrency == null) delete process.env.SYNC_REPLY_CONCURRENCY;
    else process.env.SYNC_REPLY_CONCURRENCY = previousConcurrency;
  }
  assert.equal(calls.length, 3);
  assert.equal(maxActiveReplies, 2);
});

test('Q1 reply targets schedule comment-domain checkpoints with real comment IDs', async () => {
  const calls = []; const claims = [];
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', metadata: {} }; }, async updateAccount() {}, async createSyncRun() { return { id: 'sr1' }; }, async finishSyncRun() {},
    async claimSyncCheckpoint(input) { claims.push(input); return { id: `cp-${claims.length}`, cursor: null }; }, async upsertContentPage() { return { contents: [], storedCount: 0 }; }, async releaseSyncCheckpoint() {},
    async listSyncParents() { return [{ root_platform_content_id: 'p1', post_platform_id: 'p1' }]; }
  });
  const connector = {
    async installationHealth() { return { installed: true, configured: true }; },
    async listOwnedContents() { return { items: [], nextCursor: null, hasMore: false }; },
    async listComments(input) { calls.push(input); return input.commentId ? { items: [], nextCursor: null, hasMore: false } : { items: [], nextCursor: null, hasMore: false, replyTargets: [{ postId: 'p1', commentId: 'c1', sortType: 0 }] }; }
  };
  await runSource({ repo, connectors: { bigplayer_h5: connector }, credentialContext: { async load() { return { apiToken: 'token' }; } }, ai: {}, alertEngine: {}, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10 }, source);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].commentId, null);
  assert.equal(calls[1].commentId, 'c1');
  assert.equal(claims.find(item => item.taskKind === 'q1_reply').taskKey, 'reply:c1:0');
  assert.equal(claims.some(item => item.syncScope === 'replies'), false);
});

test('授权闸门：未授权则不采集，回写 unauthorized 并 UNAUTHORIZED 结束', async () => {
  const repo = makeRepo();
  const connectors = { bigplayer_h5: unauthConnector() };
  await runSource({ repo, connectors, ai: {}, alertEngine: {} }, source);
  assert.deepEqual(repo.state.sourceAuth.at(-1), { id: 's1', authStatus: 'unauthorized' });
  assert.equal(repo.state.finished.at(-1).errorCode, 'UNAUTHORIZED');
  assert.equal(repo.state.analyses.length, 0);
});

test('checkAuthorization 已配置放行并回写 authorized', async () => {
  const repo = makeRepo();
  const gate = await checkAuthorization(repo, source, okConnector([]));
  assert.equal(gate.authorized, true);
  assert.deepEqual(repo.state.sourceAuth.at(-1), { id: 's1', authStatus: 'authorized' });
});

test('未命中关键词的内容不送 AI（token 护栏）', async () => {
  const repo = makeRepo({ rules: [{ keyword: '崩溃', group_name: '闪退组', severity: 'urgent', trigger_mode: 'immediate', window_seconds: 600, threshold_count: 1 }] });
  const connectors = { bigplayer_h5: okConnector([raw('1', '今天天气好', '一起开黑很开心')]) };
  const ai = { calls: 0, async analyzeBatch(items) { this.calls += 1; return items.map(() => ({ sentiment: 'neutral', severity: 'normal', negativeScore: 0, topics: [], summary: '' })); } };
  const alertEngine = { async process() { return []; } };
  await runSource({ repo, connectors, ai, alertEngine }, source);
  assert.equal(ai.calls, 0); // 无命中 → 完全不调用 AI
  assert.equal(repo.state.analyses.length, 0);
  assert.equal(repo.state.finished.at(-1).status, 'success');
});

test('命中关键词的内容进入 AI 与告警，matched_keywords 用组名', async () => {
  const repo = makeRepo({ rules: [{ keyword: '崩溃', group_name: '闪退组', severity: 'urgent', trigger_mode: 'immediate', window_seconds: 600, threshold_count: 1 }] });
  const connectors = { bigplayer_h5: okConnector([raw('1', '游戏崩溃', '进不去'), raw('2', '正常内容', '好玩')]) };
  const ai = { calls: 0, lastBatch: null, async analyzeBatch(items) { this.calls += 1; this.lastBatch = items; return items.map(() => ({ sentiment: 'negative', severity: 'urgent', negativeScore: 0.9, topics: ['闪退'], summary: '崩溃' })); } };
  const alertCalls = [];
  const alertEngine = { async process(a) { alertCalls.push(a); return [{ reused: false, alertId: 'al-1' }]; } };
  await runSource({ repo, connectors, ai, alertEngine }, source);
  assert.equal(ai.calls, 1);
  assert.equal(ai.lastBatch.length, 1); // 只有命中的 1 条进 AI
  assert.equal(repo.state.analyses.length, 1);
  assert.deepEqual(repo.state.analyses[0].matchedKeywords, ['闪退组']);
  assert.equal(repo.state.analyses[0].triggerReason, 'keyword_match');
  assert.equal(alertCalls.length, 1);
  const fin = repo.state.finished.at(-1);
  assert.equal(fin.status, 'success');
  assert.equal(fin.storedCount, 2);
  assert.equal(fin.analyzedCount, 1);
  assert.equal(fin.alertedCount, 1);
});

test('缺少连接器时 CONNECTOR_NOT_FOUND', async () => {
  const repo = makeRepo();
  await runSource({ repo, connectors: {}, ai: {}, alertEngine: {} }, source);
  assert.equal(repo.state.finished.at(-1).errorCode, 'CONNECTOR_NOT_FOUND');
});

test('runOnce 优先处理手动请求并清空标记', async () => {
  const manualSource = { id: 's-manual', game_id: 'g1', platform: 'bigplayer_h5', display_name: '手动源', game_name: '冰川', enabled: 1, game_enabled: 1 };
  const cleared = [];
  const repo = makeRepo();
  repo.listManualDueSources = async () => [manualSource];
  repo.clearManualRequest = async id => cleared.push(id);
  repo.listDueSources = async () => [];
  const connectors = { bigplayer_h5: okConnector([raw('m1', '游戏崩溃', '进不去')]) };
  repo.loadKeywordRules = async () => [{ keyword: '崩溃', group_name: '闪退组', severity: 'urgent', trigger_mode: 'immediate', window_seconds: 600, threshold_count: 1 }];
  const ai = { async analyzeBatch(items) { return items.map(() => ({ sentiment: 'negative', severity: 'urgent', negativeScore: 0.9, topics: [], summary: '' })); } };
  const alertEngine = { async process() { return [{ reused: false }]; } };
  const result = await runOnce({ repo, connectors, ai, alertEngine });
  assert.deepEqual(cleared, ['s-manual']); // 标记被清空
  assert.equal(result.manual, 1);
  assert.equal(result.scanned, 0);
  assert.equal(repo.state.analyses.length, 1); // 手动源实际跑了 pipeline
});

test('runOnce 停用的手动源只清标记不采集', async () => {
  const disabled = { id: 's-off', game_id: 'g1', platform: 'bigplayer_h5', display_name: '停用源', game_name: '冰川', enabled: 0, game_enabled: 1 };
  const cleared = [];
  const repo = makeRepo();
  repo.listManualDueSources = async () => [disabled];
  repo.clearManualRequest = async id => cleared.push(id);
  repo.listDueSources = async () => [];
  const connectors = { bigplayer_h5: okConnector([raw('x', '崩溃', 'boom')]) };
  const ai = { calls: 0, async analyzeBatch() { this.calls += 1; return []; } };
  await runOnce({ repo, connectors, ai, alertEngine: { async process() { return []; } } });
  assert.deepEqual(cleared, ['s-off']);
  assert.equal(ai.calls, 0); // 停用源不采集
});

test('分页根阶段优先 listOwnedContents，并传递 metadata 同步边界', async () => {
  const calls = []; const claims = [];
  const repo = {
    async claimSyncCheckpoint(input) { claims.push(input); return { id: 'cp-owned', cursor: null, last_item_at: '2026-08-09T00:00:00Z' }; },
    async upsertContentPage() { return { contents: [], storedCount: 0 }; },
    async releaseSyncCheckpoint() {}
  };
  const connector = {
    async listOwnedContents(input) { calls.push(input); return { items: [], nextCursor: null, hasMore: false }; },
    async listPosts() { throw new Error('listPosts should not be used'); }
  };
  await syncStage({ repo, leaseOwner: 'w1', leaseSeconds: 60, pageBudget: 1, pageSize: 10 }, {
    source, account: { id: 'a1', metadata: JSON.stringify({ syncMode: 'backfill', historyStart: '2026-08-01T00:00:00Z' }) },
    connector, credential: { apiToken: 'token' }, scope: 'posts', syncMode: 'backfill', historyStart: '2026-08-01T00:00:00Z'
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].historyStart, '2026-08-01T00:00:00Z');
  assert.equal(calls[0].updatedSince, '2026-08-09T00:00:00Z');
  assert.equal(claims[0].taskKind, 'owned_content');
  assert.equal(claims[0].taskKey, 'owned');
});

test('关键词搜索为每条有效规则建立独立 taskKind/taskKey stage', async () => {
  const claims = []; const searches = [];
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', game_id: 'g1', source_id: 's1', metadata: { syncMode: 'incremental' } }; },
    async updateAccount() {},
    async createSyncRun() { return { id: 'sr1' }; }, async finishSyncRun() {},
    async claimSyncCheckpoint(input) { claims.push(input); return { id: `cp-${claims.length}`, cursor: null }; },
    async upsertContentPage() { return { contents: [], storedCount: 0 }; }, async releaseSyncCheckpoint() {},
    async listSyncParents() { return []; },
    async loadKeywordRules() { return [{ id: 'k1', keyword: '崩溃', enabled: 1 }, { id: 'k2', keyword: '外挂', enabled: true }, { id: 'k3', keyword: '停用', enabled: 0 }]; }
  });
  const connector = {
    async installationHealth() { return { installed: true, configured: true }; },
    async listOwnedContents() { return { items: [], nextCursor: null, hasMore: false }; },
    async searchContents(input) { searches.push(input); return { items: [], nextCursor: null, hasMore: false }; }
  };
  await runSource({ repo, connectors: { douyin: connector }, credentialContext: { async load() { throw new Error('must not read account_password'); } }, loginSessionClient: { async getSessionRef() { return 'sess-1'; } }, ai: {}, alertEngine: {}, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10 }, { ...source, platform: 'douyin' });
  assert.deepEqual(searches.map(call => call.keyword), ['崩溃', '外挂']);
  const keywordClaims = claims.filter(item => item.taskKind === 'keyword_search');
  assert.deepEqual(keywordClaims.map(item => item.taskKey), ['k1', 'k2']);
});

test('SESSION_EXPIRED 刷新会话后仅重试当前页一次', async () => {
  let pageCalls = 0; let refreshCalls = 0;
  const repo = { async claimSyncCheckpoint() { return { id: 'cp1', cursor: 'c0' }; }, async upsertContentPage() { return { contents: [], storedCount: 0 }; }, async releaseSyncCheckpoint() {} };
  const loginSessionClient = { async refreshSession() { refreshCalls += 1; return { sessionRef: 'sess-new' }; } };
  const connector = { async listOwnedContents(input) { pageCalls += 1; if (pageCalls === 1) { const error = new Error('expired'); error.code = 'SESSION_EXPIRED'; throw error; } assert.equal(input.sessionRef, 'sess-new'); return { items: [], nextCursor: null, hasMore: false }; } };
  const result = await syncStage({ repo, loginSessionClient, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10 }, { source: { ...source, platform: 'xiaohongshu' }, account: { id: 'a1' }, connector, sessionRef: 'sess-old', scope: 'posts', syncMode: 'incremental' });
  assert.equal(result.completed, true);
  assert.equal(pageCalls, 2);
  assert.equal(refreshCalls, 1);
});

test('人工验证错误释放 checkpoint 且不推进 cursor', async () => {
  const releases = [];
  const repo = { async claimSyncCheckpoint() { return { id: 'cp1', cursor: 'keep-me' }; }, async releaseSyncCheckpoint(id, patch) { releases.push({ id, ...patch }); } };
  const connector = { async listOwnedContents() { const error = new Error('sms required'); error.code = 'SMS_VERIFICATION_REQUIRED'; throw error; } };
  await assert.rejects(() => syncStage({ repo, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10 }, { source: { ...source, platform: 'xiaohongshu' }, account: { id: 'a1' }, connector, sessionRef: 'sess', scope: 'posts', syncMode: 'incremental' }), error => error.code === 'SMS_VERIFICATION_REQUIRED');
  assert.equal(releases[0].status, 'awaiting_manual_verification');
  assert.equal(releases[0].cursor, 'keep-me');
});

test('runOnce 对不同 source 有界并发执行', async () => {
  let active = 0; let peak = 0;
  const repo = makeRepo();
  repo.listManualDueSources = async () => [];
  repo.listDueSources = async () => ['1', '2', '3'].map(id => ({ ...source, id: `s${id}` }));
  const connectors = { bigplayer_h5: { async healthCheck() { return { configured: true }; }, async collect() { active += 1; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 20)); active -= 1; return []; } } };
  await runOnce({ repo, connectors, ai: {}, alertEngine: {}, sourceConcurrency: 2 });
  assert.equal(peak, 2);
});

test('不支持的子阶段记为 partial 而不是空数据成功', async () => {
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', game_id: 'g1', source_id: 's1', metadata: {} }; }, async updateAccount() {},
    async createSyncRun() { return { id: 'sr1' }; }, async finishSyncRun(id, patch) { repo.state.syncFinished = patch; },
    async claimSyncCheckpoint({ syncScope }) { return { id: `cp-${syncScope}`, cursor: null }; },
    async upsertContentPage() { return { contents: [], storedCount: 0 }; }, async releaseSyncCheckpoint() {},
    async listSyncParents(accountId, scope) { return scope === 'comments' ? [{ root_platform_content_id: 'p1', post_platform_id: 'p1' }] : []; }
  });
  const unsupported = () => { const error = new Error('not supported'); error.code = 'CAPABILITY_UNSUPPORTED'; throw error; };
  const connector = { async installationHealth() { return { installed: true, configured: true }; }, async listOwnedContents() { return { items: [], nextCursor: null, hasMore: false }; }, async listComments() { return unsupported(); } };
  await runSource({ repo, connectors: { bigplayer_h5: connector }, credentialContext: { async load() { return { apiToken: 'token' }; } }, ai: {}, alertEngine: {}, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10 }, source);
  assert.equal(repo.state.syncFinished.status, 'partial');
  assert.equal(repo.state.finished.at(-1).status, 'partial');
});

test('人工验证使 run 和 source 明确进入待验证状态', async () => {
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', game_id: 'g1', source_id: 's1', metadata: {} }; }, async updateAccount() {},
    async createSyncRun() { return { id: 'sr1' }; }, async finishSyncRun(id, patch) { repo.state.syncFinished = patch; },
    async claimSyncCheckpoint() { return { id: 'cp1', cursor: 'keep' }; }, async upsertContentPage() { return { contents: [], storedCount: 0 }; }, async releaseSyncCheckpoint() {}, async listSyncParents() { return []; }
  });
  const connector = { async installationHealth() { return { installed: true, configured: true }; }, async listOwnedContents() { const error = new Error('device confirmation'); error.code = 'DEVICE_CONFIRMATION_REQUIRED'; throw error; } };
  await runSource({ repo, connectors: { xiaohongshu: connector }, loginSessionClient: { async getSessionRef() { return 'sess'; } }, ai: {}, alertEngine: {}, leaseOwner: 'w', leaseSeconds: 10, pageBudget: 1, pageSize: 10 }, { ...source, platform: 'xiaohongshu' });
  assert.equal(repo.state.syncFinished.status, 'awaiting_manual_verification');
  assert.equal(repo.state.finished.at(-1).status, 'awaiting_manual_verification');
  assert.equal(repo.state.sourceAuth.at(-1).authStatus, 'awaiting_manual_verification');
  assert.match(repo.state.sourceRuns.at(-1).errorMessage, /awaiting_manual_verification/);
});

test('precreated sync run is claimed once without enqueueing a duplicate', async () => {
  const calls = { enqueue: 0, claim: 0, pages: [] };
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', metadata: {} }; }, async updateAccount() {},
    async enqueueSyncRun() { calls.enqueue += 1; return { id: 'unexpected' }; },
    async claimSyncRun(input) { calls.claim += 1; assert.deepEqual(input, { runId: 'sr-queued', leaseOwner: 'worker-1', leaseSeconds: 30 }); return { id: 'sr-queued', sync_mode: 'incremental' }; },
    async finishSyncRun(id, patch) { repo.state.syncFinished = { id, ...patch }; },
    async claimSyncCheckpoint() { return { id: 'cp1', cursor: null }; },
    async upsertContentPage(input) { calls.pages.push(input); return { contents: [], storedCount: 0 }; },
    async releaseSyncCheckpoint() {}, async listSyncParents() { return []; }
  });
  const connector = { async installationHealth() { return { installed: true, configured: true }; }, async listOwnedContents() { return { items: [], nextCursor: null, hasMore: false }; } };
  await runSource({ repo, connectors: { bigplayer_h5: connector }, credentialContext: { async load() { return {}; } }, ai: {}, alertEngine: {}, leaseOwner: 'worker-1', leaseSeconds: 30, pageBudget: 1, pageSize: 10 }, source, { id: 'sr-queued', account_id: 'a1', sync_mode: 'incremental' });
  assert.equal(calls.enqueue, 0);
  assert.equal(calls.claim, 1);
  assert.equal(repo.state.runs.length, 1);
  assert.equal(calls.pages[0].syncRunId, 'sr-queued');
  assert.equal(repo.state.syncFinished.id, 'sr-queued');
  assert.equal(repo.state.syncFinished.status, 'completed_authorized_scope');
  assert.equal(repo.state.syncFinished.leaseOwner, 'worker-1');
});

test('failed sync run claim skips collection and does not create po_collection_runs row', async () => {
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', metadata: {} }; },
    async claimSyncRun() { return null; },
    async upsertContentPage() { throw new Error('must not persist'); }
  });
  const connector = { async listOwnedContents() { throw new Error('must not collect'); } };
  const result = await runSource({ repo, connectors: { bigplayer_h5: connector }, credentialContext: {}, leaseOwner: 'worker-2', leaseSeconds: 30 }, source, { id: 'sr-busy' });
  assert.deepEqual(result, { skipped: true, syncRunId: 'sr-busy' });
  assert.equal(repo.state.runs.length, 0);
  assert.equal(repo.state.finished.length, 0);
});

test('disabled AI skips persistent analysis without blocking collection', async () => {
  let enqueued = 0;
  const result = await processDownstream({
    repo: {
      async enqueueAnalysisJob() { enqueued += 1; },
      async claimAnalysisJobs() { return []; },
      async finishAnalysisJob() {}
    },
    ai: { configured() { return false; } },
    alertEngine: {}
  }, source, [{ content: { id: 'c1' }, raw: { title: 'x', body: 'y' }, change: 'inserted' }]);
  assert.deepEqual(result, { analyzed: 0, alerted: 0 });
  assert.equal(enqueued, 0);
});

test('runOnce skips missing-analysis backfill when AI is disabled', async () => {
  let backfills = 0;
  const repo = {
    async listRunnableSyncRuns() { return []; },
    async enqueueMissingAnalysis() { backfills += 1; },
    async listManualDueSources() { return []; },
    async listDueSources() { return []; }
  };
  const result = await runOnce({ repo, ai: { configured() { return false; } }, sourceConcurrency: 1 });
  assert.deepEqual(result, { queued: 0, manual: 0, scanned: 0 });
  assert.equal(backfills, 0);
});

test('runOnce prefers queued run while clearing compatible manual marker and deduping source', async () => {
  const cleared = []; const claimed = []; let enqueued = 0;
  const queuedSource = { ...source, enabled: 1, game_enabled: 1 };
  const repo = makeRepo();
  Object.assign(repo, {
    async listRunnableSyncRuns() { return [{ id: 'sr-queued', source_id: 's1', account_id: 'a1', sync_mode: 'incremental', source: queuedSource }]; },
    async listManualDueSources() { return [queuedSource]; }, async clearManualRequest(id) { cleared.push(id); }, async listDueSources() { return [queuedSource]; },
    async getDefaultAccount() { return { id: 'a1', metadata: {} }; }, async updateAccount() {},
    async enqueueSyncRun() { enqueued += 1; return { id: 'unexpected' }; },
    async claimSyncRun(input) { claimed.push(input); return { id: input.runId }; }, async finishSyncRun() {},
    async claimSyncCheckpoint() { return { id: 'cp1', cursor: null }; }, async upsertContentPage() { return { contents: [], storedCount: 0 }; }, async releaseSyncCheckpoint() {}, async listSyncParents() { return []; }
  });
  const connector = { async installationHealth() { return { installed: true, configured: true }; }, async listOwnedContents() { return { items: [], nextCursor: null, hasMore: false }; } };
  const result = await runOnce({ repo, connectors: { bigplayer_h5: connector }, credentialContext: { async load() { return {}; } }, ai: {}, alertEngine: {}, leaseOwner: 'worker-3', leaseSeconds: 20, pageBudget: 1, pageSize: 10 });
  assert.deepEqual(cleared, ['s1']);
  assert.equal(enqueued, 0);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].runId, 'sr-queued');
  assert.equal(repo.state.runs.length, 1);
  assert.deepEqual(result, { queued: 1, manual: 1, scanned: 1 });
});

test('scheduled paged source enqueues then claims and finishes the same run', async () => {
  const lifecycle = [];
  const repo = makeRepo();
  Object.assign(repo, {
    async getDefaultAccount() { return { id: 'a1', metadata: { syncMode: 'backfill' } }; }, async updateAccount() {},
    async enqueueSyncRun(input) { lifecycle.push(['enqueue', input]); return { id: 'sr-new', sync_mode: input.syncMode }; },
    async claimSyncRun(input) { lifecycle.push(['claim', input]); return { id: input.runId, sync_mode: 'backfill' }; },
    async finishSyncRun(id, patch) { lifecycle.push(['finish', { id, ...patch }]); },
    async claimSyncCheckpoint() { return { id: 'cp1', cursor: null }; }, async upsertContentPage() { return { contents: [], storedCount: 0 }; }, async releaseSyncCheckpoint() {}, async listSyncParents() { return []; }
  });
  const connector = { async installationHealth() { return { installed: true, configured: true }; }, async listOwnedContents() { return { items: [], nextCursor: null, hasMore: false }; } };
  await runSource({ repo, connectors: { bigplayer_h5: connector }, credentialContext: { async load() { return {}; } }, ai: {}, alertEngine: {}, leaseOwner: 'worker-4', leaseSeconds: 45, pageBudget: 1, pageSize: 10 }, source);
  assert.deepEqual(lifecycle.map(item => item[0]), ['enqueue', 'claim', 'finish']);
  assert.deepEqual(lifecycle[0][1], { sourceId: 's1', accountId: 'a1', syncMode: 'backfill' });
  assert.equal(lifecycle[1][1].runId, 'sr-new');
  assert.equal(lifecycle[2][1].id, 'sr-new');
  assert.equal(lifecycle[2][1].leaseOwner, 'worker-4');
});
