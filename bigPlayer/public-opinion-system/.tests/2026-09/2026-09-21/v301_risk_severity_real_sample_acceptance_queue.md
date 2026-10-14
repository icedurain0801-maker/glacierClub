---
status: queued
priority: P1
date: 2026-09-21
role: test-owner
candidate: v058d
---

# 风险分级真实样本受控验收队列

## 已拍板范围

- 仅固定样本 `919167`、`919098` 与普通 negative、positive 样本。
- 期望：`919167/919098 -> urgent`，普通 negative -> `attention`，positive -> `normal`。
- 允许受控真实样本验证；禁止历史全量回算、发布、服务切换和无关数据写入。
- 真实验收必须使用明确 `runId`，并以 API、只读 DB、`127.0.0.1:3000` 浏览器三路证据闭环。

## 待交测前置证据

1. 固定样本的 `contentId`/外部 ID、所属 source/community/platform 和样本快照。
2. 唯一受控 `runId`、分析任务 ID（如适用）、开始/结束时间、触发类型和授权范围。
3. 运行前只读基线：`po_analyses`、告警主体/关联表、outbox/通知计数、API 概览/列表计数。
4. 运行后只读快照：最终 `severity`、`analysis_reason`、normalization audit、`analysisVersion`、告警幂等键及通知/outbox 计数。
5. 明确 3000 页面深链参数：区域、社区、平台、固定日期窗口和 `runId`。

## 验收矩阵

| 场景 | 预期 | 证据 |
|---|---|---|
| 919167 | `urgent`，原因含对应升级审计 | DB + API + 3000 列表/详情 |
| 919098 | `urgent`，原因含对应升级审计 | DB + API + 3000 列表/详情 |
| 普通 negative | `attention`，不得因互动量升级 | DB + API |
| positive | `normal`，不得触发负面告警 | DB + API + 告警关联 |
| 重复处理/重试 | 告警幂等，通知/outbox 数不重复增加 | DB 前后计数、幂等键 |
| 概览与列表 | severity、analysisReason、数量一致 | API 与 3000 浏览器 |

## 当前状态

`BLOCKED_ON_RUN_EVIDENCE`。尚未创建或执行真实 Run，未连接真实 DB，未打开新的 3000 验收标签；不以候选 PASS 代替真实样本 PASS。

## 通过门槛

- 四类固定样本全部达到预期等级；审计原因真实落库且可由 API/页面读到。
- positive reconciliation 无负面告警；重复处理不增加重复告警/通知/outbox。
- API、概览、列表和 3000 浏览器对样本等级与计数一致。
- 任一证据缺失、样本越界、出现历史回算或通知数异常，整体 FAIL 并退回开发负责人。
