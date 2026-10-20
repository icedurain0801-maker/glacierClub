const crypto = require('node:crypto');
const { plain } = require('./typesafeTestService');
const { verifiedSeriousImpact, factualClauses } = require('./gameRiskEvidence');
const { CONTEXT_PROVIDER, contextHash, isComment } = require('./commentAnalysisContext');
const { isChineseExplanation } = require('../integrations/chineseExplanation');
const VERSION = 'urgent-independent-review-v1';
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
function analysisText(content = {}) {
  return plain([content.contentType === 'comment' || content.content_type === 'comment' ? '' : content.title, content.body, require('../../../shared/facebookMedia').evidenceText(content)].filter(Boolean).join('\n'));
}
function seriousEvidence(text, quote, category) {
  const source = String(text || ''), excerpt = String(quote || '');
  const matches = excerpt && source.includes(excerpt) || excerpt && source.replace(/\s+/g, ' ').includes(excerpt.replace(/\s+/g, ' '));
  if (!excerpt || !matches) return false;
  if (category === 'ecosystem_abuse') return require('./gameEcosystemRisk').ecosystemEvidence(source, excerpt)
    || require('./gameEcosystemRisk').ecosystemEvidence(source, source);
  if (category === 'login_or_asset') return Boolean(verifiedSeriousImpact({ body: quote }));
  const patterns = category === 'compliance_or_refund'
    ? [/(?:已经|已|正在|我们|组织|集体).{0,30}(?:投诉.{0,12}(?:12315|监管|消协)|(?:12315|监管|消协).{0,12}投诉|集体退款|集体差评|泄露.{0,12}隐私)/, /(?:已|正在).{0,20}(?:违法|违规).{0,20}(?:产品|游戏|运营)/]
    : category === 'churn' ? [/(?:公会|玩家|成员).{0,30}(?:过半|一半以上|大批|大量).{0,20}(?:退游|流失|弃坑)/, /(?:大量|大批).{0,15}玩家.{0,20}(?:退游|流失|弃坑)/] : [];
  return factualClauses({ body: quote }).some(clause => patterns.some(pattern => pattern.test(clause)));
}
function assertUrgentValidated(analysis, content = {}) {
  const mediaEvidence = analysis.rawAnalysis?.facebookMediaEvidence;
  if (mediaEvidence) {
    if (!require('../../../shared/facebookMedia').evidenceText(content,mediaEvidence)) throw Object.assign(new Error('image evidence does not match content attachments'),{code:'FACEBOOK_IMAGE_EVIDENCE_MISMATCH'});
    content = {...content,facebookMediaEvidence:mediaEvidence};
  }
  const provider = (analysis.typeSafeDecision || analysis.rawAnalysis?.typeSafeDecision)?.provider;
  if (provider === CONTEXT_PROVIDER) {
    const raw = analysis.rawAnalysis || {}, decision = analysis.typeSafeDecision || raw.typeSafeDecision;
    // Image evidence has already been independently extracted and hash-bound
    // to the attached media. The fast path intentionally skips text review.
    // Keep the attachment/hash check above, but do not require a second model.
    if (mediaEvidence && !raw.urgentReview) return;
    const reviewedDecision = raw.analysisPolicy?.filtered ? raw.policyOriginalDecision : decision;
    const required = ['attention', 'negative', 'urgent'].includes(analysis.severity) || raw.firstPassDecision || (isComment(content) && analysisText(content));
    if (required) {
      const review = raw.urgentReview;
      const hasText = Object.hasOwn(content, 'body') || Object.hasOwn(content, 'title');
      const hasContext = Object.hasOwn(content, 'analysisContext') || Object.hasOwn(content, 'analysis_root_id');
      const reason = String((raw.analysisPolicy?.filtered ? raw.reviewedReason : null) || analysis.analysisReason || analysis.analysis_reason || analysis.reason || '');
      if (!review || review.version !== VERSION || review.model !== 'gpt-5.6-luna' || !['approved', 'downgraded'].includes(review.status)
        || !['L0', 'L1', 'L2', 'L3'].includes(review.level) || typeof review.hasIssue !== 'boolean' || typeof review.isQuestion !== 'boolean' || !['none', 'login_or_asset', 'compliance_or_refund', 'churn', 'ecosystem_abuse'].includes(review.emergency)
        || review.level !== reviewedDecision?.final_level || !Number.isFinite(review.confidence) || review.confidence < 0 || review.confidence > 1
        || !['positive', 'neutral', 'negative'].includes(review.sentiment) || review.sentiment !== analysis.sentiment
        || !Number.isFinite(review.sentimentConfidence) || review.sentimentConfidence < 0 || review.sentimentConfidence > 1
        || raw.sentimentScore !== review.sentimentConfidence || raw.sentimentReason !== review.sentimentReason
        || !isChineseExplanation(review.reason) || !isChineseExplanation(review.sentimentReason)
        || typeof review.quote !== 'string' || !review.quote.trim() || !reason.includes(review.reason) || !reason.includes(review.quote)
        || review.sourceHash !== decision?.source_hash || (hasText && (hash(analysisText(content)) !== review.sourceHash || !analysisText(content).includes(review.quote)))
        || !['available', 'missing', 'not_applicable'].includes(review.contextStatus) || !review.contextHash || !raw.commentContext
        || (hasContext && contextHash(content) !== review.contextHash)
        || (raw.commentContext && contextHash({ contentType: raw.commentContext.status === 'not_applicable' ? 'post' : 'comment', analysisContext: raw.commentContext }) !== review.contextHash)
        || (review.contextStatus === 'missing' && !review.sentimentReason.includes('原帖缺失'))
        || (review.sentiment === 'positive' && review.level !== 'L0')) {
        throw Object.assign(new Error('analysis requires a matching Luna secondary review and contextual sentiment reason'), { code: ['negative', 'urgent'].includes(analysis.severity) ? 'URGENT_REVIEW_REQUIRED' : 'SECONDARY_REVIEW_REQUIRED' });
      }
    }
  }
  const newPolicy = ['typesafe-v13-l2-l3-secondary-review-v1', CONTEXT_PROVIDER].includes(provider);
  if (analysis.severity !== 'urgent' && !(newPolicy && analysis.severity === 'negative')) return;
  const review = analysis.rawAnalysis?.urgentReview;
  const decision = analysis.typeSafeDecision || analysis.rawAnalysis?.typeSafeDecision;
  const reason = String(analysis.analysisReason || analysis.analysis_reason || analysis.reason || '').trim();
  const expectedLevel = analysis.severity === 'urgent' ? 'L3' : 'L2';
  const hasText = Object.hasOwn(content, 'body') || Object.hasOwn(content, 'title');
  if (!review || review.version !== VERSION || !['approved', ...(expectedLevel === 'L2' ? ['downgraded'] : [])].includes(review.status) || review.level !== expectedLevel
    || !Number.isFinite(review.confidence) || review.confidence < 0.8 || review.confidence > 1 || review.hasIssue !== true || review.isQuestion !== false
    || typeof review.reason !== 'string' || !review.reason.trim() || typeof review.quote !== 'string' || !review.quote.trim()
    || !reason || !reason.includes(review.reason.trim()) || !reason.includes(review.quote)
    || (expectedLevel === 'L3' && !seriousEvidence(review.quote, review.quote, review.emergency))
    || !review.sourceHash || review.sourceHash !== decision?.source_hash
    || !decision || decision.final_level !== expectedLevel || !Number.isFinite(decision.confidence) || decision.confidence < 0.8 || decision.confidence > 1
    || !Number.isFinite(decision.has_verifiable_issue) || decision.has_verifiable_issue < 0.5 || decision.has_verifiable_issue > 1 || decision.reason_key !== (expectedLevel === 'L3' ? 'emergency' : 'issue')
    || decision.emergency_trigger !== review.emergency
    || (hasText && (hash(analysisText(content)) !== review.sourceHash || !analysisText(content).includes(review.quote) || (expectedLevel === 'L3' && !seriousEvidence(analysisText(content), review.quote, review.emergency))))) {
    throw Object.assign(new Error('urgent analysis requires an independent review with matching evidence and reason'), { code: 'URGENT_REVIEW_REQUIRED' });
  }
}
module.exports = { VERSION, hash, analysisText, seriousEvidence, assertUrgentValidated };
