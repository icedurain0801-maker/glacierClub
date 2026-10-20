'use strict';
const { normalizeQualityPolicy } = require('./aiAnalysisPolicy');
const { qualityBodyLength, qualityBodyLengthSql } = require('./qualityBodyText');
function qualityEligibility(analysis, content, quality) {
  const policy = normalizeQualityPolicy(quality);
  const bodyLength = qualityBodyLength(content.body);
  const type = content.contentType || content.content_type || 'post';
  let reason = '符合当前优质内容规则';
  if (!policy.enabled) reason = '优质内容筛选已关闭';
  else if (!policy.ranges.includes(type)) reason = '内容类型不在优质内容筛选范围';
  else if (String(analysis.sentiment).toLowerCase() === 'negative') reason = '负面内容不进入优质候选';
  else if (bodyLength < policy.minBodyLength) reason = `有效正文${bodyLength}字，未达到${policy.minBodyLength}字`;
  else if (analysis.qualityScore == null || !Number.isFinite(Number(analysis.qualityScore)) || Number(analysis.qualityScore) < policy.minScore) reason = `AI质量评分未达到${policy.minScore.toFixed(2)}`;
  else if (!analysis.recommendHome && !analysis.recommendPin && !analysis.recommendFeature) reason = 'AI未给出推荐标记';
  return { eligible: reason === '符合当前优质内容规则', reason, bodyLength, policy };
}
function candidatePolicy(row) {
  let value = row.quality_policy;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = null; } }
  return normalizeQualityPolicy(value);
}
// Each candidate uses its own analysis snapshot. Historical NULL snapshots use 0.70/50.
function qualitySnapshotSql(alias = 'q', content = 'c') {
  const field = key => `JSON_EXTRACT(${alias}.quality_policy,'$.${key}')`;
  return [
    `COALESCE(JSON_UNQUOTE(${field('enabled')}),'true')='true'`,
    `(${alias}.quality_policy IS NULL OR JSON_CONTAINS(${field('ranges')},JSON_QUOTE(${content}.content_type)))`,
    `${qualityBodyLengthSql(content + '.body')} >= COALESCE(${field('minBodyLength')} + 0,50)`,
    `${alias}.quality_score >= COALESCE(${field('minScore')} + 0,0.7)`
  ];
}
module.exports = { qualityEligibility, candidatePolicy, qualitySnapshotSql };
