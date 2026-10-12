const SEVERITY_RANK = Object.freeze({ normal: 0, attention: 1, negative: 2, urgent: 3 });
const { factualClauses, hasConcreteCrashReport, verifiedSeriousImpact } = require('./gameRiskEvidence');
const { productIssueEvidence, isPlannedMaintenance } = require('./productIssueEvidence');
const { POLICY_VERSION, LEVELS, evaluateRiskDecision } = require('./riskDecisionTree');
const NEGATIVE_SCORE_PENDING_THRESHOLD = 0.5;
const RISK_POLICY_VERSION = POLICY_VERSION;

// 仅在负面内容上识别游戏问题，避免正面攻略里的“闪退解决方法”等词触发风险升级。
const GAME_ISSUE_PATTERNS = Object.freeze([
  /(?:出|出现|遇到|发生|发现|存在).{0,8}(?:\bbug\b|崩溃|闪退|卡死|卡顿|报错|故障|异常|漏洞).{0,12}(?:了|导致|影响|损失|无法|不能|严重|频繁)/i,
  /(?:崩溃|闪退|卡死|卡顿|报错|故障).{0,12}(?:了|严重|频繁|一直|导致|影响|无法|不能)/i,
  /(?:频繁|一直|总是|反复)(?:崩溃|闪退|卡死|卡顿|报错)/i,
  /\b(?:game|app|server|login|payment)\s+(?:(?:is|keeps|has|was)\s+)?(?:crashing|crashes|broken|failing|failed|unavailable|not working)\b/i,
  /(?:无法|不能|没法|进不去|进不了|无法正常|不能正常).{0,12}(?:启动|登录|登陆|进入|使用|参与|完成|进行|连接|匹配|充值|退款|领取|领取奖励)/i,
  /(?:奖励|道具|货币|数值|规则|活动).{0,16}(?:异常|错误|不对|不符|未到账|不到账|丢失|消失|失败|无法|不能)/i,
  /(?:充值|扣费|退款|付费|支付).{0,16}(?:失败|异常|重复|错误|不到账|未到账|扣错|损失)/i,
  /(?:登录|登陆|账号|帐号|角色|存档).{0,16}(?:异常|失败|丢失|找回|封禁|被盗|安全|无法|不能)/i,
  /(?:服务器|网络|连接|掉线|断线|匹配).{0,16}(?:不可用|异常|失败|不稳定|中断|超时|无法|不能|掉线)/i,
  /(?:外挂|开挂|作弊|恶意利用|安全风险|漏洞).{0,16}(?:影响|破坏|损失|无法|不能)/i,
  /(?:影响|导致|造成|无法).{0,16}(?:游戏体验|正常参与|正常进行|使用|游玩|损失)/i,
  /(?:红点|提示|状态).{0,12}(?:消不掉|无法消除|一直存在|卡住)/i
]);

function normalizeEnum(value, fallback) {
  const normalized = String(value || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(SEVERITY_RANK, normalized) ? normalized : fallback;
}

function bounded(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

function evidenceText({ title, body, topics, reason }) {
  return [title, body, ...(Array.isArray(topics) ? topics : []), reason]
    .filter(value => value != null && String(value).trim())
    .map(value => String(value).trim())
    .join(' ');
}

function hasGameIssueSignal(input = {}) {
  // Legacy results have no semantic flag: require an observable problem
  // expression from the content, rather than a topic/model reason or bare word.
  return factualClauses(input).some(text => GAME_ISSUE_PATTERNS.some(pattern => pattern.test(text)));
}

function normalizeSeverity(input = {}) {
  const decision = evaluateRiskDecision(input);
  if (decision) return { severity: LEVELS[decision.level], originalSeverity: normalizeEnum(input.rawAnalysis?.severity ?? input.severity, 'normal'), reasons: [decision.gate_result], gameIssueMatched: ['L2', 'L3'].includes(decision.level), seriousImpact: null, decision };
  const sentiment = String(input.sentiment || '').toLowerCase();
  const rawSeverity = String(input.severity || '').toLowerCase();
  const validOriginalSeverity = Object.prototype.hasOwnProperty.call(SEVERITY_RANK, rawSeverity);
  const originalSeverity = normalizeEnum(rawSeverity, 'normal');
  let severity = 'normal';
  const reasons = [];
  const negativeScore = bounded(input.negativeScore ?? input.negative_score);
  const eligible = sentiment === 'negative' || sentiment === 'neutral';
  const observedImpact = eligible ? verifiedSeriousImpact({ title: input.title, body: input.body }) : null;
  const gameIssueMatched = eligible && !isPlannedMaintenance(input) && (Boolean(observedImpact) || Boolean(productIssueEvidence(input)) || hasConcreteCrashReport(input) || (typeof input.gameComplaint === 'boolean'
    ? input.gameComplaint : hasGameIssueSignal(input)));
  // Game-relatedness alone does not make a neutral question a risk.
  const inAttention = sentiment === 'negative' || (sentiment === 'neutral' && gameIssueMatched);
  const inNegative = inAttention && gameIssueMatched;
  // Only a model decision can promote a qualifying issue to urgent. Repeated
  // normalization uses the original decision, never a previous policy upgrade.
  const modelSeverity = input.rawAnalysis?.severity ?? input.originalSeverity ?? originalSeverity;
  const seriousImpact = eligible ? verifiedSeriousImpact(input) : null;

  if (!validOriginalSeverity) reasons.push('invalid_severity_defaulted');

  if (sentiment === 'positive') {
    if (!validOriginalSeverity || originalSeverity !== 'normal') reasons.push('positive_forced_normal');
  } else if (inAttention) {
    severity = 'attention';
    if (sentiment === 'negative' && originalSeverity === 'normal') reasons.push('negative_floor_attention');
    if (sentiment === 'neutral') reasons.push('game_experience_attention');
    if (gameIssueMatched) {
      severity = 'negative';
      reasons.push('game_issue_upgrade');
    }
    if (inNegative && modelSeverity === 'urgent' && seriousImpact) {
      severity = 'urgent';
      reasons.push('ai_serious_upgrade', 'serious_impact_verified');
    } else if (modelSeverity === 'urgent' && !seriousImpact) {
      reasons.push('urgent_without_serious_evidence');
    }
  }

  return { severity, originalSeverity, reasons, gameIssueMatched, seriousImpact };
}

// Repeated normalization must retain the model result, rather than treating a
// previously normalized severity as the original model decision.
function normalizeAnalysisResult(analysis, context = {}) {
  if (!analysis) return analysis;
  let persistedContext = analysis.risk_context || {};
  if (typeof persistedContext === 'string') {
    try { persistedContext = JSON.parse(persistedContext); } catch (_) { persistedContext = {}; }
  }
  analysis = { ...persistedContext, ...analysis };
  const storedDecision = analysis.riskDecision ?? analysis.rawAnalysis?.riskDecision;
  const normalized = normalizeSeverity({ ...analysis, riskDecision: storedDecision,
    title: context.title ?? analysis.title,
    body: context.body ?? analysis.body ?? storedDecision?.verifiedSourceText ?? analysis.rawAnalysis?.verifiedEvidenceText,
    evidenceTypes: context.evidenceTypes ?? storedDecision?.verifiedEvidenceTypes,
    riskMetadata: context.riskMetadata ?? storedDecision?.verifiedRiskMetadata });
  const rawAnalysis = { ...(analysis.rawAnalysis || {
    sentiment: analysis.sentiment, severity: analysis.originalSeverity ?? analysis.severity,
    negativeScore: analysis.negativeScore ?? analysis.negative_score, confidence: analysis.confidence,
    reason: analysis.reason ?? analysis.analysisReason ?? analysis.analysis_reason,
    topics: analysis.topics, summary: analysis.summary, qualityScore: analysis.qualityScore ?? analysis.quality_score,
    recommendHome: analysis.recommendHome ?? analysis.recommend_home,
    recommendPin: analysis.recommendPin ?? analysis.recommend_pin,
    recommendFeature: analysis.recommendFeature ?? analysis.recommend_feature,
    qualityReason: analysis.qualityReason ?? analysis.quality_reason,
    gameComplaint: analysis.gameComplaint, gameComplaintEvidence: analysis.gameComplaintEvidence,
    urgentImpact: analysis.urgentImpact, urgentEvidence: analysis.urgentEvidence,
    gameExperienceRelated: analysis.gameExperienceRelated
  }) };
  // A verified source excerpt travels with cache/persistence, which may lack body.
  // An explicitly supplied current body always takes precedence on revalidation.
  if (normalized.seriousImpact) rawAnalysis.verifiedEvidenceText = normalized.seriousImpact.evidence;
  if (normalized.decision) {
    rawAnalysis.originalRiskDecision ??= analysis.riskDecision ?? null;
    rawAnalysis.riskDecision = normalized.decision;
  }
  // Keep the model's content-specific explanation. Policy validation has its
  // own reason in riskDecision and must not replace the model response.
  const modelReason = [rawAnalysis.reason, rawAnalysis.originalRiskDecision?.reason,
    analysis.analysisReason, analysis.analysis_reason, analysis.reason]
    .find(value => typeof value === 'string' && value.trim());
  const analysisReason = modelReason?.trim().slice(0, 255) || normalized.decision?.reason || null;
  return {
    ...analysis, severity: normalized.severity, rawAnalysis,
    ...(normalized.decision ? { riskDecision: normalized.decision, reason: analysisReason, needsDeep: analysis.needsDeep || normalized.decision.confidence < 0.6 || normalized.decision.need_clarification || Boolean(normalized.decision.downgrade_suggest) } : {}),
    urgentImpact: normalized.seriousImpact?.category || 'none', urgentEvidence: normalized.seriousImpact?.evidence || '',
    gameComplaint: normalized.gameIssueMatched,
    gameExperienceRelated: analysis.gameExperienceRelated ?? normalized.gameIssueMatched,
    originalSeverity: analysis.originalSeverity ?? normalized.originalSeverity,
    severityNormalizationReasons: [...new Set([...(analysis.severityNormalizationReasons || []), ...normalized.reasons])],
    riskPolicyVersion: RISK_POLICY_VERSION,
    analysisReason
  };
}

function buildAnalysisReason(reason, normalized, maxLength = 255) {
  const base = String(reason || '').trim();
  if (!normalized?.reasons?.length) return base ? base.slice(0, maxLength) : null;
  const audit = `severity=${normalized.originalSeverity}->${normalized.severity};reasons=${normalized.reasons.join(',')}`;
  if (audit.length > maxLength) throw new RangeError('severity normalization audit exceeds analysis_reason limit');
  if (base.includes(audit)) return base.slice(0, maxLength);
  const separator = ' | ';
  const baseLimit = maxLength - audit.length - separator.length;
  return baseLimit > 0 && base ? `${base.slice(0, baseLimit)}${separator}${audit}` : audit;
}

function retainVerifiedUrgent(current, previous, context = {}) {
  if (!previous || current.severity === 'urgent') return current;
  let saved = previous.risk_context || {};
  if (typeof saved === 'string') { try { saved = JSON.parse(saved); } catch { return current; } }
  if (![RISK_POLICY_VERSION, 'verifiable-issue-gates-v10-neutral-no-risk'].includes(previous.riskPolicyVersion ?? saved.riskPolicyVersion)
    || !previous.content_fingerprint || previous.content_fingerprint !== current.contentFingerprint) return current;
  const prior = normalizeAnalysisResult(previous, context);
  if (prior.severity !== 'urgent' || !prior.riskDecision) return current;
  const riskDecision = { ...prior.riskDecision,
    downgrade_suggest: `后续分析建议${current.riskDecision?.level_name || current.severity}，保留紧急待人工复核` };
  return normalizeAnalysisResult({ ...current, riskDecision, needsDeep: true,
    rawAnalysis: { ...current.rawAnalysis, riskDecision, subsequentReview: current.riskDecision || null } }, context);
}

module.exports = {
  SEVERITY_RANK,
  NEGATIVE_SCORE_PENDING_THRESHOLD,
  RISK_POLICY_VERSION,
  GAME_ISSUE_PATTERNS,
  hasGameIssueSignal,
  normalizeSeverity,
  normalizeAnalysisResult,
  buildAnalysisReason,
  retainVerifiedUrgent
};
