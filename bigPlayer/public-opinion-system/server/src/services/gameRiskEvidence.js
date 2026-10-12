// Evidence must describe this content's observable impact, not a topic or parent.
const IMPACT_PATTERNS = Object.freeze({
  service_blocked: [
    /(?:持续|一直|整天|连续\S{0,8}小时|\d+\s*小时).{0,24}(?:(?:无法|不能).{0,12}(?:登录|登陆|游戏|游玩|进入|连接)|登录失败|连接失败|进不去游戏)/i,
    /(?:无法|不能).{0,12}(?:登录|登陆|游戏|游玩|进入|连接).{0,24}(?:整天|持续|一直|\d+\s*小时)/i,
    /(?:cannot|can't|unable to)\s+(?:log\s?in|play|connect).{0,60}(?:hours|all day|continuously)/i,
    /(?:hours|all day|continuously).{0,60}(?:cannot|can't|unable to)\s+(?:log\s?in|play|connect)/i
  ],
  widespread_outage: [
    /(?:全服|全区|所有服务器|大量玩家|大批玩家).{0,24}(?:宕机|瘫痪|中断|无法登录|无法游玩|无法进入|进不去|无法连接)/i,
    /(?:all (?:servers|players)|server[- ]wide|region[- ]wide).{0,60}(?:down|outage|offline|cannot|can't|unable)/i
  ],
  asset_loss: [
    /(?:全部|大量|重大|大额).{0,12}(?:道具|货币|充值|财产|资金|存档|进度).{0,18}(?:丢失|消失|损失|清空|未到账|不到账)/i,
    /(?:all (?:my |our )?(?:items|currency|progress|savings)|large (?:payment|amount)).{0,50}(?:lost|missing|gone|disappeared|not received)/i
  ],
  account_security: [
    /(?:我的|本人|我们|玩家|账号|帐号).{0,12}(?:被盗|被入侵|泄露|盗号|非法登录)/i,
    /(?:my|our|player'?s?)\s+(?:account|credentials).{0,30}(?:stolen|hacked|compromised|leaked)/i
  ]
});
function clauses(input = {}) {
  return [input.title, input.body].filter(Boolean).join(' ').split(/[。！？!?;；\n]|\.(?:\s|$)/).map(value => value.trim()).filter(Boolean);
}
function excluded(clause) {
  if (/(?:没有|并未|未曾|未被|不是).{0,8}(?:被盗|盗号|入侵|泄露|丢失|宕机|中断|崩溃|闪退)|\b(?:not|never|wasn't|isn't)\s+(?:hacked|stolen|compromised|leaked|lost|down)\b/i.test(clause)) return true;
  const unresolved = /(?:仍然|还是|依然|仍在|又|still|keeps|again|yet)/i.test(clause);
  if (!unresolved && /(?:已解决|已修复|不再|已经恢复|并没有|没有发生|未发生|不会|修复方法|解决方法|如何防止|怎么预防|教程|\b(?:resolved|fixed|no longer|does not|doesn't|never|how to|prevent|tutorial|faq)\b)/i.test(clause)) return true;
  return /(?:如果|假如|假设|要是|万一|\b(?:if|hypothetically|suppose|what if)\b)/i.test(clause);
}
function hasConcreteCrashReport(input = {}) {
  return clauses(input).some(clause => !excluded(clause) && (
    /(?:我的|这个|游戏|客户端).{0,12}(?:崩溃|闪退|卡死).{0,24}(?:了|一次|每|重连|导致|影响|无法|不能)/i.test(clause)
    || /(?:频繁|一直|总是|反复|每次).{0,12}(?:崩溃|闪退|卡死)/i.test(clause)
    || /\b(?:my|our|the|this)\s+(?:game|app|client)\s+(?:(?:is|keeps|has been)\s+)?(?:crashes|crashing|freezes|freezing)\b/i.test(clause)
  ));
}
function verifiedSeriousImpact(input = {}) {
  const raw = input.rawAnalysis || {};
  const category = input.urgentImpact ?? raw.urgentImpact;
  const evidence = String(input.urgentEvidence ?? raw.urgentEvidence ?? '').trim();
  const text = [input.title, input.body].filter(Boolean).join(' ');
  if (category != null) {
    if (!IMPACT_PATTERNS[category] || evidence.length < 4 || !text.includes(evidence)) return null;
    return clauses({ body: evidence }).some(clause => !excluded(clause) && IMPACT_PATTERNS[category].some(pattern => pattern.test(clause))) ? { category, evidence } : null;
  }
  // Legacy results lack the new fields: only an explicit serious impact can qualify.
  for (const clause of clauses(input)) if (!excluded(clause)) {
    for (const [kind, patterns] of Object.entries(IMPACT_PATTERNS)) {
      if (patterns.some(pattern => pattern.test(clause))) return { category: kind, evidence: clause };
    }
  }
  return null;
}
const factualClauses = input => clauses(input).filter(clause => !excluded(clause));
module.exports = { IMPACT_PATTERNS, factualClauses, hasConcreteCrashReport, verifiedSeriousImpact };
