const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cipher = require('./credentialCipher');
const { plain } = require('../services/typesafeTestService');
const { TypeSafeExplanation, EXPLANATION_VERSION } = require('./typeSafeExplanation');

const VERSION = 'typesafe-v11-production-v1';
const ENDPOINT = 'https://chat-test.q1.com/v1/systemone';
const MODEL = 'jev-latest';
const LEVELS = { L0: 'normal', L1: 'attention', L2: 'negative', L3: 'urgent' };
const REASONS = {
  normal: '正常咨询、晒卡、攻略或讨论，没有明确不满和实际异常',
  emotion: '表达不满，但未指出具体可核查的产品或运营异常',
  luck: '个人抽卡运气抱怨，没有具体异常证据',
  occasional: '个人偶发技术现象，缺少持续或复现线索',
  issue: '指出可核查的具体产品或运营异常，未达到紧急条件',
  emergency: '原文报告具体紧急风险，需要优先核查',
  unclear: '文字或语境不足，需人工抽检'
};
function failure(code) { return Object.assign(new Error(code), { code }); }
function probability(value) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw failure('TYPESAFE_INVALID_RESPONSE'); return value; }
function choice(answers, key, options) { const value = answers?.[key]?.choice; if (!options.includes(value)) throw failure('TYPESAFE_INVALID_RESPONSE'); return value; }
function storeDir(env) { return env.PUBLIC_OPINION_TYPESAFE_TEST_DIR || path.join(env.ProgramData || 'C:\\ProgramData', 'PublicOpinion', 'typesafe-tests'); }

class TypeSafeAnalyzer {
  constructor(env = process.env, { fetchImpl = global.fetch, explainer } = {}) {
    this.env = env; this.fetchImpl = fetchImpl; this.singlePass = true; this.enabled = true;
    this.model = MODEL; this.batchSize = 10; this.cache = new Map(); this.active = 0; this.waiters = [];
    this.explainer = explainer || new TypeSafeExplanation(env, { fetchImpl });
    // Both queue profiles use TypeSafe so unfinished legacy deep jobs can finish.
    this.profiles = Object.fromEntries(['light', 'deep'].map(name => [name, { name, model: MODEL, version: env[`AI_ANALYSIS_${name.toUpperCase()}_VERSION`] || env.AI_ANALYSIS_VERSION || 'sentiment-v1', batchSize: 10, maxChars: name === 'light' ? 300 : 1200, maxOutputTokens: 0, dailyCallLimit: 100000 }]));
  }
  selectProfile(name = 'light') { const profile = this.profiles[name]; if (!profile) throw failure('AI_ANALYSIS_INVALID_PROFILE'); return profile; }
  configured() { try { const value = JSON.parse(fs.readFileSync(path.join(storeDir(this.env), 'config.json'), 'utf8')); return Boolean(value.secretCipher && cipher.loadKey(this.env)); } catch { return false; } }
  requireConfigured() { if (!this.configured()) throw failure('TYPESAFE_NOT_CONFIGURED'); }
  key() { try { const value = JSON.parse(fs.readFileSync(path.join(storeDir(this.env), 'config.json'), 'utf8')); return cipher.decrypt(value.secretCipher, this.env, { aad: 'public-opinion:typesafe-test:api-key:v1' }); } catch { throw failure('TYPESAFE_NOT_CONFIGURED'); } }
  cacheKey(fingerprint, profile, context = {}) { return crypto.createHash('sha256').update(JSON.stringify({ version: VERSION, explanationVersion: EXPLANATION_VERSION, fingerprint, profile: profile.name, game: context.gameId || context.game_id, community: context.communityId || context.community_id, platform: context.platform })).digest('hex'); }
  async acquire() { if (this.active >= 10) await new Promise(resolve => this.waiters.push(resolve)); else this.active += 1; }
  release() { const next = this.waiters.shift(); if (next) next(); else this.active -= 1; }
  questions(text) {
    const parts = text.split(/(?<=[。！？!?\n])/).map(s => s.trim()).filter(Boolean);
    const excerpts = [...new Set(parts.flatMap(s => s.match(/.{1,100}/gs) || []))].slice(0, 24);
    return {
      level: { type: 'choice', instructions: '按游戏舆情v11串行判断：无明确不满异常L0；有不满但无具体可核查问题L1；具体对象+异常说法L2；已有具体问题且原文有严重紧急事件L3。只看本条文字，不继承父帖、不推测图片。签到、九十抽、酒馆见红等无负面意思为L0。个人运气抱怨即使说暗改仍L1。复现卡死、奖励未到账、匹配不公平具体投诉L2。一般涉钱/退款流程咨询不能升级。', criteria: { L0: '正常/无需处理', L1: '关注级：一般不满无具体问题', L2: '负面待处理：具体产品或运营异常', L3: '紧急告警：严重且有明确紧急原文依据' } },
      has_verifiable_issue: { type: 'noul', instructions: '原文是否同时指出具体可核查对象与异常说法？纯宣泄、无异常咨询、纯抽卡运气不算。持续登录故障、具体组织投诉退款、重大流失等是具体问题。' },
      emergency_trigger: { type: 'choice', instructions: '只依据实际原文报告的紧急条件；纯情绪、单次掉线、普通退款流程咨询、个人口头弃坑、假设否定、已解决历史均不触发。', criteria: { none: '无紧急条件', login_or_asset: '持续/群体无法登录游玩、账号被盗、数据隐私泄露、异常扣款、可复现资损漏洞', compliance_or_refund: '本产品合规红线指控、已产生外部投诉线索或具体组织集体退款差评；非咨询', churn: '明确报告大量玩家或公会成员过半流失退游' } },
      sentiment: { type: 'choice', instructions: '本条情感，不把问题事实和愤怒程度混淆。', criteria: { positive: '正面', neutral: '中性', negative: '负面' } },
      reason: { type: 'choice', instructions: '选择本条实际判级的主要依据，不能以情绪强烈直接升级。', criteria: REASONS },
      evidence: { type: 'choice', instructions: '选择最能支持判定的原文片段；只选择文本，不能补充没看到的图片。无明确依据选择none。', criteria: { none: '原文不足', ...Object.fromEntries(excerpts.map((s, i) => [`q${i}`, s])) } },
      quality: { type: 'score', instructions: '内容质量：事实清晰、原创有用、有游戏经验或可操作攻略，不能因负面直接降低质量；简短签到/赞美不推荐。', criteria: ['无有效信息', '普通讨论', '有价值具体经验', '高质量详细原创攻略'] },
      recommend_home: { type: 'noul', instructions: '是否信息充实、有游戏价值且适合推荐首页？简短签到、广告、晒卡短句为否。' },
      recommend_pin: { type: 'noul', instructions: '是否高质量详细攻略或重大权威信息且适合置顶？普通讨论为否。' },
      recommend_feature: { type: 'noul', instructions: '是否原创充实、有论据有帮助且适合加精？简短评论、广告为否。' }
    };
  }
  async request(payload, key) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.fetchImpl(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(3000) });
        if (response.status === 429 || response.status >= 500) throw failure(`TYPESAFE_HTTP_${response.status}`);
        if (!response.ok) throw Object.assign(failure(`TYPESAFE_HTTP_${response.status}`), { noRetry: true });
        return await response.json();
      } catch (error) {
        if (error.noRetry || attempt === 2) throw failure(error.code?.startsWith('TYPESAFE_') ? error.code : 'TYPESAFE_NETWORK_ERROR');
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }
  parse(data, text, questions) {
    const answers = data.answers;
    const raw = choice(answers, 'level', Object.keys(LEVELS)); const confidence = probability(answers.level.confidence);
    const issue = probability(answers?.has_verifiable_issue?.noul); const emergency = choice(answers, 'emergency_trigger', ['none', 'login_or_asset', 'compliance_or_refund', 'churn']);
    let final = raw; const status = raw === 'L3' && confidence < 0.6 ? 'manual_review' : 'auto_passed';
    if (confidence < 0.6 && raw === 'L2') final = 'L1';
    if (raw === 'L3' && emergency === 'none') final = 'L2';
    if (['L2', 'L3'].includes(raw) && issue < 0.5) final = 'L1';
    const reasonKey = choice(answers, 'reason', Object.keys(REASONS));
    const evidenceKey = choice(answers, 'evidence', Object.keys(questions.evidence.criteria));
    const excerpt = evidenceKey === 'none' ? '' : questions.evidence.criteria[evidenceKey];
    const reason = `${excerpt ? `AI原文依据：“${excerpt}”；` : 'AI未选中明确原文依据；'}AI依据分类：${reasonKey}（${REASONS[reasonKey]}）；最终等级：${final}${final !== raw ? `；业务校验${raw}→${final}` : ''}${status === 'manual_review' ? '（需人工复核）' : ''}`.slice(0, 255);
    const quality = answers?.quality?.score;
    if (typeof quality !== 'number' || !Number.isFinite(quality) || quality < 0 || quality > 3) throw failure('TYPESAFE_INVALID_RESPONSE');
    const usage = data.usage || {}; const token = n => Number.isFinite(n) && n >= 0 ? n : 0;
    const decision = { provider: VERSION, raw_level: raw, final_level: final, confidence, status, has_verifiable_issue: issue, emergency_trigger: emergency, reason_key: reasonKey, evidence: excerpt, source_hash: crypto.createHash('sha256').update(text).digest('hex') };
    return { severity: LEVELS[final], sentiment: choice(answers, 'sentiment', ['positive', 'neutral', 'negative']), confidence, negativeScore: final === 'L0' ? 0 : confidence, reason, analysisReason: reason, typeSafeDecision: decision, needsDeep: false, modelName: MODEL, topics: [], summary: excerpt.slice(0, 60), qualityScore: quality / 3, recommendHome: probability(answers?.recommend_home?.noul) >= 0.8, recommendPin: probability(answers?.recommend_pin?.noul) >= 0.9, recommendFeature: probability(answers?.recommend_feature?.noul) >= 0.9, qualityReason: 'TypeSafe结构化质量及推荐判断', inputTokens: token(usage.input_tokens ?? usage.prompt_tokens), outputTokens: token(usage.output_tokens ?? usage.completion_tokens), totalTokens: token(usage.total_tokens), usageEstimated: !data.usage, rawAnalysis: { typeSafeDecision: decision, reason, severity: LEVELS[raw] } };
  }
  async analyzeBatch(items = [], profileName = 'light') {
    const profile = this.selectProfile(profileName); const key = this.key();
    return Promise.all(items.map(async item => {
      // Comments are independent; callers may carry a parent title.
      const text = plain([item.contentType === 'comment' || item.content_type === 'comment' ? '' : item.title, item.body].filter(Boolean).join('\n'));
      if (!text) {
        const reason = '本条无可分析文字；未读取图片或视频，按文字范围无需处理';
        const decision = { provider: VERSION, raw_level: 'L0', final_level: 'L0', confidence: 1, status: 'auto_passed', has_verifiable_issue: 0, emergency_trigger: 'none', evidence: '', source_hash: crypto.createHash('sha256').update('').digest('hex') };
        return { severity: 'normal', sentiment: 'neutral', confidence: 1, negativeScore: 0, reason, typeSafeDecision: decision, rawAnalysis: { typeSafeDecision: decision, reason }, needsDeep: false, modelName: 'text-only-empty', qualityScore: 0, recommendHome: false, recommendPin: false, recommendFeature: false };
      }
      const fingerprint = item.fingerprint || crypto.createHash('sha256').update(text).digest('hex'); const cacheKey = this.cacheKey(fingerprint, profile, item);
      if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      await this.acquire();
      try {
        const questions = this.questions(text);
        const data = await this.request({ model: MODEL, state: { game: item.gameName || item.game_name || '', community: item.communityName || item.community_name || '', text }, questions }, key);
        const result = this.parse(data, text, questions);
        if (result.typeSafeDecision.final_level !== 'L0') {
          const explanation = await this.explainer.explain(text, result.typeSafeDecision);
          result.rawAnalysis.structuredReason = result.reason;
          result.rawAnalysis.explanation = explanation;
          result.reason = explanation.status === 'generated' ? explanation.reason : `具体分析原因生成失败；${result.reason}`.slice(0, 255);
          result.analysisReason = result.reason; result.rawAnalysis.reason = result.reason;
          if (explanation.status === 'generated') {
            result.inputTokens += explanation.inputTokens; result.outputTokens += explanation.outputTokens; result.totalTokens += explanation.totalTokens;
            result.usageEstimated ||= explanation.usageEstimated;
          }
        } else result.rawAnalysis.explanation = { status: 'skipped_normal' };
        this.cache.set(cacheKey, result);
        if (this.cache.size > 1000) this.cache.delete(this.cache.keys().next().value);
        return result;
      } finally { this.release(); }
    }));
  }
  async analyze(content, profile = 'light') { return (await this.analyzeBatch([content], profile))[0]; }
}
module.exports = { TypeSafeAnalyzer, VERSION, LEVELS };
