const crypto = require('node:crypto');
const { normalizeAnalysisResult } = require('../services/riskSeverityNormalizer');
const { RISK_PROMPT, POLICY_VERSION, LEVELS, NAMES, GATES } = require('../services/riskDecisionTree');
const { RISK_RESPONSE_FORMAT } = require('../services/riskResponseSchema');

// AI 批量分析适配器（第三方 OpenAI 兼容 /chat/completions）。
// light / deep 配置相互隔离；未提供 profile 配置时兼容旧 AI_ANALYSIS_* 环境变量。

const SENTIMENTS = new Set(['positive', 'neutral', 'negative']);
const SEVERITIES = new Set(['normal', 'attention', 'negative', 'urgent']);
const PROFILES = new Set(['light', 'deep']);
const PROMPT_SCHEMA_VERSION = 'sentiment-quality-verifiable-issue-gates-v10-neutral-no-risk';

function truncate(text, max) { const s = String(text || '').replace(/\s+/g, ' ').trim(); return s.length > max ? s.slice(0, max) : s; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function fingerprintOf(item) {
  if (item.fingerprint) return item.fingerprint;
  return crypto.createHash('sha256').update(`${item.title || ''}\n${item.body || ''}`).digest('hex');
}
function numberFrom(env, profileKey, legacyKey, fallback) {
  const value = env[profileKey] ?? env[legacyKey] ?? fallback;
  return Number(value);
}
function tokenShare(total, count, index) {
  const base = Math.floor(total / count);
  return base + (index < total % count ? 1 : 0);
}

class AiAnalyzer {
  constructor(env = process.env) {
    // 现役入口改由全局TypeSafe接管；旧构造与light/deep实现保留，切回时改为legacy。
    if (env.PUBLIC_OPINION_ANALYSIS_PROVIDER === 'typesafe') return new (require('./typeSafeAnalyzer').TypeSafeAnalyzer)(env);
    // 停用的旧分析入口：new AiAnalyzer({...env, PUBLIC_OPINION_ANALYSIS_PROVIDER:'legacy'})。
    this.enabled = env.AI_ANALYSIS_ENABLED === 'true' || env.AI_ANALYSIS_ENABLED === '1';
    this.url = env.AI_ANALYSIS_URL || '';
    this.token = env.AI_ANALYSIS_TOKEN || '';
    this.api = env.AI_ANALYSIS_API || env.AI_ANALYSIS_PROTOCOL || 'openai-chat-completions';
    this.maxRetries = Number(env.AI_ANALYSIS_MAX_RETRIES || 3);
    this.timeoutMs = Number(env.AI_ANALYSIS_TIMEOUT_MS || 30000);
    this.timeoutMs = Number(env.AI_ANALYSIS_TIMEOUT_MS || 30000);
    this.profiles = Object.fromEntries(['light', 'deep'].map(profile => {
      const prefix = `AI_ANALYSIS_${profile.toUpperCase()}`;
      return [profile, {
        name: profile,
        model: env[`${prefix}_MODEL`] ?? env.AI_ANALYSIS_MODEL ?? '',
        version: env[`${prefix}_VERSION`] ?? env.AI_ANALYSIS_VERSION ?? 'sentiment-v1',
        batchSize: numberFrom(env, `${prefix}_BATCH_SIZE`, 'AI_ANALYSIS_BATCH_SIZE', 20),
        maxChars: numberFrom(env, `${prefix}_MAX_CHARS`, 'AI_ANALYSIS_MAX_CHARS', profile === 'light' ? 300 : 1200),
        maxOutputTokens: numberFrom(env, `${prefix}_MAX_OUTPUT_TOKENS`, 'AI_ANALYSIS_MAX_OUTPUT_TOKENS', profile === 'light' ? 1800 : 2400),
        dailyCallLimit: numberFrom(env, `${prefix}_DAILY_CALL_LIMIT`, 'AI_ANALYSIS_DAILY_CALL_LIMIT', 500)
      }];
    }));
    // 旧属性继续指向 light，避免已有调用方读取实例配置时破坏兼容性。
    this.model = this.profiles.light.model;
    this.batchSize = this.profiles.light.batchSize;
    this.maxChars = this.profiles.light.maxChars;
    this.dailyCallLimit = this.profiles.light.dailyCallLimit;
    this.cache = new Map();
    this.callState = { light: { day: null, calls: 0 }, deep: { day: null, calls: 0 } };
  }

  configured(profile = 'light') {
    const name = typeof profile === 'object' && profile !== null ? profile.profile : profile;
    const selected = PROFILES.has(name) ? this.profiles[name] : null;
    return this.enabled && Boolean(this.url) && Boolean(this.token) && Boolean(selected?.model);
  }
  requireConfigured(profile = 'light') {
    if (!this.enabled || !this.url || !this.token) {
      const e = new Error('AI_ANALYSIS_NOT_CONFIGURED');
      e.code = 'AI_ANALYSIS_NOT_CONFIGURED';
      throw e;
    }
    this.selectProfile(profile);
  }
  selectProfile(profile = 'light') {
    const name = typeof profile === 'object' && profile !== null ? profile.profile : profile;
    if (!PROFILES.has(name)) {
      const e = new Error('AI_ANALYSIS_INVALID_PROFILE');
      e.code = 'AI_ANALYSIS_INVALID_PROFILE';
      throw e;
    }
    const selected = this.profiles[name];
    if (!selected.model) {
      const e = new Error('AI_ANALYSIS_MODEL_NOT_CONFIGURED');
      e.code = 'AI_ANALYSIS_MODEL_NOT_CONFIGURED';
      throw e;
    }
    return selected;
  }

  cacheKey(fingerprint, profile, context = {}) {
    const payload = {
      promptSchemaVersion: PROMPT_SCHEMA_VERSION,
      riskPolicyVersion: POLICY_VERSION,
      retentionPolicyVersion: 'v9-retention',
      regionCode: context.regionCode || context.region_code || 'legacy-unassigned',
      gameId: context.gameId || context.game_id || 'legacy-unassigned',
      communityId: context.communityId || context.community_id || 'legacy-unassigned',
      platform: context.platform || 'legacy-unassigned',
      fingerprint,
      profile: profile.name,
      model: profile.model,
      version: profile.version,
      evidenceTypes: context.evidenceTypes || [], riskMetadata: context.riskMetadata || {}
    };
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  // 单日调用计数按 profile 独立，跨天自动重置。
  tickCallGuard(profile) {
    const today = new Date().toISOString().slice(0, 10);
    let state = this.callState[profile.name];
    if (state.day !== today) state = this.callState[profile.name] = { day: today, calls: 0 };
    if (state.calls >= profile.dailyCallLimit) {
      const e = new Error('AI_ANALYSIS_DAILY_LIMIT_REACHED');
      e.code = 'AI_ANALYSIS_DAILY_LIMIT_REACHED';
      throw e;
    }
    state.calls += 1;
  }

  buildMessages(items, profile = this.profiles.light) {
    const depth = profile.name === 'deep'
      ? '深入核查具体问题与证据，不因分析更深入而提高等级。'
      : '进行快速初筛，仅在风险或不确定性较高时标记需要深度分析。';
    const system = `你是游戏舆情分析助手。${depth}仅输出严格 JSON 数组，每元素对应输入同序号项，字段：i(序号从0起,整数),s(sentiment:positive/neutral/negative),v(severity:normal/attention/negative/urgent),n(negative_score 0~1),c(confidence 0~1),d(needs_deep 布尔值),r(reason，建议20-60个中文字符，使用通俗中文直接说明可观察到的表达、语气或信息为何支持当前情感结论，不输出内部推理步骤，不使用“根据系统提示”“模型认为”等措辞),t(topics 最多3个短词数组),m(summary 20字内),q(quality_score 0~1),h(recommend_home 布尔值，仅内容具备突出的公共价值、时效性和首页曝光价值时为true),p(recommend_pin 布尔值，仅内容与当前栏目高度相关且值得阶段性优先曝光时为true),f(recommend_feature 布尔值，仅内容完整、可靠且有长期沉淀价值时为true),qr(quality_reason，建议20-60个中文字符，说明质量和推荐依据)。三项推荐独立判断；广告、灌水、重复、纯情绪或缺少信息价值的短内容不得仅因情绪正面而推荐。所有字段必填。`;
    const payload = items.map((it, i) => ({
      i,
      region: it.regionCode || it.region_code || 'legacy-unassigned',
      game: it.gameName || it.game_name || it.gameId || it.game_id || 'legacy-unassigned',
      community: it.communityName || it.community_name || it.communityId || it.community_id || 'legacy-unassigned',
      text: `${truncate(it.title, 60)} ${truncate(it.body, profile.maxChars)}`.trim(),
      plat: it.platform || 'legacy-unassigned',
      evidenceTypes: it.evidenceTypes || [], riskMetadata: it.riskMetadata || {}
    }));
    const user = `分析以下${items.length}条游戏相关内容，返回等长JSON数组；每一项必须包含risk对象（不得省略，即使L0正常内容）。旧版仅s/v字段的结果无效：\n${JSON.stringify(payload)}`;
    // Replace the old risk instructions; retain unrelated sentiment/quality fields.
    const example = [{ i: 0, s: 'negative', v: 'attention', n: 0.9, c: 0.9, d: false, r: '“十连全蓝”只是运气抱怨', t: ['抽卡'], m: '抽卡运气抱怨', q: 0.2, h: false, p: false, f: false, qr: '缺少可核查信息',
      risk: { level: 'L1', level_name: '关注级', gate_result: 'GATE1_fail_L1', claim_type: 'emotion', has_evidence: 'none', evidence_types: [], action_intent: [], hit_rules: ['W1'], whitelist_hit: true, whitelist_override: false, need_clarification: false, downgrade_suggest: null, module: '抽卡概率', issue_summary: null, confidence: 0.9, reason: '“十连全蓝”未提供明确实际问题', issue_object: '', claim_evidence: '十连全蓝', noise_reason: null, rule_evidence: {} } }];
    return [{ role: 'system', content: `${RISK_PROMPT}\n输出接口契约：${system}\n必须输出带risk的数组；下面仅为结构示例，禁止复制示例内容到实际结果：${JSON.stringify(example)}` }, { role: 'user', content: user }];
  }

  parseResponse(body, count, profile = this.profiles.light, messages = [], items = []) {
    const text = this.api === 'anthropic-messages'
      ? body?.content?.find(item => item?.type === 'text')?.text
      : body?.choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') throw new Error('AI_ANALYSIS_INVALID_RESPONSE');
    let arr;
    try {
      const normalizedText = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(normalizedText);
      arr = Array.isArray(parsed) ? parsed : parsed.results;
    } catch {
      throw new Error('AI_ANALYSIS_INVALID_RESPONSE');
    }
    if (!Array.isArray(arr) || arr.length !== count) throw new Error('AI_ANALYSIS_INCOMPLETE_RESPONSE');
    const byIndex = new Map();
    for (const o of arr) {
      if (!o || !Number.isInteger(o.i) || o.i < 0 || o.i >= count || byIndex.has(o.i)) throw new Error('AI_ANALYSIS_INVALID_RESPONSE');
      byIndex.set(o.i, o);
    }

    const rawUsage = body?.usage;
    const hasUsage = rawUsage && [rawUsage.prompt_tokens, rawUsage.completion_tokens, rawUsage.total_tokens].every(Number.isFinite);
    const inputTokens = hasUsage ? Math.max(0, Math.floor(rawUsage.prompt_tokens)) : Math.ceil(JSON.stringify(messages).length / 4);
    const outputTokens = hasUsage ? Math.max(0, Math.floor(rawUsage.completion_tokens)) : Math.ceil(text.length / 4);
    const totalTokens = hasUsage ? Math.max(0, Math.floor(rawUsage.total_tokens)) : inputTokens + outputTokens;

    const results = [];
    for (let i = 0; i < count; i += 1) {
      const o = byIndex.get(i);
      if (!o) throw new Error('AI_ANALYSIS_INCOMPLETE_RESPONSE');
      const sentiment = typeof o.s === 'string' ? o.s.toLowerCase() : '';
      const severity = typeof o.v === 'string' ? o.v.toLowerCase() : '';
      const negativeScore = Number(o.n);
      const confidence = Number(o.c);
      if (o.risk && (!LEVELS[o.risk.level] || o.risk.level_name !== NAMES[o.risk.level]
        || o.risk.gate_result !== GATES[o.risk.level]
        || !['emotion', 'fact', 'allegation', 'evidence_backed_allegation'].includes(o.risk.claim_type)
        || !Array.isArray(o.risk.hit_rules) || !Array.isArray(o.risk.evidence_types)
        || !Array.isArray(o.risk.action_intent) || typeof o.risk.reason !== 'string'
        || !Number.isFinite(o.risk.confidence) || o.risk.confidence < 0 || o.risk.confidence > 1)) throw new Error('AI_ANALYSIS_INVALID_RISK_DECISION');
      if (o.risk && severity !== LEVELS[o.risk.level]) throw new Error('AI_ANALYSIS_INVALID_RISK_DECISION');
      // 核心字段（sentiment/severity/negative_score/confidence）严格校验；
      // 其余字段格式漂移时降级取默认值，避免整批失败（诊断见 .Codex/docs/2026-08/2026-08-31/ai-stability-diagnosis.md）。
      if (!SENTIMENTS.has(sentiment) || !SEVERITIES.has(severity)
        || !Number.isFinite(negativeScore) || negativeScore < 0 || negativeScore > 1
        || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new Error('AI_ANALYSIS_INVALID_RESPONSE');
      }
      const qualityScore = Number(o.q);
      const hasQualityScore = Number.isFinite(qualityScore) && qualityScore >= 0 && qualityScore <= 1;
      const evidence = typeof o.ge === 'string' ? o.ge.trim() : '';
      const sourceText = `${items[i]?.title || ''} ${items[i]?.body || ''}`;
      const gameComplaint = ['neutral', 'negative'].includes(sentiment) && o.gc === true && evidence.length >= 2 && sourceText.includes(evidence);
      results.push(normalizeAnalysisResult({
        riskDecision: o.risk,
        sentiment,
        severity,
        negativeScore,
        confidence,
        gameComplaint: typeof o.gc === 'boolean' ? gameComplaint : undefined,
        gameComplaintEvidence: gameComplaint ? evidence : '',
        gameExperienceRelated: ['neutral', 'negative'].includes(sentiment) && (o.gx === true || gameComplaint),
        urgentImpact: typeof o.ui === 'string' ? o.ui : undefined,
        urgentEvidence: typeof o.ue === 'string' ? o.ue.trim() : '',
        needsDeep: o.d === true,
        reason: typeof o.r === 'string' ? truncate(o.r, 255) : '',
        topics: Array.isArray(o.t) ? o.t.slice(0, 3).map(String) : [],
        summary: typeof o.m === 'string' ? truncate(o.m, 60) : '',
        qualityScore: hasQualityScore ? qualityScore : 0,
        recommendHome: o.h === true,
        recommendPin: o.p === true,
        recommendFeature: o.f === true,
        qualityReason: typeof o.qr === 'string' ? truncate(o.qr, 255) : '',
        profile: profile.name,
        analysisVersion: profile.version,
        modelName: profile.model,
        inputTokens: tokenShare(inputTokens, count, i),
        outputTokens: tokenShare(outputTokens, count, i),
        totalTokens: tokenShare(totalTokens, count, i),
        usageEstimated: !hasUsage
      }, items[i]));
    }
    return results;
  }

  async callOnce(messages, profile) {
    this.tickCallGuard(profile);
    let lastError;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const anthropic = this.api === 'anthropic-messages';
        const endpoint = anthropic
          ? /\/messages\/?$/.test(this.url) ? this.url : `${this.url.replace(/\/$/, '')}/messages`
          : this.url;
        const headers = anthropic
          ? { 'content-type': 'application/json', 'x-api-key': this.token, 'anthropic-version': '2023-06-01' }
          : { 'content-type': 'application/json', authorization: `Bearer ${this.token}` };
        const body = anthropic
          ? { model: profile.model, max_tokens: profile.maxOutputTokens, system: messages.find(message => message.role === 'system')?.content || '', messages: messages.filter(message => message.role !== 'system') }
          : { model: profile.model, temperature: 0, max_tokens: profile.maxOutputTokens, messages,
            response_format: RISK_RESPONSE_FORMAT };
        if (!anthropic) {
          const count = JSON.parse(messages.at(-1).content.split('\n').at(-1)).length;
          body.response_format = structuredClone(RISK_RESPONSE_FORMAT);
          const outputArray = body.response_format.json_schema.schema.properties.results;
          outputArray.minItems = count; outputArray.maxItems = count;
        }
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs)
        });
        if (response.status >= 400 && response.status < 500) throw Object.assign(new Error(`AI_ANALYSIS_HTTP_${response.status}`), { noRetry: true });
        if (!response.ok) throw new Error(`AI_ANALYSIS_HTTP_${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        if (error.noRetry || attempt === this.maxRetries) break;
        await sleep(2 ** attempt * 500);
      }
    }
    throw lastError;
  }

  // 返回与 items 等长、同序结果。profile 缺省为 light；同批相同 cache key 只发送一次。
  async analyzeBatch(items = [], profileName = 'light') {
    this.requireConfigured(profileName);
    const profile = this.selectProfile(profileName);
    if (!items.length) return [];
    const results = new Array(items.length);
    const pendingByKey = new Map();
    items.forEach((item, idx) => {
      const fingerprint = fingerprintOf(item);
      const key = this.cacheKey(fingerprint, profile, item);
      if (this.cache.has(key)) results[idx] = normalizeAnalysisResult(this.cache.get(key), item);
      else if (pendingByKey.has(key)) pendingByKey.get(key).indices.push(idx);
      else pendingByKey.set(key, { item, key, indices: [idx] });
    });
    const pending = [...pendingByKey.values()];
    // A full decision object is larger than the previous abbreviated response.
    // Respect configured output limits rather than submitting oversized batches.
    const batchSize = Math.max(1, Math.min(profile.batchSize, Math.floor(profile.maxOutputTokens / 1200)));
    for (let start = 0; start < pending.length; start += batchSize) {
      const chunk = pending.slice(start, start + batchSize);
      const messages = this.buildMessages(chunk.map(c => c.item), profile);
      const body = await this.callOnce(messages, profile);
      const parsed = this.parseResponse(body, chunk.length, profile, messages, chunk.map(entry => entry.item));
      if (parsed.some(result => !result.riskDecision)) throw new Error('AI_ANALYSIS_INVALID_RISK_DECISION');
      chunk.forEach((entry, i) => {
        this.cache.set(entry.key, parsed[i]);
        entry.indices.forEach(idx => { results[idx] = parsed[i]; });
      });
    }
    return results;
  }

  // 向后兼容单条入口，内部默认走 light。
  async analyze(content, profile = 'light') { const [result] = await this.analyzeBatch([content], profile); return result; }
}
module.exports = { AiAnalyzer, truncate, fingerprintOf };
