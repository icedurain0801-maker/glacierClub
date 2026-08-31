// 告警双口径引擎（设计文档 M5，Q7 确认）
// 处理"已通过规则命中 + AI 精分析"的单条内容，决定是否生成告警并推钉钉。
// 两种口径：
//   - immediate（即时单命中）：命中组为 immediate 触发，且严重度达 urgent，单条即报；
//   - aggregate（聚合滑窗）：命中组为 aggregate 触发，统计窗口内同组命中数达阈值才报。
// 防轰炸：同游戏+同 alert_type 在 cooldown 内已有未闭环告警则不重复建，只追加关联内容。
// 钉钉推送幂等：仅在新建告警时推一次，回写 ding_talk_status（sent/failed）。
// fail-closed 不适用于此层——钉钉推送失败不应阻断落库，告警仍需入库待人工处理。

const SEVERITY_RANK = { normal: 0, attention: 1, urgent: 2 };

function buildExcerpt(content, max = 80) {
  const s = String(content.title || content.body || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

class AlertEngine {
  constructor(repo, dingTalk, env = process.env) {
    this.repo = repo;
    this.dingTalk = dingTalk;
    this.cooldownSeconds = Number(env.PO_ALERT_COOLDOWN_SECONDS || 900); // 同类告警冷却，默认 15min
  }

  // 决策单条内容是否触发告警。返回命中的告警口径列表（可能空）。
  //  hit: ruleEngine.matchRules 的产出（含 hitGroups/triggerModes/ruleSeverity）
  //  analysis: aiAnalyzer 的产出（含 sentiment/severity/negativeScore）
  async process({ game, content, hit, analysis }) {
    if (!hit || !hit.hitGroups?.length) return [];
    const created = [];
    for (const group of hit.hitGroups) {
      const decision = await this.evaluateGroup({ game, content, group, analysis });
      if (decision) created.push(decision);
    }
    return created;
  }

  async processAiUrgent({ game, content, analysis }) {
    if (analysis?.severity !== 'urgent') return [];
    const alertType = 'ai_urgent';
    const communityId = content.community_id || content.communityId;
    const open = await this.repo.findOpenAlert({ gameId: game.id, communityId, alertType, cooldownSeconds: this.cooldownSeconds });
    if (open) { await this.repo.linkAlertContent(open.id, content.id); return [{ alertId: open.id, reused: true, dingStatus: open.ding_talk_status }]; }
    const title = `【${game.name}】AI 识别紧急舆情`;
    const severityNote = analysis._lightSeverity && analysis._lightSeverity !== analysis.severity
      ? `严重度：${analysis.severity}（轻分析判定 ${analysis._lightSeverity}，深度分析降级为 ${analysis.severity}，按最高严重度告警）`
      : `严重度：${analysis.severity}`;
    const triggerDetail = [`游戏：${game.name}`, '口径：全量轻分析/深度分析识别', severityNote, analysis.summary ? `AI 摘要：${analysis.summary}` : '', analysis.reason ? `升级原因：${analysis.reason}` : '', `摘录：${buildExcerpt(content)}`, content.source_url ? `链接：${content.source_url}` : ''].filter(Boolean).join('\n');
    const alert = await this.repo.insertAlert({ gameId: game.id, communityId, severity: 'urgent', alertType, title, triggerDetail, contentIds: [content.id] });
    const dingStatus = await this.pushDingTalk(game, { title, triggerDetail }).catch(() => 'failed');
    await this.repo.updateDingStatus(alert.id, dingStatus);
    return [{ alertId: alert.id, reused: false, severity: 'urgent', alertType, dingStatus }];
  }

  async evaluateGroup({ game, content, group, analysis }) {
    // 最终严重度取"规则组严重度"与"AI 严重度"的较高者——规则是保底，AI 可升级。
    const severity = SEVERITY_RANK[analysis?.severity] > SEVERITY_RANK[group.severity] ? analysis.severity : group.severity;
    const alertType = group.triggerMode === 'immediate' ? 'immediate' : 'aggregate';
    const communityId = content.community_id || content.communityId;

    if (alertType === 'immediate') {
      // 即时口径：仅当最终严重度达 urgent 才单条直报（attention 级留给聚合口径累积）。
      if (severity !== 'urgent') return null;
    } else {
      // 聚合口径：统计窗口内同组命中数，未达阈值不报。
      const hits = await this.repo.countWindowHits({ gameId: game.id, communityId, groupName: group.groupName, windowSeconds: group.windowSeconds });
      if (hits < group.thresholdCount) return null;
    }

    // 防轰炸：冷却期内已有同游戏+同类型未闭环告警 → 只追加关联内容，不新建、不再推钉钉。
    const open = await this.repo.findOpenAlert({ gameId: game.id, communityId, alertType, cooldownSeconds: this.cooldownSeconds });
    if (open) { await this.repo.linkAlertContent(open.id, content.id); return { alertId: open.id, reused: true, dingStatus: open.ding_talk_status }; }

    const title = alertType === 'immediate'
      ? `【${game.name}】紧急舆情：${group.groupName}`
      : `【${game.name}】${group.groupName} 聚合告警（窗口内达 ${group.thresholdCount} 条）`;
    const triggerDetail = [
      `游戏：${game.name}`,
      `口径：${alertType === 'immediate' ? '即时单命中' : '聚合滑窗'}`,
      `严重度：${severity}`,
      `命中关键词组：${group.groupName}（${(group.keywords || []).join('、')}）`,
      analysis?.summary ? `AI 摘要：${analysis.summary}` : '',
      `摘录：${buildExcerpt(content)}`,
      content.source_url ? `链接：${content.source_url}` : ''
    ].filter(Boolean).join('\n');

    const alert = await this.repo.insertAlert({ gameId: game.id, communityId: content.community_id || content.communityId, severity, alertType, title, triggerDetail, contentIds: [content.id] });
    const dingStatus = await this.pushDingTalk(game, { title, triggerDetail }).catch(() => 'failed');
    await this.repo.updateDingStatus(alert.id, dingStatus);
    return { alertId: alert.id, reused: false, severity, alertType, dingStatus };
  }

  // 推钉钉：分群预留——game.dingtalk_webhook_ref 存在时可路由到分群（B 扩展），
  // P0 未配置则回退全局大群（notifier 默认 webhook）。推送失败返回 'failed' 不抛错。
  async pushDingTalk(game, alert) {
    if (!this.dingTalk || !(this.dingTalk.enabled && this.dingTalk.webhook)) return 'not_sent';
    await this.dingTalk.notify({ title: alert.title, triggerDetail: alert.triggerDetail });
    return 'sent';
  }
}
module.exports = { AlertEngine, buildExcerpt };
