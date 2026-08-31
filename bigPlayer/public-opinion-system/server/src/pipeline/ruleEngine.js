// 规则粗筛引擎（P0 token 护栏核心）
// 职责：用两级关键词词表对单条内容做纯本地字符串匹配，决定是否值得送 AI。
//   - 命中任一关键词 → needAI=true，进入 AI 精分析（省 token：只分析"疑似有料"的）
//   - 未命中          → needAI=false，仅归档，不送 AI（设计文档 M3 已确认的取舍）
// 同时按命中的关键词组产出严重度与触发口径（immediate/aggregate），供告警引擎二次判定。
// 关键词组 group_name 作为 matched_keywords 落库的稳定标识，滑窗计数即按组统计。

// 归一化：小写 + 折叠空白，降低大小写/空格带来的漏匹配（中文不受影响）。
function normalize(text) { return String(text || '').toLowerCase().replace(/\s+/g, ' '); }

const SEVERITY_RANK = { normal: 0, attention: 1, urgent: 2 };
function higherSeverity(a, b) { return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b; }

/**
 * @param {{title?:string, body?:string, authorName?:string}} content
 * @param {Array<{keyword:string, group_name:string, severity:string, threshold_count:number, trigger_mode:string, window_seconds:number}>} rules
 * @returns {{ needAI:boolean, matchedKeywords:string[], hitGroups:Array, ruleSeverity:string|null, triggerModes:string[] }}
 *   matchedKeywords：命中的组名去重列表（落 po_analyses.matched_keywords，滑窗按此计数）
 *   hitGroups：按组聚合的命中详情，含 groupName/severity/triggerMode/windowSeconds/thresholdCount/keywords
 *   ruleSeverity：所有命中组里的最高严重度（无命中为 null）
 */
function matchRules(content, rules = []) {
  const haystack = normalize(`${content.title || ''} ${content.body || ''} ${content.authorName || ''}`);
  const groups = new Map();
  for (const rule of rules) {
    const kw = normalize(rule.keyword);
    if (!kw || !haystack.includes(kw)) continue;
    const groupName = rule.group_name || rule.keyword;
    const prev = groups.get(groupName) || {
      groupName,
      severity: 'normal',
      triggerMode: rule.trigger_mode || 'aggregate',
      windowSeconds: Number(rule.window_seconds || 1800),
      thresholdCount: Number(rule.threshold_count || 1),
      keywords: []
    };
    prev.severity = higherSeverity(prev.severity, rule.severity || 'attention');
    // 同组多规则触发口径不一致时，immediate 优先（更保守，宁可即时报）
    if ((rule.trigger_mode || 'aggregate') === 'immediate') prev.triggerMode = 'immediate';
    prev.thresholdCount = Math.min(prev.thresholdCount, Number(rule.threshold_count || 1));
    prev.windowSeconds = Number(rule.window_seconds || prev.windowSeconds);
    if (!prev.keywords.includes(rule.keyword)) prev.keywords.push(rule.keyword);
    groups.set(groupName, prev);
  }
  const hitGroups = [...groups.values()];
  const matchedKeywords = hitGroups.map(g => g.groupName);
  const ruleSeverity = hitGroups.reduce((acc, g) => (acc ? higherSeverity(acc, g.severity) : g.severity), null);
  const triggerModes = [...new Set(hitGroups.map(g => g.triggerMode))];
  return { needAI: hitGroups.length > 0, matchedKeywords, hitGroups, ruleSeverity, triggerModes };
}

module.exports = { matchRules, normalize, higherSeverity };
