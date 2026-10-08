---
status: user-confirmed
scope: 情感与风险等级归一化
reported_at: 2026-09-20
---

# 正面内容被错误归入关注级

## 一句话结论

截图中的内容同时显示“正面”和“关注”，且分析原因写明“暂无明显风险”，说明当前算法允许 `sentiment=positive` 与 `severity=attention` 并存；正面内容不应进入关注级或负面待处理。

## 已确认根因

1. `server/src/integrations/aiAnalyzer.js` 的提示词要求情感和风险等级独立判断，并明确“不依据 sentiment 或 negative_score 猜测等级”。因此模型可以返回 `positive + attention`。
2. 同文件 `parseResponse()` 只校验 `sentiment`、`severity` 是否属于合法枚举，没有校验二者的业务组合关系。
3. 既有规则文档 `v019_negative_attention_urgent_policy.md` 对 `sentiment != negative` 采取“保留现有 severity”，进一步保留了正面+关注组合。
4. `shared/riskModes.js` 按最终 `severity` 筛选，`severity=attention` 会直接进入关注级页面，不会再次排除正面内容。

## 新的归一化口径

- `sentiment=positive`：最终 `severity=normal`，不进入关注级、负面待处理、当前告警。
- `sentiment=neutral`：沿用现有风险判断；只有存在明确风险证据时才允许 `attention/urgent`。
- `sentiment=negative`：沿用已确认的负面分层规则，至少为 `attention`；游戏问题或中高负面强度可升级为 `urgent`。
- 正面内容的质量推荐（首页推荐、栏目置顶、加精）与风险等级完全分离，不得因为推荐字段或游戏关键词把正面内容升级为风险等级。

## 数据与历史处理

- 保存模型原始结果用于审计，同时持久化归一化后的最终 `severity=normal`。
- 归一化原因记录为 `positive_forced_normal`，便于定位模型误判。
- 对历史 `sentiment=positive AND severity IN ('attention','urgent')` 执行一次确定性回算为 `normal`。
- 回算后从关注级、负面待处理、当前告警统计和列表中排除；保留原分析记录和变更审计，不物理删除内容。
- 已关联的未闭环告警不再作为当前告警展示，按现有误报/关闭流程保留历史记录，禁止静默删除审计数据。

## 用户已确认的补充口径（2026-09-20）

1. 原始模型等级与 `positive_forced_normal` 写入现有追加式审计事件，至少保留 `content_id`、原始等级、归一化等级、归一化原因和回算批次号；不得用单行 `po_analyses` 覆盖模型原值，也不得把审计信息塞进模型解释字段。
2. 历史处于 `pending/processing` 的正面告警统一标记为 `false_positive`，写入系统关闭原因和审计记录；保留告警历史，不采用仅查询过滤的隐式方案。
3. 回算范围为当前 `po_analyses` 中全部 `positive + attention/urgent`，包含已删除内容；按内容 ID 分批执行，支持幂等、失败续跑和批次审计，已成功批次不回滚；不重复改写已被新版本替换的旧分析记录。
4. `neutral + attention` 仅在命中启用的风险关键词组或明确游戏问题规则时保留关注级；仅凭分析原因、主题词或模型自由判断不足以进入关注级，否则归一化为 `normal`。

## 验收用例

| 输入 | 预期最终等级 | 页面结果 |
|---|---|---|
| positive + normal | normal | 不出现在关注级/负面待处理 |
| positive + attention | 强制 normal | 不出现在关注级/负面待处理，并记录 `positive_forced_normal` |
| positive + urgent | 强制 normal | 不生成或不保留当前告警 |
| neutral + attention | attention | 仅在有明确风险证据时进入关注级 |
| negative + normal | 至少 attention | 按负面规则进入关注级或负面待处理 |
| 正面攻略含“闪退解决方法” | normal | 不因关键词单独升级 |

## 交开发负责人范围

- `server/src/integrations/aiAnalyzer.js`
- `worker/src/worker.js`
- `server/src/db/repository.js`
- `shared/riskModes.js`
- 相关分析、关注级、负面待处理、告警和概览测试
