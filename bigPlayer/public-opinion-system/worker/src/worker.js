const { loadRuntimeEnv } = require('../../server/src/runtimeEnv');
loadRuntimeEnv();

const crypto = require('node:crypto');
const { Repository } = require('../../server/src/db/repository');
const { BigPlayerH5Connector } = require('../../server/src/connectors/bigPlayerH5Connector');
const { buildExternalConnectors } = require('../../server/src/connectors/externalConnectors');
const { normalizeRawContent, flattenCommentTree } = require('../../server/src/connectors/baseConnector');
const { CredentialContext } = require('../../server/src/services/credentialContext');
const { DouyinOAuthService } = require('../../server/src/services/douyinOAuthService');
const { LoginSessionClient } = require('../../server/src/services/loginSessionClient');
const { AuthRefreshCoordinator } = require('../../server/src/services/authRefreshCoordinator');
const { AiAnalyzer } = require('../../server/src/integrations/aiAnalyzer');
const { DingTalkNotifier } = require('../../server/src/integrations/dingTalkNotifier');
const { matchRules } = require('../../server/src/pipeline/ruleEngine');
const { AlertEngine } = require('../../server/src/pipeline/alertEngine');

const SOCIAL_PLATFORMS = new Set(['douyin', 'xiaohongshu']);
const MANUAL_VERIFICATION_CODES = new Set([
  'MANUAL_VERIFICATION_REQUIRED', 'SMS_VERIFICATION_REQUIRED', 'IMAGE_VERIFICATION_REQUIRED',
  'CAPTCHA_REQUIRED', 'QR_CODE_REQUIRED', 'DEVICE_CONFIRMATION_REQUIRED', 'CHALLENGE_REQUIRED'
]);

function first(item, keys, fallback = null) { for (const key of keys) if (item?.[key] != null) return item[key]; return fallback; }
function parseObject(value) { if (!value) return {}; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch { return {}; } }
function errorCode(error) { return error?.code || error?.cause?.code || error?.details?.cause || 'SYNC_STAGE_FAILED'; }
function isSessionExpired(error) { return errorCode(error) === 'SESSION_EXPIRED'; }
function isManualVerification(error) { const code = errorCode(error); return MANUAL_VERIFICATION_CODES.has(code) || /(?:VERIFICATION|CAPTCHA|CHALLENGE|QR_CODE|DEVICE_CONFIRMATION).*REQUIRED/.test(code); }
function isSocialPlatform(platform) { return SOCIAL_PLATFORMS.has(platform); }
function sessionBinding(source, account) { return { sourceId: source.id, accountId: account.id, platform: source.platform }; }
function unwrapSessionRef(value) { return typeof value === 'string' ? value : value?.sessionRef || value?.session_ref || value?.ref || null; }

async function callSessionClient(client, methods, binding) {
  if (!client) { const error = new Error('login session client is required'); error.code = 'LOGIN_SESSION_UNAVAILABLE'; throw error; }
  for (const method of methods) if (typeof client[method] === 'function') {
    const result = await client[method](binding);
    const sessionRef = unwrapSessionRef(result);
    if (sessionRef) return sessionRef;
  }
  const error = new Error(`login session client does not implement ${methods.join('/')}`); error.code = 'LOGIN_SESSION_UNAVAILABLE'; throw error;
}
async function getSessionRef(client, source, account) { return callSessionClient(client, ['getSessionRef', 'getValidSession', 'getSession'], sessionBinding(source, account)); }
async function refreshSessionRef(client, source, account) { return callSessionClient(client, ['refreshSession', 'relogin', 'refresh', 'login'], sessionBinding(source, account)); }

function normalizePlatformItem(raw, { scope, rootPlatformContentId = '', parentPlatformContentId = '' } = {}) {
  const externalId = first(raw, ['externalId', 'external_id', 'id', 'item_id', 'aweme_id', 'cid']);
  if (externalId == null) { const error = new Error('platform item id is required'); error.code = 'MALFORMED_RESPONSE'; throw error; }
  const author = first(raw, ['author', 'user'], {}) || {};
  const title = String(first(raw, ['title', 'desc', 'subject'], '') || '').trim();
  const body = String(first(raw, ['body', 'content', 'text', 'desc'], '') || '').trim();
  const authorName = String(first(raw, ['authorName', 'author_name', 'nickname'], first(author, ['nickname', 'name'], '')) || '').trim();
  const sourceUrl = String(first(raw, ['sourceUrl', 'source_url', 'url', 'share_url'], '') || '').trim();
  const publishedAt = first(raw, ['publishedAt', 'published_at', 'create_time', 'createdAt', 'created_at']);
  const contentType = scope === 'posts' ? (first(raw, ['contentType', 'content_type', 'type'], 'post') === 'video' ? 'video' : 'post') : 'comment';
  const normalized = normalizeRawContent({ externalId: String(externalId), contentType, authorName, title, body, publishedAt: publishedAt && /^\d{10}$/.test(String(publishedAt)) ? Number(publishedAt) * 1000 : publishedAt, sourceUrl: sourceUrl || `urn:${contentType}:${externalId}`, engagement: first(raw, ['engagement', 'statistics', 'stats'], {}) || {} });
  const rootId = scope === 'posts' ? '' : String(rootPlatformContentId || first(raw, ['rootPlatformContentId', 'root_platform_content_id', 'post_id', 'postId'], '') || '');
  const parentId = scope === 'posts' ? null : (first(raw, ['platformParentId', 'platform_parent_id', 'parent_id', 'reply_to_id'], parentPlatformContentId || null) == null ? null : String(first(raw, ['platformParentId', 'platform_parent_id', 'parent_id', 'reply_to_id'], parentPlatformContentId || null)));
  const depth = scope === 'posts' ? 0 : Math.max(1, Number(first(raw, ['contentDepth', 'content_depth', 'depth'], parentId ? 2 : 1)) || 1);
  return {
    ...normalized,
    platformAuthorId: first(raw, ['platformAuthorId', 'platform_author_id', 'author_id', 'uid', 'open_id'], first(author, ['id', 'uid', 'open_id'])),
    platformParentId: parentId,
    rootPlatformContentId: rootId,
    contentDepth: depth,
    isDeleted: Boolean(first(raw, ['isDeleted', 'is_deleted', 'deleted', 'tombstone'], false)), rawPayload: null
  };
}

const SEVERITY_RANK = { normal: 0, attention: 1, urgent: 2 };

// deep 覆盖 light 后，告警判定取最高严重度，避免 deep 模型降级导致 light urgent 漏报。
// 仅对由 light 升级而来的 deep job（trigger_reason 含 light_escalation / keyword_match）适用。
function effectiveAnalysisForAlert(analysis, lightAnalysis) {
  if (!lightAnalysis) return analysis;
  const lightRank = SEVERITY_RANK[lightAnalysis.severity] ?? 0;
  const deepRank = SEVERITY_RANK[analysis?.severity] ?? 0;
  if (lightRank <= deepRank) return analysis;
  return { ...analysis, severity: lightAnalysis.severity, _lightSeverity: lightAnalysis.severity };
}

function shouldDeepAnalyze(analysis, hit = null, options = {}) {
  const negativeThreshold = Number(options.negativeThreshold ?? process.env.AI_ANALYSIS_DEEP_NEGATIVE_THRESHOLD ?? 0.7);
  const confidenceThreshold = Number(options.confidenceThreshold ?? process.env.AI_ANALYSIS_DEEP_LOW_CONFIDENCE_THRESHOLD ?? 0.55);
  return Boolean(hit?.needAI || hit?.matchedKeywords?.length || analysis?.needsDeep
    || ['attention', 'urgent'].includes(analysis?.severity)
    || Number(analysis?.negativeScore) >= negativeThreshold
    || (Number.isFinite(Number(analysis?.confidence)) && Number(analysis.confidence) < confidenceThreshold));
}

function profileSpec(ai, profile) {
  if (typeof ai?.selectProfile === 'function') return ai.selectProfile(profile);
  return { name: profile, version: ai?.profiles?.[profile]?.version || ai?.[`${profile}Version`] || 'sentiment-v2', model: ai?.profiles?.[profile]?.model || '' };
}

function analysisCacheKey(ai, item, profile) {
  const spec = profileSpec(ai, profile);
  const fingerprint = item.content_fingerprint || item.fingerprint;
  if (typeof ai?.cacheKey === 'function') return ai.cacheKey(fingerprint, spec, item);
  const payload = {
    promptSchemaVersion: 'sentiment-quality-context-v2',
    regionCode: item.region_code || item.regionCode || 'legacy-unassigned',
    gameId: item.game_id || item.gameId || 'legacy-unassigned',
    communityId: item.community_id || item.communityId || 'legacy-unassigned',
    platform: item.platform || 'legacy-unassigned',
    fingerprint,
    profile,
    model: spec.model,
    version: spec.version
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function cacheAnalysis(row) {
  return row ? {
    ...row,
    profile: row.profile || row.analysis_profile,
    analysisVersion: row.analysisVersion || row.analysis_version,
    modelName: row.modelName || row.model_name,
    negativeScore: row.negativeScore ?? row.negative_score,
    needsDeep: Boolean(row.needsDeep ?? row.needs_deep),
    topics: parseObject(row.topics) || [],
    matchedKeywords: parseObject(row.matched_keywords) || [],
    qualityScore: Number.isFinite(Number(row.qualityScore ?? row.quality_score)) ? Number(row.qualityScore ?? row.quality_score) : 0,
    recommendHome: (row.recommendHome ?? row.recommend_home) === true || Number(row.recommendHome ?? row.recommend_home) === 1,
    recommendPin: (row.recommendPin ?? row.recommend_pin) === true || Number(row.recommendPin ?? row.recommend_pin) === 1,
    recommendFeature: (row.recommendFeature ?? row.recommend_feature) === true || Number(row.recommendFeature ?? row.recommend_feature) === 1,
    qualityReason: String(row.qualityReason ?? row.quality_reason ?? '')
  } : null;
}

function qualityCandidateOf(analysis) {
  if (!analysis) return null;
  return {
    sentiment: analysis.sentiment || '',
    qualityScore: Number.isFinite(Number(analysis.qualityScore)) ? Number(analysis.qualityScore) : 0,
    recommendHome: analysis.recommendHome === true,
    recommendPin: analysis.recommendPin === true,
    recommendFeature: analysis.recommendFeature === true,
    qualityReason: String(analysis.qualityReason || ''),
    analysisVersion: analysis.analysisVersion || null,
    modelName: analysis.modelName || null,
    contentFingerprint: analysis.contentFingerprint || null
  };
}

async function processPersistentAnalysisJobs(deps, source, entries = [], scope = {}) {
  const repo = deps.repo; const ai = deps.ai;
  if (typeof ai?.configured === 'function' && !ai.configured('light')) return { analyzed: 0, alerted: 0 };
  const requiredMethods = scope.enqueueOnly ? ['enqueueAnalysisJob'] : ['enqueueAnalysisJob', 'claimAnalysisJobs', 'finishAnalysisJob'];
  if (!requiredMethods.every(method => typeof repo[method] === 'function')) return null;
  const sourceRules = source?.game_id && typeof repo.loadKeywordRules === 'function' ? await repo.loadKeywordRules(source.game_id, source.platform, source.community_id) : [];
  const withinScope = entry => {
    if (!scope.publishedFrom && !scope.publishedTo) return true;
    const value = entry.content?.published_at || entry.raw?.publishedAt || entry.raw?.published_at;
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    const from = scope.publishedFrom ? new Date(scope.publishedFrom).getTime() : -Infinity;
    const to = scope.publishedTo ? new Date(scope.publishedTo).getTime() : Infinity;
    return Number.isFinite(timestamp) && timestamp >= from && timestamp < to;
  };
  const changed = entries.filter(entry => entry.change !== 'unchanged' && !entry.content?.is_deleted && withinScope(entry));
  const light = profileSpec(ai, 'light');
  for (const entry of changed) {
    const raw = entry.raw || entry.content; const hit = matchRules({ title: raw.title, body: raw.body, authorName: raw.authorName || raw.author_name }, sourceRules);
    await repo.enqueueAnalysisJob(entry.content.id, { profile: 'light', version: light.version, contentFingerprint: raw.fingerprint, triggerReason: hit.needAI ? 'keyword_match' : 'all_content', matchedKeywords: hit.matchedKeywords || [] });
  }
  if (scope.enqueueOnly) return { analyzed: 0, alerted: 0, enqueued: changed.length };
  let analyzed = 0; let alerted = 0;
  const game = { id: source?.game_id || null, name: source?.game_name || source?.display_name || null, region_code: source?.region_code || null, community_id: source?.community_id || null, dingtalk_webhook_ref: source?.dingtalk_webhook_ref || null };
  for (const profile of ['light', 'deep']) {
    const spec = profileSpec(ai, profile);
    const claimedJobs = await repo.claimAnalysisJobs({
      profile,
      version: spec.version,
      leaseOwner: deps.leaseOwner,
      leaseSeconds: deps.leaseSeconds,
      limit: deps.analysisJobBatchSize || 100,
      sourceId: source?.id,
      accountId: source?.account_id,
      gameId: source?.game_id,
      communityId: source?.community_id,
      publishedFrom: scope.publishedFrom,
      publishedTo: scope.publishedTo
    });
    const jobs = Array.isArray(claimedJobs) ? claimedJobs : [];
    if (!jobs.length) continue;
    const cached = typeof repo.getAnalysisCache === 'function' ? await repo.getAnalysisCache(jobs.map(job => analysisCacheKey(ai, job, profile))) : [];
    const cacheByKey = new Map(cached.map(row => [row.cache_key || row.cacheKey, cacheAnalysis(row)]));
    const pending = []; const results = new Array(jobs.length);
    jobs.forEach((job, index) => { const hit = cacheByKey.get(analysisCacheKey(ai, job, profile)); if (hit) results[index] = hit; else pending.push({ job, index }); });
    try {
      if (pending.length) {
        const analyses = await ai.analyzeBatch(pending.map(({ job }) => ({ title: job.title, body: job.body, platform: job.platform, fingerprint: job.fingerprint, gameId: job.game_id, gameName: job.game_name, communityId: job.community_id, communityName: job.community_name, regionCode: job.region_code })), profile);
        pending.forEach(({ index }, i) => { results[index] = analyses[i]; });
      }
      for (let index = 0; index < jobs.length; index += 1) {
        const job = jobs[index]; const raw = job; const cachedAnalysis = cacheAnalysis(job); const analysis = { ...results[index], analysisLevel: profile, profile, analysisVersion: results[index]?.analysisVersion || spec.version, contentFingerprint: job.content_fingerprint || job.fingerprint, triggerReason: job.trigger_reason || null, matchedKeywords: cachedAnalysis?.matchedKeywords || parseObject(job.matched_keywords) || [] };
        const escalatedFromLight = profile === 'deep' && ['light_escalation', 'keyword_match'].includes(job.trigger_reason);
        const lightAnalysis = escalatedFromLight && typeof repo.getLightAnalysis === 'function' ? await repo.getLightAnalysis(job.content_id) : null;
        if (typeof repo.insertAnalysis === 'function') await repo.insertAnalysis(job.content_id, analysis);
        if (typeof repo.upsertAnalysisCache === 'function' && !cacheByKey.has(analysisCacheKey(ai, job, profile))) await repo.upsertAnalysisCache({ ...analysis, cacheKey: analysisCacheKey(ai, job, profile), contentFingerprint: analysis.contentFingerprint, profile, version: analysis.analysisVersion, usage: { inputTokens: analysis.inputTokens, outputTokens: analysis.outputTokens, totalTokens: analysis.totalTokens, estimated: analysis.usageEstimated } });
        const qualityCandidate = profile === 'deep' ? qualityCandidateOf(analysis) : null;
        if (qualityCandidate && typeof repo.upsertQualityCandidate === 'function') await repo.upsertQualityCandidate(job.content_id, { ...qualityCandidate, body: job.body });
        await repo.finishAnalysisJob(job.id, { leaseOwner: job.lease_owner || deps.leaseOwner, status: 'completed' }); analyzed += 1;
        const jobRules = source?.game_id ? sourceRules : (typeof repo.loadKeywordRules === 'function' ? await repo.loadKeywordRules(job.game_id, job.platform, job.community_id) : []);
        const hit = matchRules({ title: raw.title, body: raw.body, authorName: raw.author_name || raw.authorName }, jobRules);
        const promoted = profile === 'light' && shouldDeepAnalyze(analysis, hit);
        if (promoted && (typeof ai?.configured !== 'function' || ai.configured('deep'))) await repo.enqueueAnalysisJob(job.content_id, { profile: 'deep', version: profileSpec(ai, 'deep').version, contentFingerprint: analysis.contentFingerprint, triggerReason: hit.matchedKeywords?.length ? 'keyword_match' : 'light_escalation', matchedKeywords: hit.matchedKeywords || analysis.matchedKeywords });
        if (!promoted) {
          const alertAnalysis = effectiveAnalysisForAlert(analysis, lightAnalysis);
          // 注意 ...raw 放前面：raw（=job 行）的 id 是 job id，若放在后会覆盖正确的 content id，
          // 导致 po_alert_contents 的 FK 静默失败（INSERT IGNORE 吞错），告警丢失关联内容。
          const created = hit.needAI && (source?.game_id || job.game_id) ? await deps.alertEngine.process({ game: source?.game_id ? game : { id: job.game_id, name: job.game_name || job.platform, region_code: job.region_code, community_id: job.community_id, dingtalk_webhook_ref: null }, content: { ...raw, id: job.content_id, community_id: job.community_id }, hit, analysis: alertAnalysis }) : (alertAnalysis.severity === 'urgent' && job.game_id && typeof deps.alertEngine.processAiUrgent === 'function' ? await deps.alertEngine.processAiUrgent({ game: { id: job.game_id, name: raw.game_name || raw.platform, region_code: job.region_code, community_id: job.community_id, dingtalk_webhook_ref: null }, content: { ...raw, id: job.content_id, community_id: job.community_id }, analysis: alertAnalysis }) : []);
          alerted += created.filter(item => !item.reused).length;
        }
      }
    } catch (error) {
      for (const job of jobs) { const attempts = Number(job.attempts || 1); const status = attempts >= (deps.analysisMaxAttempts || 3) ? 'failed' : 'retryable'; const retryAt = status === 'retryable' ? new Date(Date.now() + (deps.analysisRetryBaseMs || 1000) * 2 ** Math.max(0, attempts - 1)) : null; await repo.finishAnalysisJob(job.id, { leaseOwner: job.lease_owner || deps.leaseOwner, status, errorCode: errorCode(error), errorMessage: error?.message || 'analysis job failed', retryAt }); }
    }
  }
  return { analyzed, alerted };
}

async function processAnalysisBacklog(deps) {
  if (!deps.ai?.configured?.('light')) return { analyzed: 0, alerted: 0, skipped: true };
  return processPersistentAnalysisJobs(deps, null, []);
}
async function enqueueDailyAnalysis(deps, source, entries, scope = {}) {
  const result = await processPersistentAnalysisJobs(deps, source, entries, { ...scope, enqueueOnly: true });
  return result || { analyzed: 0, alerted: 0, enqueued: 0, skipped: true };
}
async function processDownstream(deps, source, entries, scope = {}) {
  const persistent = await processPersistentAnalysisJobs(deps, source, entries, scope);
  if (persistent) return persistent;
  const inWindow = entry => {
    if (!scope.publishedFrom && !scope.publishedTo) return true;
    const value = entry.content?.published_at || entry.raw?.publishedAt || entry.raw?.published_at;
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    const from = scope.publishedFrom ? new Date(scope.publishedFrom).getTime() : -Infinity;
    const to = scope.publishedTo ? new Date(scope.publishedTo).getTime() : Infinity;
    return Number.isFinite(timestamp) && timestamp >= from && timestamp < to;
  };
  const changed = entries.filter(entry => entry.change !== 'unchanged' && !entry.content?.is_deleted && inWindow(entry));
  if (!changed.length) return { analyzed: 0, alerted: 0 };
  const rules = typeof deps.repo.loadKeywordRules === 'function' ? await deps.repo.loadKeywordRules(source.game_id, source.platform, source.community_id) : []; const queue = [];
  for (const entry of changed) { const raw = entry.raw || entry.content; const hit = matchRules({ title: raw.title, body: raw.body, authorName: raw.authorName || raw.author_name }, rules); if (hit.needAI) queue.push({ ...entry, raw, hit }); }
  if (!queue.length) return { analyzed: 0, alerted: 0 };
  const analyses = await deps.ai.analyzeBatch(queue.map(({ raw }) => ({ title: raw.title, body: raw.body, platform: source.platform, fingerprint: raw.fingerprint, regionCode: source.region_code, gameId: source.game_id, gameName: source.game_name, communityId: source.community_id, communityName: source.community_name })));
  const game = { id: source.game_id, name: source.game_name || source.display_name, region_code: source.region_code, community_id: source.community_id, dingtalk_webhook_ref: source.dingtalk_webhook_ref }; let alerted = 0;
  for (let index = 0; index < queue.length; index += 1) { const { content, hit } = queue[index]; const analysis = analyses[index]; await deps.repo.insertAnalysis(content.id, { ...analysis, triggerReason: 'keyword_match', matchedKeywords: hit.matchedKeywords }); const created = await deps.alertEngine.process({ game, content, hit, analysis }); alerted += created.filter(item => !item.reused).length; }
  return { analyzed: queue.length, alerted };
}

async function checkAuthorization(repo, source, connector, { account, credentialContext, loginSessionClient } = {}) {
  let health; let sessionRef = null;
  if (account) {
    const installation = typeof connector.installationHealth === 'function' ? await connector.installationHealth(source) : { installed: true, configured: true };
    if (!installation.installed && !installation.configured) health = { configured: false, reason: installation.reason };
    else {
      try {
        if (isSocialPlatform(source.platform)) sessionRef = await getSessionRef(loginSessionClient, source, account);
        else if (source.platform === 'taptap') health = { configured: true, reason: 'no-login web API' }; // 免登采集：健康即可，无凭据
        else {
          if (!credentialContext) { const error = new Error('credential context is required'); error.code = 'CREDENTIAL_CONTEXT_REQUIRED'; throw error; }
          await credentialContext.load(account, source.platform === 'douyin' ? 'oauth_access_refresh' : 'api_token');
        }
        health = { configured: true };
      } catch (error) { health = { configured: false, reason: errorCode(error) }; }
    }
    if (typeof repo.updateAccount === 'function') await repo.updateAccount(account.id, { authStatus: health.configured ? 'authorized' : (isManualVerification({ code: health.reason }) ? 'awaiting_manual_verification' : 'unauthorized') });
  } else health = await connector.healthCheck(source);
  await repo.updateSourceAuth(source.id, { authStatus: health.configured ? 'authorized' : 'unauthorized' });
  return health.configured ? { authorized: true, sessionRef } : { authorized: false, reason: health.reason || 'credentials required' };
}

async function runLegacySource(deps, source, connector, run) {
  const gate = await checkAuthorization(deps.repo, source, connector); if (!gate.authorized) return deps.repo.finishRun(run.id, { status: 'failed', errorCode: 'UNAUTHORIZED', errorMessage: gate.reason });
  try {
    const rawItems = await connector.collect({ source }); const entries = [];
    for (const raw of rawItems) { const content = await deps.repo.insertContent(source, raw); if (content) entries.push({ content, raw, change: 'inserted' }); }
    const downstream = await processDownstream(deps, source, entries);
    await deps.repo.finishRun(run.id, { status: 'success', discoveredCount: rawItems.length, storedCount: entries.length, analyzedCount: downstream.analyzed, alertedCount: downstream.alerted }); await deps.repo.markSourceRun(source.id, { status: 'success' });
  } catch (error) { await deps.repo.finishRun(run.id, { status: 'failed', errorCode: errorCode(error) || 'COLLECTION_FAILED', errorMessage: error.message }); await deps.repo.markSourceRun(source.id, { status: 'failed', errorCode: errorCode(error), errorMessage: error.message }); }
}

function stageIdentity({ scope, rootPlatformContentId, taskKind, taskKey }) {
  if (taskKind === 'keyword_search') return { syncScope: 'posts', checkpointRoot: `keyword:${taskKey}` };
  return { syncScope: scope, checkpointRoot: rootPlatformContentId };
}
async function invokePage(connector, scope, input, taskKind) {
  if (taskKind === 'keyword_search') return connector.searchContents(input);
  if (taskKind === 'q1_feed' && typeof connector.listFeedContents === 'function') return connector.listFeedContents(input);
  if (scope === 'posts') return (typeof connector.listOwnedContents === 'function' ? connector.listOwnedContents(input) : connector.listPosts(input));
  if (scope === 'comments') return connector.listComments(input);
  throw new Error('HISTORICAL_REPLY_SCOPE_UNSUPPORTED');
}

function assertDeadline(deps) {
  if (deps?.deadlineAt != null && Date.now() >= deps.deadlineAt) {
    const error = new Error('daily run timed out before the next operation');
    error.code = 'DAILY_RUN_TIMEOUT';
    throw error;
  }
}

function withTimeout(operation, timeoutMs, code) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return operation;
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`operation timed out after ${timeoutMs}ms`);
      error.code = code;
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

function invokePageWithTimeout(connector, scope, input, taskKind, timeoutMs) {
  return withTimeout(invokePage(connector, scope, input, taskKind), timeoutMs, 'SYNC_PAGE_TIMEOUT');
}

function createCommitLane() {
  let tail = Promise.resolve();
  let closed = false;
  return {
    submit(operation) {
      if (closed) { const error = new Error('commit lane is closed'); error.code = 'COMMIT_LANE_CLOSED'; return Promise.reject(error); }
      const result = tail.then(() => operation());
      tail = result.catch(() => {});
      return result;
    },
    drain() { return tail; },
    close() { closed = true; }
  };
}

async function syncStagePage(deps, stage) {
  assertDeadline(deps);
  const requestCursor = stage.cursor;
  const { source, account, connector, credential, scope, rootPlatformContentId, postPlatformId, historyStart, taskKind, taskKey, keyword, feed, commentId, sortType } = stage;
  const collectionWindow = deps.collectionWindow || {};
  const input = { source, account, credentialContext: credential, sessionRef: stage.activeSessionRef, cursor: requestCursor, limit: deps.pageSize, historyStart, updatedSince: stage.effectiveUpdatedSince, publishedFrom: collectionWindow.publishedFrom, publishedTo: collectionWindow.publishedTo, dailyBounded: Boolean(collectionWindow.dailyBounded), keyword, postId: rootPlatformContentId, rootContentId: rootPlatformContentId, commentId, parentCommentId: commentId, sortType, taskKind, taskKey, feed, ...(feed || {}) };
  let page;
  try { page = await invokePageWithTimeout(connector, scope, input, taskKind, deps.pageTimeoutMs); }
  catch (error) {
    if (!isSessionExpired(error) || !isSocialPlatform(source.platform)) throw error;
    stage.activeSessionRef = await refreshSessionRef(deps.loginSessionClient, source, account);
    page = await invokePageWithTimeout(connector, scope, { ...input, sessionRef: stage.activeSessionRef }, taskKind, deps.pageTimeoutMs);
  }
  if (!page || !Array.isArray(page.items) || typeof page.hasMore !== 'boolean') { const error = new Error('connector page result is malformed'); error.code = 'MALFORMED_RESPONSE'; throw error; }
  if (page.hasMore && (page.nextCursor == null || String(page.nextCursor) === String(requestCursor ?? ''))) { const error = new Error('pagination cursor did not advance'); error.code = 'MALFORMED_RESPONSE'; throw error; }
  const replyTargets = [];
  if (Array.isArray(page.replyTargets)) for (const target of page.replyTargets) {
    const targetCommentId = String(target?.commentId || '').trim();
    if (targetCommentId) replyTargets.push({ postId: String(target.postId || rootPlatformContentId || postPlatformId), commentId: targetCommentId, sortType: Number(target.sortType || 0) });
  }
  const sourceItems = scope === 'comments' ? flattenCommentTree(page.items, { rootPlatformContentId: rootPlatformContentId || postPlatformId }) : page.items;
  const normalized = sourceItems.map(raw => normalizePlatformItem(raw, { scope, rootPlatformContentId: scope === 'comments' ? (rootPlatformContentId || postPlatformId) : '', parentPlatformContentId: null }));
  const upsertInput = { account, source, syncScope: stage.syncScope, rootPlatformContentId: stage.checkpointRoot, items: normalized, nextCursor: page.nextCursor, hasMore: page.hasMore, syncMode: stage.syncMode, syncRunId: stage.syncRunId, taskKind, taskKey, feed, checkpointId: stage.checkpoint.id, leaseOwner: deps.leaseOwner, leaseSeconds: deps.leaseSeconds, lastItemAt: page.platformWatermark || null };
  // A fetch that finishes at or after the daily deadline must not advance its checkpoint.
  assertDeadline(deps);
  const commit = () => deps.repo.upsertContentPage(upsertInput);
  const committed = deps.commitLane ? await deps.commitLane.submit(commit) : await commit();
  const entries = (committed.contents || []).map((entry, index) => entry?.content ? { ...entry, raw: normalized[index] } : { content: entry, raw: normalized[index], change: 'changed' });
  stage.cursor = page.nextCursor;
  return { discovered: normalized.length, stored: Number(committed.storedCount || entries.filter(entry => entry.change !== 'unchanged').length), entries, capability: page.capability || stage.capability, completed: !page.hasMore, replyTargets, requestCursor, nextCursor: page.nextCursor };
}

async function syncStage(deps, { source, account, connector, credential, sessionRef = null, scope, rootPlatformContentId = '', syncMode, syncRunId = null, postPlatformId = '', historyStart = null, updatedSince = null, taskKind, taskKey, keyword = null, feed = null, commentId = null, sortType = 0, onPageCommitted = null }) {
  taskKind ||= scope === 'posts' ? 'owned_content' : scope;
  taskKey ||= rootPlatformContentId || (scope === 'posts' ? 'owned' : 'root');
  const { syncScope, checkpointRoot } = stageIdentity({ scope, rootPlatformContentId, taskKind, taskKey });
  const checkpoint = await deps.repo.claimSyncCheckpoint({ accountId: account.id, syncScope, rootPlatformContentId: checkpointRoot, syncMode, taskKind, taskKey, leaseOwner: deps.leaseOwner, leaseSeconds: deps.leaseSeconds });
  if (!checkpoint) return { discovered: 0, stored: 0, entries: [], capability: 'authorized_scope', skipped: true };
  const stage = { source, account, connector, credential, activeSessionRef: sessionRef, scope, rootPlatformContentId, postPlatformId, historyStart, syncMode, syncRunId, taskKind, taskKey, keyword, feed, commentId, sortType, syncScope, checkpointRoot, checkpoint, cursor: checkpoint.cursor ?? null, capability: 'authorized_scope', effectiveUpdatedSince: updatedSince || first(checkpoint, ['last_item_at', 'lastItemAt'], first(account, ['last_incremental_sync_at', 'lastIncrementalSyncAt'])) };
  let discovered = 0; let stored = 0; let completed = false; const entries = []; const replyTargets = [];
  try {
    for (let pageNo = 0; pageNo < deps.pageBudget; pageNo += 1) {
      const result = await syncStagePage(deps, stage);
      stage.capability = result.capability; entries.push(...result.entries); replyTargets.push(...result.replyTargets); discovered += result.discovered; stored += result.stored;
      if (onPageCommitted) await onPageCommitted(result);
      if (result.completed) { completed = true; break; }
      if (pageNo === deps.pageBudget - 1) await deps.repo.releaseSyncCheckpoint(checkpoint.id, { status: 'idle', cursor: stage.cursor, leaseOwner: deps.leaseOwner });
    }
    return { discovered, stored, entries, capability: stage.capability, completed, replyTargets };
  } catch (error) {
    const code = errorCode(error); const unsupported = code === 'CAPABILITY_UNSUPPORTED'; const manual = isManualVerification(error);
    await deps.repo.releaseSyncCheckpoint(checkpoint.id, { status: manual ? 'awaiting_manual_verification' : unsupported ? 'unsupported' : 'failed', cursor: stage.cursor, itemsFetched: discovered, errorCode: code, errorMessage: error.message, taskKind, taskKey, leaseOwner: deps.leaseOwner });
    if (unsupported) return { discovered, stored, entries, capability: 'unsupported', unsupported: true };
    throw error;
  }
}

function createTaskScheduler(limit, onError = null) {
  const concurrency = Math.max(1, Number(limit) || 1);
  const queue = [];
  const idleWaiters = [];
  let active = 0;
  const settleIdle = () => {
    if (active || queue.length) return;
    while (idleWaiters.length) idleWaiters.shift()();
  };
  const pump = () => {
    while (active < concurrency && queue.length) {
      const operation = queue.shift(); active += 1;
      Promise.resolve().then(operation).catch(error => onError?.(error)).finally(() => { active -= 1; pump(); settleIdle(); });
    }
    settleIdle();
  };
  return {
    add(operation) { queue.push(operation); pump(); },
    idle() { return active || queue.length ? new Promise(resolve => idleWaiters.push(resolve)) : Promise.resolve(); },
    stats() { return { queued: queue.length, active, concurrency }; }
  };
}

function validKeywordRules(rules) { return (rules || []).filter(rule => rule && rule.enabled !== false && Number(rule.enabled) !== 0 && String(rule.keyword || '').trim()); }
async function drainAndCloseCommitLane(commitLane) {
  if (!commitLane) return;
  await commitLane.drain();
  commitLane.close();
}
async function finishPagedFailure(deps, source, run, syncRun, counts, error, commitLane = null) {
  await drainAndCloseCommitLane(commitLane);
  const code = errorCode(error); const manual = isManualVerification(error); const timedOut = code === 'DAILY_RUN_TIMEOUT'; const status = manual ? 'awaiting_manual_verification' : timedOut ? 'partial' : 'failed';
  await deps.repo.finishSyncRun(syncRun.id, { status, discoveredCount: counts.discovered, storedCount: counts.stored, errorCode: code, errorMessage: error.message, leaseOwner: deps.leaseOwner });
  await deps.repo.finishRun(run.id, { status, discoveredCount: counts.discovered, storedCount: counts.stored, analyzedCount: counts.analyzed, alertedCount: counts.alerted, errorCode: code, errorMessage: error.message });
  await deps.repo.markSourceRun(source.id, { status: timedOut ? 'partial' : 'failed', errorCode: code, errorMessage: manual ? `awaiting_manual_verification: ${error.message}` : error.message });
  if (manual && typeof deps.repo.updateSourceAuth === 'function') await deps.repo.updateSourceAuth(source.id, { authStatus: 'awaiting_manual_verification' });
}

async function runDailyQ1Collection(deps, context) {
  const { source, connector, account, syncRun, credential, sessionRef, syncMode, historyStart, commentPageBudget, commentsSupported, isInCollectionWindow, recordPage, recordStageResult, failStage } = context;
  const feeds = await connector.discoverFeeds({ source, account, credentialContext: credential });
  if (!Array.isArray(feeds) || !feeds.length) { const error = new Error('Q1 board schema did not expose any feeds'); error.code = 'MALFORMED_RESPONSE'; throw error; }
  const feedKeys = new Set();
  for (const feed of feeds) { const key = String(feed.feedKey || '').trim(); if (!key || feedKeys.has(key)) { const error = new Error('Q1 feed descriptor has an empty or duplicate feedKey'); error.code = 'MALFORMED_RESPONSE'; throw error; } feedKeys.add(key); }
  const seenComments = new Set(); const seenReplies = new Set(); let fatalError = null;
  const capture = error => { fatalError ||= error; };
  const feedScheduler = createTaskScheduler(deps.dailyFeedFetchConcurrency ?? process.env.DAILY_FEED_FETCH_CONCURRENCY ?? 4, capture);
  const commentScheduler = createTaskScheduler(deps.dailyCommentFetchConcurrency ?? process.env.DAILY_COMMENT_FETCH_CONCURRENCY ?? 4, capture);
  const replyScheduler = createTaskScheduler(deps.dailyReplyFetchConcurrency ?? process.env.DAILY_REPLY_FETCH_CONCURRENCY ?? 4, capture);
  const stageDeps = { ...deps, commitLane: deps.commitLane };

  const scheduleReply = target => {
    const key = `${target.postId}:${target.commentId}:${target.sortType || 0}`;
    if (seenReplies.has(key)) return; seenReplies.add(key);
    const runTask = async () => {
      assertDeadline(deps);
      const replyTaskKey = `reply:${target.commentId}:${target.sortType || 0}`;
      try {
        const result = await syncStage({ ...stageDeps, pageBudget: Math.min(deps.pageBudget, commentPageBudget) }, { source, account, connector, credential, sessionRef, scope: 'comments', rootPlatformContentId: target.postId, postPlatformId: target.postId, commentId: target.commentId, sortType: target.sortType || 0, syncMode, syncRunId: syncRun.id, historyStart, taskKind: 'q1_reply', taskKey: replyTaskKey, onPageCommitted: recordPage });
        if (!result.completed && !result.skipped && !result.unsupported) replyScheduler.add(runTask);
        else recordStageResult(result);
        if (result.unsupported) failStage('q1_reply', replyTaskKey, Object.assign(new Error('reply capability unsupported'), { code: 'CAPABILITY_UNSUPPORTED' }));
      } catch (error) { if (isManualVerification(error) || errorCode(error) === 'DAILY_RUN_TIMEOUT') throw error; failStage('q1_reply', replyTaskKey, error); }
    };
    replyScheduler.add(runTask);
  };
  const scheduleComments = postId => {
    if (!commentsSupported || !postId || seenComments.has(postId)) return; seenComments.add(postId);
    const runTask = async () => {
      assertDeadline(deps);
      try {
        const result = await syncStage({ ...stageDeps, pageBudget: Math.min(deps.pageBudget, commentPageBudget) }, { source, account, connector, credential, sessionRef, scope: 'comments', rootPlatformContentId: postId, postPlatformId: postId, syncMode, syncRunId: syncRun.id, historyStart, taskKind: 'comments', taskKey: postId, onPageCommitted: async page => { await recordPage(page); for (const target of page.replyTargets || []) scheduleReply(target); } });
        if (!result.completed && !result.skipped && !result.unsupported) commentScheduler.add(runTask);
        else recordStageResult(result);
        if (result.unsupported) failStage('comments', postId, Object.assign(new Error('comment capability unsupported'), { code: 'CAPABILITY_UNSUPPORTED' }));
      } catch (error) { if (isManualVerification(error) || errorCode(error) === 'DAILY_RUN_TIMEOUT') throw error; failStage('comments', postId, error); }
    };
    commentScheduler.add(runTask);
  };
  const scheduleFeed = feed => {
    const feedKey = String(feed.feedKey).trim();
    const runTask = async () => {
      assertDeadline(deps);
      try {
        const result = await syncStage(stageDeps, { source, account, connector, credential, sessionRef, scope: 'posts', syncMode, syncRunId: syncRun.id, historyStart, taskKind: 'q1_feed', taskKey: feedKey, feed, onPageCommitted: async page => {
          await recordPage(page);
          for (const entry of page.entries || []) if (entry.change !== 'unchanged' && isInCollectionWindow(entry)) scheduleComments(String(entry.raw?.externalId || '').trim());
        } });
        if (!result.completed && !result.skipped && !result.unsupported) feedScheduler.add(runTask);
        else recordStageResult(result);
        if (result.unsupported) failStage('q1_feed', feedKey, Object.assign(new Error('feed capability unsupported'), { code: 'CAPABILITY_UNSUPPORTED' }));
      } catch (error) { if (isManualVerification(error) || errorCode(error) === 'DAILY_RUN_TIMEOUT') throw error; failStage('q1_feed', feedKey, error); }
    };
    feedScheduler.add(runTask);
  };
  feeds.forEach(scheduleFeed);
  await feedScheduler.idle(); await commentScheduler.idle(); await replyScheduler.idle();
  if (fatalError) throw fatalError;
}

async function runPagedSourceUnlocked(deps, source, connector, run, account, syncRun) {
  const metadata = parseObject(account.metadata); const syncMode = syncModeOf(source, account, syncRun); const historyStart = metadata.historyStart || metadata.history_start || null;
  const collectionWindow = deps.collectionWindow || {};
  const dailyBounded = Boolean(collectionWindow.dailyBounded);
  const publishedFromMs = collectionWindow.publishedFrom == null ? -Infinity : new Date(collectionWindow.publishedFrom).getTime();
  const publishedToMs = collectionWindow.publishedTo == null ? Infinity : new Date(collectionWindow.publishedTo).getTime();
  const isInCollectionWindow = entry => {
    const publishedAt = entry?.raw?.publishedAt || entry?.content?.published_at;
    const timestamp = publishedAt == null ? NaN : new Date(publishedAt).getTime();
    return Number.isFinite(timestamp) && timestamp >= publishedFromMs && timestamp < publishedToMs;
  };
  const commentParentLimit = Math.max(1, Number(deps.commentParentLimit || process.env.DAILY_COMMENT_PARENT_LIMIT || 100));
  const commentPageBudget = Math.max(1, Number(deps.commentPageBudget || process.env.DAILY_COMMENT_PAGE_BUDGET || deps.pageBudget));
  const analysisScope = deps.analysisScope || {};
  const commitLane = dailyBounded ? (deps.commitLane || createCommitLane()) : null;
  const sourceDeps = commitLane ? { ...deps, commitLane } : deps;
  const counts = { discovered: 0, stored: 0, analyzed: 0, alerted: 0 }; let incomplete = false; const diagnostics = []; const capabilities = []; const replyTargets = new Map();
  const record = async (result, trackCompletion = true) => {
    counts.discovered += result.discovered; counts.stored += result.stored; capabilities.push(result.capability);
    const downstream = dailyBounded ? await enqueueDailyAnalysis(sourceDeps, source, result.entries, analysisScope) : await processDownstream(sourceDeps, source, result.entries, analysisScope); counts.analyzed += downstream.analyzed; counts.alerted += downstream.alerted;
    for (const target of result.replyTargets || []) replyTargets.set(`${target.postId}:${target.commentId}:${target.sortType || 0}`, target);
    if (trackCompletion && (result.unsupported || (!result.completed && !result.skipped))) incomplete = true;
    return result;
  };
  const recordPage = result => record(result, false);
  const recordStageResult = result => {
    if (result.unsupported || (!result.completed && !result.skipped)) incomplete = true;
    return result;
  };
  const failStage = (scope, rootId, error) => { incomplete = true; diagnostics.push({ scope, rootId, code: errorCode(error), message: error.message }); };
  const immediateCommentPosts = new Set();
  let gate = null;
  let credential = null;
  const syncCommentsForPosts = async entries => {
    const postIds = [...new Set((entries || []).map(entry => String(entry?.raw?.externalId || entry?.externalId || '').trim()).filter(Boolean))];
    if (!postIds.length || (typeof connector.hasSourceCapability === 'function' && !connector.hasSourceCapability('comments', source))) return;
    const syncOne = async postId => {
      immediateCommentPosts.add(postId);
      try {
        await record(await syncStage({ ...deps, pageBudget: Math.min(deps.pageBudget, commentPageBudget) }, { source, account, connector, credential, sessionRef: gate.sessionRef, scope: 'comments', rootPlatformContentId: postId, postPlatformId: postId, syncMode, syncRunId: syncRun.id, historyStart, taskKind: 'comments', taskKey: postId }));
      } catch (error) {
        if (isManualVerification(error)) throw error;
        failStage('comments', postId, error);
      }
    };
    await runBounded(postIds, Number(process.env.SYNC_COMMENT_CONCURRENCY || 8), syncOne);
  };
  try {
    gate = await checkAuthorization(deps.repo, source, connector, { account, credentialContext: deps.credentialContext, loginSessionClient: deps.loginSessionClient });
    if (!gate.authorized) { const error = new Error(gate.reason || 'credentials required'); error.code = gate.reason || 'UNAUTHORIZED'; throw error; }
    // TapTap 免登采集：无需凭据，直接通过连接器健康检查。
    credential = source.platform === 'taptap' ? null : (isSocialPlatform(source.platform) ? null : await deps.credentialContext.load(account, 'api_token'));
    let posts = { discovered: 0, stored: 0, entries: [], capability: 'authorized_scope', completed: true, replyTargets: [] };
    const commentsSupported = typeof connector.hasSourceCapability !== 'function' || connector.hasSourceCapability('comments', source);
    const usesDailyQ1Scheduler = dailyBounded && source.platform === 'bigplayer_h5' && typeof connector.discoverFeeds === 'function' && typeof connector.listFeedContents === 'function';
    if (usesDailyQ1Scheduler) {
      await runDailyQ1Collection(sourceDeps, { source, connector, account, syncRun, credential, sessionRef: gate.sessionRef, syncMode, historyStart, commentPageBudget, commentsSupported, isInCollectionWindow, recordPage, recordStageResult, failStage });
    } else if (source.platform === 'bigplayer_h5' && typeof connector.discoverFeeds === 'function' && typeof connector.listFeedContents === 'function') {
      const feeds = await connector.discoverFeeds({ source, account, credentialContext: credential });
      if (!Array.isArray(feeds) || !feeds.length) { const error = new Error('Q1 board schema did not expose any feeds'); error.code = 'MALFORMED_RESPONSE'; throw error; }
      const feedKeys = new Set();
      for (const feed of feeds) {
        const feedKey = String(feed.feedKey || '').trim();
        if (!feedKey || feedKeys.has(feedKey)) { const error = new Error('Q1 feed descriptor has an empty or duplicate feedKey'); error.code = 'MALFORMED_RESPONSE'; throw error; }
        feedKeys.add(feedKey);
      }
      const feedConcurrency = Math.max(1, Number(process.env.SYNC_FEED_CONCURRENCY || 1));
      let pendingFeeds = feeds;
      for (let pass = 0; pendingFeeds.length && pass < 1000; pass += 1) {
        const nextPending = [];
        let progressed = false;
        await runBounded(pendingFeeds, feedConcurrency, async feed => {
          assertDeadline(deps);
          const feedKey = String(feed.feedKey).trim();
          try {
            const result = await syncStage(deps, { source, account, connector, credential, sessionRef: gate.sessionRef, scope: 'posts', syncMode, syncRunId: syncRun.id, historyStart, taskKind: 'q1_feed', taskKey: feedKey, feed });
            await record(result);
            posts.discovered += result.discovered; posts.stored += result.stored; posts.entries.push(...result.entries); posts.completed = posts.completed && Boolean(result.completed); posts.capability = result.capability || posts.capability;
            progressed = progressed || result.discovered > 0 || result.completed || result.skipped;
            if (!result.completed) nextPending.push(feed);
          } catch (error) { if (isManualVerification(error)) throw error; failStage('q1_feed', feedKey, error); nextPending.push(feed); }
        });
        if (!nextPending.length || !progressed) break;
        pendingFeeds = nextPending;
      }
    } else {
      posts = await syncStage(sourceDeps, { source, account, connector, credential, sessionRef: gate.sessionRef, scope: 'posts', syncMode, syncRunId: syncRun.id, historyStart, taskKind: 'owned_content', taskKey: 'owned' }); await record(posts);
    }
    if (typeof deps.repo.loadKeywordRules === 'function' && typeof connector.searchContents === 'function') {
      const rules = validKeywordRules(await deps.repo.loadKeywordRules(source.game_id, source.platform, source.community_id));
      for (const rule of rules) {
        assertDeadline(deps);
        const key = String(rule.id || rule.rule_id || rule.keyword).trim();
        try { await record(await syncStage(sourceDeps, { source, account, connector, credential, sessionRef: gate.sessionRef, scope: 'posts', syncMode, syncRunId: syncRun.id, historyStart, taskKind: 'keyword_search', taskKey: key, keyword: String(rule.keyword).trim() })); }
        catch (error) { if (isManualVerification(error)) throw error; failStage('keyword_search', key, error); }
      }
    }
    if (commentsSupported && !usesDailyQ1Scheduler) {
      const freshPosts = posts.entries.filter(entry => entry.change !== 'unchanged' && entry.content?.content_type === 'post' && entry.raw?.publishedAt && (!dailyBounded || isInCollectionWindow(entry)));
      const freshPostIds = new Set(freshPosts.map(entry => String(entry.raw.externalId)).filter(Boolean));
      const commentParents = dailyBounded
        ? []
        : typeof deps.repo.listSyncParents === 'function'
          ? await deps.repo.listSyncParents(account.id, 'comments', { includeCompleted: Boolean(deps.refreshAllComments), includeFailed: true, limit: commentParentLimit })
          : [];
      const candidateParents = [...freshPosts.map(entry => ({ post_platform_id: entry.raw.externalId, root_platform_content_id: entry.raw.externalId })), ...commentParents];
      const seenPosts = new Set();
      const pendingCommentParents = candidateParents.filter(parent => {
        const postId = String(parent.post_platform_id || parent.root_platform_content_id || '').trim();
        if (!postId || seenPosts.has(postId) || immediateCommentPosts.has(postId)) return false;
        seenPosts.add(postId);
        return true;
      });
      const commentConcurrency = dailyBounded
        ? Math.max(1, Number(sourceDeps.dailyCommentFetchConcurrency ?? process.env.DAILY_COMMENT_FETCH_CONCURRENCY ?? 4))
        : Number(process.env.SYNC_COMMENT_CONCURRENCY || 8);
      await runBounded(pendingCommentParents.slice(0, commentParentLimit), commentConcurrency, async parent => {
        const postId = String(parent.post_platform_id || parent.root_platform_content_id || '').trim();
        try {
          assertDeadline(deps);
          await record(await syncStage({ ...sourceDeps, pageBudget: Math.min(deps.pageBudget, commentPageBudget) }, { source, account, connector, credential, sessionRef: gate.sessionRef, scope: 'comments', rootPlatformContentId: postId, postPlatformId: postId, syncMode, syncRunId: syncRun.id, historyStart }));
        } catch (error) { if (isManualVerification(error)) throw error; failStage('comments', postId, error); }
      });
      const replyConcurrency = dailyBounded
        ? Math.max(1, Number(sourceDeps.dailyReplyFetchConcurrency ?? process.env.DAILY_REPLY_FETCH_CONCURRENCY ?? 4))
        : Math.max(1, Number(process.env.SYNC_REPLY_CONCURRENCY || process.env.SYNC_COMMENT_CONCURRENCY || 4));
      await runBounded([...replyTargets.values()], replyConcurrency, async target => {
        assertDeadline(deps);
        const replyTaskKey = `reply:${target.commentId}:${target.sortType || 0}`;
        try { await record(await syncStage({ ...sourceDeps, pageBudget: Math.min(deps.pageBudget, commentPageBudget) }, { source, account, connector, credential, sessionRef: gate.sessionRef, scope: 'comments', rootPlatformContentId: target.postId, postPlatformId: target.postId, commentId: target.commentId, sortType: target.sortType || 0, syncMode, syncRunId: syncRun.id, historyStart, taskKind: 'q1_reply', taskKey: replyTaskKey })); }
        catch (error) { if (isManualVerification(error)) throw error; failStage('q1_reply', replyTaskKey, error); }
      });
    }
    await drainAndCloseCommitLane(commitLane);
    const allFull = capabilities.length > 0 && capabilities.every(value => value === 'full');
    const realFull = source.platform === 'bigplayer_h5' && allFull && !incomplete && process.env.BIGPLAYER_H5_PROVIDER_VERIFIED === 'true';
    const status = incomplete ? 'partial' : realFull ? 'completed_full' : 'completed_authorized_scope'; const errorMessage = diagnostics.length ? JSON.stringify(diagnostics.slice(0, 20)) : null;
    await deps.repo.finishSyncRun(syncRun.id, { status, discoveredCount: counts.discovered, storedCount: counts.stored, errorCode: incomplete ? 'PARTIAL_SYNC' : null, errorMessage, leaseOwner: deps.leaseOwner });
    await deps.repo.finishRun(run.id, { status: incomplete ? 'partial' : 'success', discoveredCount: counts.discovered, storedCount: counts.stored, analyzedCount: counts.analyzed, alertedCount: counts.alerted, errorCode: incomplete ? 'PARTIAL_SYNC' : null, errorMessage });
    await deps.repo.markSourceRun(source.id, { status: incomplete ? 'failed' : 'success', errorCode: incomplete ? 'PARTIAL_SYNC' : null, errorMessage });
  } catch (error) { await finishPagedFailure(deps, source, run, syncRun, counts, error, commitLane); if (error.code === 'DAILY_RUN_TIMEOUT') throw error; }
}

async function withAccountLock(deps, accountId, operation) {
  const locks = deps.accountLocks || (deps.accountLocks = new Map()); const previous = locks.get(accountId) || Promise.resolve();
  let release; const current = new Promise(resolve => { release = resolve; }); locks.set(accountId, current);
  await previous;
  try { return await operation(); } finally { release(); if (locks.get(accountId) === current) locks.delete(accountId); }
}
function syncModeOf(source, account, syncRun) { const metadata = parseObject(account?.metadata); return first(syncRun, ['syncMode', 'sync_mode'], metadata.syncMode || metadata.sync_mode || source.sync_mode || 'incremental'); }
async function enqueueSyncRun(deps, source, account) {
  const input = { sourceId: source.id, accountId: account.id, syncMode: syncModeOf(source, account) };
  if (typeof deps.repo.enqueueSyncRun === 'function') return deps.repo.enqueueSyncRun(input);
  return deps.repo.createSyncRun(account.id, { syncMode: input.syncMode });
}
async function claimSyncRun(deps, syncRun) {
  if (typeof deps.repo.claimSyncRun !== 'function') return syncRun;
  return deps.repo.claimSyncRun({ runId: syncRun.id, leaseOwner: deps.leaseOwner, leaseSeconds: deps.leaseSeconds });
}
async function runPagedSource(deps, source, connector, run, syncRun, knownAccount = null) {
  const account = knownAccount || await deps.repo.getDefaultAccount({ sourceId: source.id, gameId: source.game_id, platform: source.platform });
  if (!account) return deps.repo.finishRun(run.id, { status: 'failed', errorCode: 'ACCOUNT_NOT_FOUND', errorMessage: 'default platform account is not configured' });
  return withAccountLock(deps, account.id, () => runPagedSourceUnlocked(deps, source, connector, run, account, syncRun));
}

async function runSource(deps, source, precreatedSyncRun = null) {
  const connector = deps.connectors[source.platform];
  if (!connector && !precreatedSyncRun) { const run = await deps.repo.createRun(source.id); return deps.repo.finishRun(run.id, { status: 'failed', errorCode: 'CONNECTOR_NOT_FOUND', errorMessage: source.platform }); }
  const paged = connector && typeof deps.repo.getDefaultAccount === 'function' && typeof deps.repo.upsertContentPage === 'function' && (typeof connector.listOwnedContents === 'function' || typeof connector.listPosts === 'function' || (typeof connector.discoverFeeds === 'function' && typeof connector.listFeedContents === 'function')) && (source.platform === 'taptap' || deps.credentialContext || (isSocialPlatform(source.platform) && deps.loginSessionClient));
  if (!paged && !precreatedSyncRun) { const run = await deps.repo.createRun(source.id); return runLegacySource(deps, source, connector, run); }
  let claimed = precreatedSyncRun ? await claimSyncRun(deps, precreatedSyncRun) : null;
  if (precreatedSyncRun && !claimed) return { skipped: true, syncRunId: precreatedSyncRun.id };
  const account = await deps.repo.getDefaultAccount({ sourceId: source.id, gameId: source.game_id, platform: source.platform });
  if (!account) {
    const run = await deps.repo.createRun(source.id);
    const error = new Error('default platform account is not configured'); error.code = 'ACCOUNT_NOT_FOUND';
    if (claimed) return finishPagedFailure(deps, source, run, claimed, { discovered: 0, stored: 0, analyzed: 0, alerted: 0 }, error);
    return deps.repo.finishRun(run.id, { status: 'failed', errorCode: error.code, errorMessage: error.message });
  }
  if (!claimed) {
    const queued = await enqueueSyncRun(deps, source, account);
    claimed = await claimSyncRun(deps, queued);
    if (!claimed) return { skipped: true, syncRunId: queued.id };
  }
  const run = await deps.repo.createRun(source.id);
  if (!connector) {
    const error = new Error(source.platform); error.code = 'CONNECTOR_NOT_FOUND';
    await finishPagedFailure(deps, source, run, claimed, { discovered: 0, stored: 0, analyzed: 0, alerted: 0 }, error);
    return;
  }
  return runPagedSource(deps, source, connector, run, claimed, account);
}
function buildDeps() {
  const repo = new Repository(); const credentialContext = new CredentialContext({ repo }); const oauthService = new DouyinOAuthService(); const loginSessionClient = new LoginSessionClient(); const authRefreshCoordinator = new AuthRefreshCoordinator({ repo, loginSessionClient });
  const connectors = { bigplayer_h5: new BigPlayerH5Connector(process.env, { credentialContext, authRefreshCoordinator }), ...buildExternalConnectors(process.env, { credentialContext, douyinOAuthService: oauthService, loginSessionClient }) }; const ai = new AiAnalyzer(); const notifier = new DingTalkNotifier();
  return { repo, connectors, credentialContext, oauthService, loginSessionClient, authRefreshCoordinator, ai, notifier, alertEngine: new AlertEngine(repo, notifier), accountLocks: new Map(), leaseOwner: `${process.pid}-${crypto.randomUUID()}`, leaseSeconds: Number(process.env.SYNC_LEASE_SECONDS || 300), pageSize: Number(process.env.SYNC_PAGE_SIZE || 50), pageBudget: Number(process.env.SYNC_PAGE_BUDGET || 20), pageTimeoutMs: Number(process.env.SYNC_PAGE_TIMEOUT_MS || process.env.BIGPLAYER_H5_TIMEOUT_MS || 30000), sourceConcurrency: Math.max(1, Number(process.env.WORKER_SOURCE_CONCURRENCY || 4)), analysisJobBatchSize: Number(process.env.AI_ANALYSIS_JOB_BATCH_SIZE || 100), analysisMaxAttempts: Number(process.env.AI_ANALYSIS_MAX_ATTEMPTS || 3), analysisRetryBaseMs: Number(process.env.AI_ANALYSIS_RETRY_BASE_MS || 1000) };
}
async function runBounded(items, limit, operation) {
  let next = 0; const worker = async () => { while (next < items.length) { const index = next; next += 1; await operation(items[index]); } };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, Number(limit) || 1), items.length) }, worker));
}
async function runOnce(deps = buildDeps()) {
  const queued = typeof deps.repo.listRunnableSyncRuns === 'function' ? await deps.repo.listRunnableSyncRuns() : [];
  const manual = await deps.repo.listManualDueSources(); const manualRunnable = [];
  for (const source of manual) { await deps.repo.clearManualRequest(source.id); if (source.enabled && source.game_enabled) manualRunnable.push(source); }
  const sources = await deps.repo.listDueSources(new Date()); const work = new Map();
  for (const item of queued) {
    const queuedSource = item.source || item.sourceRecord || item.source_record || { ...item, id: first(item, ['sourceId', 'source_id'], item.id) };
    const syncRun = item.syncRun || item.sync_run || item;
    if (queuedSource.id != null && !work.has(queuedSource.id)) work.set(queuedSource.id, { source: queuedSource, syncRun });
  }
  for (const candidate of [...manualRunnable, ...sources]) if (!work.has(candidate.id)) work.set(candidate.id, { source: candidate, syncRun: null });
  await runBounded([...work.values()], deps.sourceConcurrency || 1, item => runSource(deps, item.source, item.syncRun));
  if (typeof deps.repo.enqueueMissingAnalysis === 'function'
    && (typeof deps.ai?.configured !== 'function' || deps.ai.configured('light'))) {
    const spec = profileSpec(deps.ai, 'light');
    await deps.repo.enqueueMissingAnalysis({ profile: 'light', version: spec.version, limit: deps.analysisJobBatchSize || 100 });
    await processAnalysisBacklog(deps);
  }
  return { queued: queued.length, manual: manual.length, scanned: sources.length };
}
const interval = Number(process.env.WORKER_INTERVAL_MS || 60000);
if (require.main === module) { runOnce().catch(error => console.error('[worker]', error)); setInterval(() => runOnce().catch(error => console.error('[worker]', error)), interval); console.log(`public-opinion-worker scanning due sources every ${interval}ms`); }
module.exports = { runOnce, runSource, runPagedSource, syncStage, syncStagePage, createCommitLane, createTaskScheduler, enqueueDailyAnalysis, processDownstream, processPersistentAnalysisJobs, processAnalysisBacklog, shouldDeepAnalyze, effectiveAnalysisForAlert, SEVERITY_RANK, normalizePlatformItem, checkAuthorization, profileSpec, buildDeps, errorCode, isManualVerification, runBounded };
