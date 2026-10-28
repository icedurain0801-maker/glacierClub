'use strict';
const crypto = require('node:crypto');
const { ECOSYSTEM_POLICY } = require('./gameEcosystemRisk');
const keys = ['L0', 'L1', 'L2', 'L3'];
function defaultPolicy() {
  return { version: 1, levels: {
    L0: { intensity: 'light', ranges: ['post', 'comment'], rule: '无明确不满或实际异常的正常咨询、机制讨论、签到、晒卡、攻略为L0。评论结合原帖和被回复评论理解当前态度，不直接继承原帖情感或等级，不推测图片；语义不足保留中性。识别情感、议题和优质内容。' },
    L1: { intensity: 'light', ranges: ['post', 'comment'], rule: '表达不满但没有具体可核查的产品或运营异常为L1。纯情绪、个人抽卡运气抱怨（即使声称暗改）、偶发且无复现线索的现象为关注级，不能因情绪强烈升级。关注级同样必须经过独立AI二次复核。' },
    L2: { intensity: 'deep', ranges: ['post', 'comment'], rule: '原文同时指出具体可核查对象和实际产品或运营异常为L2，如复现卡死、奖励未到账、具体匹配不公平投诉。纯咨询、猜测、无异常机制讨论不算。需明确原文依据并独立复核。' },
    L3: { intensity: 'deep', ranges: ['post', 'comment'], rule: '已有具体问题且原文明确报告严重紧急事件为L3：持续或群体无法游玩、账号被盗或隐私泄露、重大明确资损、实际外部投诉或组织集体退款差评、大量玩家或公会成员过半退游。普通退款咨询、个人口头弃坑、假设、否定及已解决历史不触发。需明确原文证据且独立复核通过。' }
  }, quality: defaultQualityPolicy() };
}
function defaultQualityPolicy() {
  return { enabled: true, ranges: ['post', 'comment'], minScore: 0.7, minBodyLength: 50, rule: '事实清晰、原创有用，包含具体游戏经验、可操作攻略或有依据的深入讨论。简短签到、空泛赞美、广告和无信息晒卡不推荐。推荐首页需信息充实且有游戏价值；置顶需详细攻略或重大权威信息；加精需原创充实、有论据且有帮助。' };
}
function normalizeQualityPolicy(value, { strict = false } = {}) {
  const defaults = defaultQualityPolicy();
  if (value == null && !strict) return defaults;
  const valid = value && typeof value.enabled === 'boolean' && Array.isArray(value.ranges) && value.ranges.length && value.ranges.every(v => ['post', 'comment'].includes(v)) && typeof value.minScore === 'number' && Number.isFinite(value.minScore) && value.minScore >= 0 && value.minScore <= 1 && Number.isInteger(value.minBodyLength) && value.minBodyLength >= 1 && value.minBodyLength <= 10000 && typeof value.rule === 'string' && value.rule.trim() && value.rule.length <= 2000;
  if (!valid) {
    if (strict) throw Object.assign(new Error('优质内容配置无效：评分须为0～1，正文长度须为1～10000的整数，至少选择一个范围并填写最多2000字的规则'), { code: 'INVALID_INPUT' });
    return defaults;
  }
  return { enabled: value.enabled, ranges: [...new Set(value.ranges)], minScore: value.minScore, minBodyLength: value.minBodyLength, rule: value.rule.trim() };
}
function normalizePolicy(value, { strict = false } = {}) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = null; } }
  const defaults = defaultPolicy();
  // Old policies have no quality section; retain their existing defaults.
  if (value && Object.hasOwn(value, 'quality')) defaults.quality = normalizeQualityPolicy(value.quality, { strict });
  const invalid = message => { throw Object.assign(new Error(message), { code: 'INVALID_INPUT' }); };
  if (strict && (!value || value.version !== 1 || !value.levels || Object.keys(value.levels).sort().join() !== keys.join())) invalid('必须完整配置 L0/L1/L2/L3');
  for (const key of keys) {
    const item = value?.levels?.[key];
    if (!item) continue;
    if (strict && (!['off', 'light', 'deep'].includes(item.intensity) || !Array.isArray(item.ranges) || !item.ranges.length || item.ranges.some(v => !['post', 'comment'].includes(v)) || typeof item.rule !== 'string' || !item.rule.trim() || item.rule.length > 2000)) invalid(`${key} 的强度、范围或规则无效（规则最多2000字）`);
    defaults.levels[key] = {
      intensity: ['off', 'light', 'deep'].includes(item.intensity) ? item.intensity : defaults.levels[key].intensity,
      ranges: Array.isArray(item.ranges) ? [...new Set(item.ranges.filter(v => ['post', 'comment'].includes(v)))] : defaults.levels[key].ranges,
      rule: typeof item.rule === 'string' ? item.rule.trim().slice(0, 2000) : defaults.levels[key].rule
    };
  }
  return defaults;
}
function policyHash(policy) { return crypto.createHash('sha256').update(JSON.stringify(normalizePolicy(policy))).digest('hex'); }
function policyForJob(job) { return job.analysis_policy ? normalizePolicy(job.analysis_policy) : null; }
function levelSetting(policy, level, contentType) {
  const setting = normalizePolicy(policy).levels[level];
  return setting && setting.intensity !== 'off' && setting.ranges.includes(contentType === 'comment' ? 'comment' : 'post') ? setting : null;
}
function policyInstructions(policy) { return keys.map(key => `${key}：${normalizePolicy(policy).levels[key].rule}`).join('\n') + '\n' + ECOSYSTEM_POLICY; }
module.exports = { defaultPolicy, defaultQualityPolicy, normalizeQualityPolicy, normalizePolicy, policyHash, policyForJob, levelSetting, policyInstructions };
