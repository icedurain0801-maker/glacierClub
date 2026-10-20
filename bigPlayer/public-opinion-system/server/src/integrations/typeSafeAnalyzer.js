const { COMBAT_DISCUSSION_POLICY } = require('../services/combatDiscussionPolicy');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cipher = require('./credentialCipher');
const { TypeSafeExplanation, EXPLANATION_VERSION } = require('./typeSafeExplanation');
const { TypeSafeUrgentReview, REVIEW_MODEL } = require('./typeSafeUrgentReview');
const { TypeSafeQualityExplanation, QUALITY_EXPLANATION_VERSION } = require('./typeSafeQualityExplanation');
const { formatExplanation } = require('./chineseExplanation');
const { analysisText, assertUrgentValidated } = require('../services/urgentValidation');
const { TOPIC_VERSION, topicQuestion, parseTopicAnswer, emptyTopic, refineTopicDecision } = require('../services/topicDecision');
const { normalizePolicy, policyHash, levelSetting, policyInstructions } = require('../services/aiAnalysisPolicy');
const { CONTEXT_PROVIDER, isComment, commentContext, contextHash } = require('../services/commentAnalysisContext');
const { qualityEligibility } = require('../services/qualityPolicy');
const { correctionHash, CORRECTION_INSTRUCTIONS } = require('../services/humanCorrections');

const VERSION = CONTEXT_PROVIDER;
const ENDPOINT = 'https://chat-test.q1.com/v1/systemone';
const MODEL = 'jev-latest';
const { ECOSYSTEM_POLICY } = require('../services/gameEcosystemRisk');
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
function sentimentProbability(answer, sentiment) {
  const value = answer?.probabilities?.[sentiment] ?? (answer?.choice === sentiment ? answer.confidence : null);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}
function storeDir(env) { return env.PUBLIC_OPINION_TYPESAFE_TEST_DIR || path.join(env.ProgramData || 'C:\\ProgramData', 'PublicOpinion', 'typesafe-tests'); }

class TypeSafeAnalyzer {
  constructor(env = process.env, { fetchImpl = global.fetch, explainer, urgentReviewer, qualityExplainer, imageAnalyzer } = {}) {
    this.env = env; this.fetchImpl = fetchImpl; this.singlePass = true; this.enabled = true;
    this.model = MODEL; this.batchSize = 10; this.cache = new Map(); this.active = 0; this.waiters = [];
    this.explainer = explainer || new TypeSafeExplanation(env, { fetchImpl });
    this.urgentReviewer = urgentReviewer || new TypeSafeUrgentReview(env, { fetchImpl });
    this.qualityExplainer = qualityExplainer || new TypeSafeQualityExplanation(env, { fetchImpl });
    this.imageAnalyzer = imageAnalyzer || new (require('./facebookImageAnalyzer').FacebookImageAnalyzer)(env, { fetchImpl });
    // Both queue profiles use TypeSafe so unfinished legacy deep jobs can finish.
    this.profiles = Object.fromEntries(['light', 'deep'].map(name => [name, { name, model: MODEL, version: env[`AI_ANALYSIS_${name.toUpperCase()}_VERSION`] || env.AI_ANALYSIS_VERSION || 'sentiment-v1', batchSize: 10, maxChars: name === 'light' ? 300 : 1200, maxOutputTokens: 0, dailyCallLimit: 100000 }]));
  }
  selectProfile(name = 'light') { const profile = this.profiles[name]; if (!profile) throw failure('AI_ANALYSIS_INVALID_PROFILE'); return profile; }
  configured() { try { const value = JSON.parse(fs.readFileSync(path.join(storeDir(this.env), 'config.json'), 'utf8')); return Boolean(value.secretCipher && cipher.loadKey(this.env)); } catch { return false; } }
  requireConfigured() { if (!this.configured()) throw failure('TYPESAFE_NOT_CONFIGURED'); }
  key() { try { const value = JSON.parse(fs.readFileSync(path.join(storeDir(this.env), 'config.json'), 'utf8')); return cipher.decrypt(value.secretCipher, this.env, { aad: 'public-opinion:typesafe-test:api-key:v1' }); } catch { throw failure('TYPESAFE_NOT_CONFIGURED'); } }
  cacheKey(fingerprint, profile, context = {}) { return crypto.createHash('sha256').update(JSON.stringify({ version: VERSION, ...(context.platform === 'facebook' && require('../../../shared/facebookMedia').imageUrls(context.media).length ? { imageRevision: require('./facebookImageAnalyzer').OCR_REVISION } : {}), ...(context.aiCorrections?.length ? { humanCorrection: correctionHash(context) } : {}), policyRevision: 7, reviewModel: REVIEW_MODEL, textHash: crypto.createHash('sha256').update(analysisText(context)).digest('hex'), contextHash: contextHash(context), contentType: context.contentType || context.content_type || 'post', policy: context.analysisPolicy || context.analysis_policy ? policyHash(context.analysisPolicy || context.analysis_policy) : null, topicVersion: TOPIC_VERSION, topicPromptRevision: 2, sentimentVersion: 2, explanationVersion: EXPLANATION_VERSION, qualityExplanationVersion: QUALITY_EXPLANATION_VERSION, fingerprint, profile: profile.name, game: context.gameId || context.game_id, community: context.communityId || context.community_id, platform: context.platform })).digest('hex'); }
  async acquire() { if (this.active >= 10) await new Promise(resolve => this.waiters.push(resolve)); else this.active += 1; }
  release() { const next = this.waiters.shift(); if (next) next(); else this.active -= 1; }
  questions(text) {
    const parts = text.split(/(?<=[。！？!?\n])/).map(s => s.trim()).filter(Boolean);
    const excerpts = [...new Set(parts.flatMap(s => s.match(/.{1,100}/gs) || []))].slice(0, 24);
    return {
      topic: topicQuestion(),
      level: { type: 'choice', instructions: '按游戏舆情v11串行判断：无明确不满异常L0；有不满但无具体可核查问题L1；具体对象+异常说法L2；已有具体问题且原文有严重紧急事件L3。只看本条文字，不继承父帖、不推测图片。签到、九十抽、酒馆见红等无负面意思为L0。个人运气抱怨即使说暗改仍L1。复现卡死、奖励未到账、匹配不公平具体投诉L2。一般涉钱/退款流程咨询不能升级。', criteria: { L0: '正常/无需处理', L1: '关注级：一般不满无具体问题', L2: '紧急告警：具体产品或运营异常', L3: '紧急告警：严重且有明确紧急原文依据' } },
      has_verifiable_issue: { type: 'noul', instructions: '原文是否同时指出具体可核查对象与异常说法？纯宣泄、无异常咨询、纯抽卡运气不算。持续登录故障、具体组织投诉退款、重大流失等是具体问题。' },
      emergency_trigger: { type: 'choice', instructions: '只依据实际原文报告的紧急条件；纯情绪、单次掉线、普通退款流程咨询、个人口头弃坑、假设否定、已解决历史均不触发。', criteria: { none: '无紧急条件', login_or_asset: '持续/群体无法登录游玩、账号被盗、数据隐私泄露、异常扣款、可复现资损漏洞', compliance_or_refund: '本产品合规红线指控、已产生外部投诉线索或具体组织集体退款差评；非咨询', churn: '明确报告大量玩家或公会成员过半流失退游', ecosystem_abuse: '宣传招揽代充、第三方账号金币皮肤道具交易，严重破坏游戏生态' } },
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
    const issue = probability(answers?.has_verifiable_issue?.noul); const emergency = choice(answers, 'emergency_trigger', ['none', 'login_or_asset', 'compliance_or_refund', 'churn', 'ecosystem_abuse']);
    let final = raw; const status = raw === 'L3' && confidence < 0.6 ? 'manual_review' : 'auto_passed';
    if (confidence < 0.6 && raw === 'L2') final = 'L1';
    if (raw === 'L3' && emergency === 'none') final = 'L2';
    if (['L2', 'L3'].includes(raw) && issue < 0.5) final = 'L1';
    const reasonKey = choice(answers, 'reason', Object.keys(REASONS));
    const evidenceKey = choice(answers, 'evidence', Object.keys(questions.evidence.criteria));
    const excerpt = evidenceKey === 'none' ? '' : questions.evidence.criteria[evidenceKey];
    if (reasonKey === 'normal') final = 'L0';
    else if (['L2', 'L3'].includes(final) && (!excerpt || ['emotion', 'luck', 'occasional', 'unclear'].includes(reasonKey))) final = 'L1';
    if (final === 'L3' && reasonKey !== 'emergency') final = 'L2';
    const reason = `${excerpt ? `AI原文依据：“${excerpt}”；` : 'AI未选中明确原文依据；'}AI依据分类：${reasonKey}（${REASONS[reasonKey]}）；最终等级：${final}${final !== raw ? `；业务校验${raw}→${final}` : ''}${status === 'manual_review' ? '（需人工复核）' : ''}`.slice(0, 255);
    const quality = answers?.quality?.score;
    if (typeof quality !== 'number' || !Number.isFinite(quality) || quality < 0 || quality > 3) throw failure('TYPESAFE_INVALID_RESPONSE');
    const usage = data.usage || {}; const token = n => Number.isFinite(n) && n >= 0 ? n : 0;
    const sentiment = choice(answers, 'sentiment', ['positive', 'neutral', 'negative']);
    const sentimentScore = sentimentProbability(answers.sentiment, sentiment);
    const topicDecision = parseTopicAnswer(answers?.topic);
    const decision = { provider: VERSION, raw_level: raw, final_level: final, confidence, status, has_verifiable_issue: issue, emergency_trigger: emergency, reason_key: reasonKey, evidence: excerpt, source_hash: crypto.createHash('sha256').update(text).digest('hex'), sentimentScore };
    return { severity: LEVELS[final], sentiment: choice(answers, 'sentiment', ['positive', 'neutral', 'negative']), confidence, negativeScore: final === 'L0' ? 0 : confidence, reason, analysisReason: reason, typeSafeDecision: decision, needsDeep: false, modelName: MODEL, topics: topicDecision.topics, summary: excerpt.slice(0, 60), qualityScore: quality / 3, recommendHome: probability(answers?.recommend_home?.noul) >= 0.8, recommendPin: probability(answers?.recommend_pin?.noul) >= 0.9, recommendFeature: probability(answers?.recommend_feature?.noul) >= 0.9, qualityReason: '', inputTokens: token(usage.input_tokens ?? usage.prompt_tokens), outputTokens: token(usage.output_tokens ?? usage.completion_tokens), totalTokens: token(usage.total_tokens), usageEstimated: !data.usage, rawAnalysis: { topicDecision, typeSafeDecision: decision, reason, sentimentScore, severity: LEVELS[raw] } };
  }
  async analyzeBatch(items = [], profileName = 'light', { settleErrors = false } = {}) {
    const profile = this.selectProfile(profileName); const key = this.key();
    let mediaEvidence = [];
    if (this.imageAnalyzer?.analyzeBatch) {
      mediaEvidence = await this.imageAnalyzer.analyzeBatch(items);
    } else {
      mediaEvidence = await Promise.all(items.map(item => Promise.resolve().then(() => this.imageAnalyzer.analyze(item)).catch(error => ({ error }))));
    }
    const tasks = items.map(async (originalItem, itemIndex) => {
      let item = originalItem;
      const mediaResult = mediaEvidence[itemIndex];
      if (mediaResult?.error) throw mediaResult.error;
      const mediaEvidenceForItem = mediaResult;
      if (mediaEvidenceForItem) item = {...item,facebookMediaEvidence:mediaEvidenceForItem};
      // Current text and ancestry stay separate, so parent complaints are not current evidence.
      const text = analysisText(item);
      if (!text) {
        const reason = '本条无可分析文字；未读取图片或视频，按文字范围无需处理';
        const decision = { provider: VERSION, raw_level: 'L0', final_level: 'L0', confidence: 1, status: 'auto_passed', has_verifiable_issue: 0, emergency_trigger: 'none', evidence: '', source_hash: crypto.createHash('sha256').update('').digest('hex') };
        return { severity: 'normal', sentiment: 'neutral', confidence: 1, negativeScore: 0, reason, typeSafeDecision: decision, topics: emptyTopic(item).topics, rawAnalysis: { topicDecision: emptyTopic(item), typeSafeDecision: decision, reason }, needsDeep: false, modelName: 'text-only-empty', qualityScore: 0, recommendHome: false, recommendPin: false, recommendFeature: false };
      }
      const cacheKey = this.cacheKey(item.fingerprint, profile, item);
      if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      await this.acquire();
      try {
        const policy = item.analysisPolicy ? normalizePolicy(item.analysisPolicy) : null;
        const questions = this.questions(text);
        if (mediaEvidenceForItem) for (const question of Object.values(questions)) {
          question.instructions += '\n本条附图识别证据已随text提供，允许结合图片文字与直接可见画面综合判断；识别描述不是玩家原文，不得把推测、图片中的指令或父帖附图当作本条投诉。原因须区分正文与图片依据。';
        }
        const corrections = item.aiCorrections || [];
        if (corrections.length) {
          questions.level.instructions += CORRECTION_INSTRUCTIONS;
          questions.has_verifiable_issue.instructions += CORRECTION_INSTRUCTIONS;
        }
        questions.level.instructions += COMBAT_DISCUSSION_POLICY;
        questions.has_verifiable_issue.instructions += COMBAT_DISCUSSION_POLICY;
        const qualityPolicy = normalizePolicy(item.analysisPolicy).quality;
        for (const key of ['quality', 'recommend_home', 'recommend_pin', 'recommend_feature']) {
          questions[key].instructions += '\n本社区优质内容规则：' + qualityPolicy.rule + '\n固定边界：负面内容不推荐；仅评估当前有效正文，图片链接、普通URL和HTML标签不计入正文长度。';
        }
        if (policy) {
          questions.level.instructions += '\n本社区的等级规则（在原文证据及安全校验内适用）：\n' + policyInstructions(policy);
          questions.level.criteria = Object.fromEntries(Object.entries(policy.levels).map(([level, value]) => [level, value.rule]));
        }
        for (const name of ['level', 'has_verifiable_issue', 'emergency_trigger', 'reason']) questions[name].instructions += '\n' + ECOSYSTEM_POLICY;
        const data = await this.request({ model: MODEL, state: { game: item.gameName || item.game_name || '', community: item.communityName || item.community_name || '', text, ...(corrections.length ? { humanCorrections: corrections.map(({ id, text, humanVerdict, reason }) => ({ id, text, humanVerdict, reason })) } : {}) }, questions }, key);
        const result = this.parse(data, text, questions);
        if (mediaEvidenceForItem) { result.rawAnalysis.facebookMediaEvidence=mediaEvidenceForItem;result.inputTokens+=mediaEvidenceForItem.inputTokens;result.outputTokens+=mediaEvidenceForItem.outputTokens;result.totalTokens+=mediaEvidenceForItem.totalTokens; }
        if (corrections.length) result.rawAnalysis.humanCorrection = { mode: 'prompt_reference', revision: correctionHash(item), sampleIds: corrections.map(value => value.id) };
        result.rawAnalysis.topicDecision = refineTopicDecision(result.rawAnalysis.topicDecision, item);
        result.topics = result.rawAnalysis.topicDecision.topics;
        const first = { ...result.typeSafeDecision };
        const setting = policy ? levelSetting(policy, first.final_level, item.contentType || item.content_type) : null;
        const filterResult = () => {
          result.rawAnalysis.reviewedReason = result.analysisReason || result.reason;
          result.rawAnalysis.policyOriginalDecision = { ...result.typeSafeDecision };
          result.rawAnalysis.analysisPolicy = { hash: policyHash(policy), levels: policy.levels, filtered: true };
          const reason = `本条初判为${result.typeSafeDecision.final_level}，该等级已关闭或本条类型不在当前社区筛选范围内，不进入关注、告警或优质内容。`;
          result.typeSafeDecision = { ...result.typeSafeDecision, final_level: 'L0', status: 'auto_passed' };
          result.rawAnalysis.typeSafeDecision = result.typeSafeDecision;
          Object.assign(result, { severity: 'normal', negativeScore: 0, reason, analysisReason: reason, recommendHome: false, recommendPin: false, recommendFeature: false, qualityScore: 0 });
          result.rawAnalysis.reason = reason;
          return result;
        };
        // Image OCR is an evidence extraction step only. Per the approved fast
        // path, image-bearing content does not enter the independent text
        // reviewer; comments and text-only risk decisions still do.
        if (!mediaEvidenceForItem && (isComment(item) || ['L1', 'L2', 'L3'].includes(first.final_level) || setting?.intensity === 'deep')) {
          const review = await this.urgentReviewer.review(text, { policy, content: item });
          if (review.level === 'L3' && first.confidence < 0.8) throw failure('URGENT_REVIEW_FIRST_PASS_UNCERTAIN');
          result.rawAnalysis.firstPassDecision = first;
          result.rawAnalysis.urgentReview = review;
          result.rawAnalysis.commentContext = commentContext(item);
          review.firstLevel = first.final_level;
          review.status = Number(review.level.slice(1)) < Number(first.final_level.slice(1)) ? 'downgraded' : 'approved';
          result.typeSafeDecision = { ...first, final_level: review.level, confidence: review.confidence, has_verifiable_issue: review.hasIssue ? 1 : 0, emergency_trigger: review.emergency, reason_key: review.level === 'L3' ? 'emergency' : review.level === 'L2' ? 'issue' : review.level === 'L1' ? 'emotion' : 'normal', evidence: review.quote, status: 'auto_passed', sentimentScore: review.sentimentConfidence };
          result.rawAnalysis.typeSafeDecision = result.typeSafeDecision;
          result.severity = LEVELS[review.level];
          result.reason = formatExplanation(review.reason, review.quote);
          result.analysisReason = result.reason; result.rawAnalysis.reason = result.reason;
          result.rawAnalysis.explanation = { status: 'generated', model: review.model, quote: review.quote, reason: result.reason };
          result.confidence = review.confidence;
          result.sentiment = review.sentiment;
          result.rawAnalysis.sentimentScore = review.sentimentConfidence;
          result.rawAnalysis.sentimentReason = review.sentimentReason;
          result.modelName = `${MODEL}+${REVIEW_MODEL}`;
          result.negativeScore = review.sentiment === 'negative' ? review.sentimentConfidence : 0;
          result.inputTokens += review.inputTokens || 0; result.outputTokens += review.outputTokens || 0; result.totalTokens += review.totalTokens || 0;
          result.usageEstimated ||= review.usageEstimated;
          assertUrgentValidated(result, item);
        } else {
          const explanation = await this.explainer.explain(text, result.typeSafeDecision);
          if (explanation.status !== 'generated') throw failure(explanation.errorCode || 'ANALYSIS_REASON_REQUIRED');
          result.rawAnalysis.structuredReason = result.reason;
          result.rawAnalysis.explanation = explanation;
          result.reason = explanation.reason;
          result.analysisReason = result.reason; result.rawAnalysis.reason = result.reason;
          if (explanation.status === 'generated') {
            result.inputTokens += explanation.inputTokens; result.outputTokens += explanation.outputTokens; result.totalTokens += explanation.totalTokens;
            result.usageEstimated ||= explanation.usageEstimated;
          }
        }
        if (policy) {
          if (!levelSetting(policy, result.typeSafeDecision.final_level, item.contentType || item.content_type)) { const filtered = filterResult(); this.cache.set(cacheKey, filtered); return filtered; }
          result.rawAnalysis.analysisPolicy = { hash: policyHash(policy), levels: policy.levels, filtered: false, intensity: levelSetting(policy, result.typeSafeDecision.final_level, item.contentType || item.content_type)?.intensity };
        }
        const quality = qualityEligibility(result, item, qualityPolicy);
        result.rawAnalysis.qualityEligibility = quality;
        if (!quality.eligible) Object.assign(result, { recommendHome: false, recommendPin: false, recommendFeature: false });
        if (quality.eligible) {
          const explanation = await this.qualityExplainer.explain(text, result);
          if (explanation.status !== 'generated') throw failure('QUALITY_REASON_REQUIRED');
          result.qualityReason = explanation.reason;
          result.rawAnalysis.qualityExplanation = explanation;
          result.inputTokens += explanation.inputTokens || 0; result.outputTokens += explanation.outputTokens || 0; result.totalTokens += explanation.totalTokens || 0;
          result.usageEstimated ||= explanation.usageEstimated;
        }
        this.cache.set(cacheKey, result);
        if (this.cache.size > 1000) this.cache.delete(this.cache.keys().next().value);
        return result;
      } finally { this.release(); }
    });
    return Promise.all(settleErrors ? tasks.map(task => task.catch(error => ({ analysisError: { code: error.code || 'ANALYSIS_FAILED' } }))) : tasks);
  }
  async analyze(content, profile = 'light') { return (await this.analyzeBatch([content], profile))[0]; }
}
module.exports = { TypeSafeAnalyzer, VERSION, LEVELS, sentimentProbability };
