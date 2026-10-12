# 玩家严重流失及匹配失衡风险修正

Status: released

## 原因

截图三条实际记录均负面情感，但风险仅attention。当前v8紧急规则未包含玩家严重流失；模型把匹配投诉当作情绪时缺少明确原文兜底。这三条risk_context为空，属于旧版结果，不能只修新版riskDecision路径。

## 行为和修改

- `server/src/services/playerRetentionRisk.js`：从本条原文提取严重群体玩家流失、明确匹配不公平或具体双方阵容差距投诉；排除假设、否定、已改善、已解决。单纯提到匹配或个人口头弃坑不触发。
- `server/src/services/riskDecisionTree.js`：R14明确严重流失反馈进入L3/urgent，保存为allegation而非已核实事实；具体匹配投诉通过GATE1进入L2/negative。适配旧版无riskDecision记录。政策版本更新v9-retention。
- `server/src/services/riskResponseSchema.js`：R14加入严格输出契约。
- `server/src/integrations/aiAnalyzer.js`：缓存键包含新规则版本，避免旧分析缓存命中。
- `server/test/playerRetentionRisk.test.js`：用户样本、匹配、否定/假设/已解决、旧版记录测试。

帖子评论独立判断，不自动继承父帖等级。未扩展为把所有匹配提及升级；例如单纯辱骂未描述具体问题仍不会自动升级。

## 历史记录纠正

事务锁定三条精确平台ID和内部contentId，验证当前正文及内容指纹未改变，依据当前正文重判风险。原分析存在旧分析指纹差异，未将其冒充新AI分析，未重写分析指纹、情感或模型字段。只更新severity、risk_context、分析原因，保存原分析到po_audit_events。

| 平台ID | 原风险 | 新风险 |
|---|---|---|
| 6882161 | attention | urgent |
| 6882112 | attention | urgent |
| 926869 | attention | negative |

未调用AI，未入队分析或采集，未创建历史通知、发送站内信或外部消息。没有批量纠正其他历史记录。

## 验证和发布

30项自动回归通过，新规则边界及原v8规则回归全部通过。API402文件、分析Worker412文件包校验通过；仅4个规则运行文件改变，旧记录兼容补修仅1文件改变。

发布前发现现役包有更新，重新基于最新ai-specific-reason包定点应用本轮变更，保留现有分析原因改动。

- API现役：`C:/ProgramData/PublicOpinion/releases/release-20261012-retention-risk-1791787900545-legacy-r1`，实际进程44260。
- 分析现役：`C:/ProgramData/PublicOpinion/releases/analysis-release-20261012-retention-risk-1791787901100-legacy-r1`，实际进程36872。
- 旧包可回滚，未改前端、采集Worker或数据库结构，未推送Git。

外网Edge逐条打开详情、读取API核验，三条均符合上表，无pageerror。证据 `.tests/2026-10/2026-10-12/retention-before.json`、`retention-correction.json`、`retention-live.json`。
