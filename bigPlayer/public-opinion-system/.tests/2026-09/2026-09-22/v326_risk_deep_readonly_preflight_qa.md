---
status: blocked_precheck_only
priority: P0
date: 2026-09-22
role: test-owner
topic: risk-deep-fixed-samples-readonly-preflight
---

# 风险深度模型四样本只读预检报告

## 结论

**BLOCKED_PRECHECK_ONLY。**

四样本 DB 身份/fingerprint 快照、固定 deep 配置和 `919098` 严格 `negative` 基线通过；但当前 API 快照按会话红线不得访问 `3001`，raw provider 输出与 prompt hash 未提供，三条补跑样本仍未完成。因此禁止写阶段、AI 调用、通知和历史回算。

## 证据

- `runId`：`N/A_PRECHECK_ONLY`
- 只读快照：`.tests/2026-09/2026-09-22/evidence/v325-risk-deep-readonly/preflight.json`
- 快照脚本：`.tests/2026-09/2026-09-22/v325_risk_deep_readonly_snapshot.js`
- 快照时间：`2026-09-22T00:45:55.726Z`（UTC）
- 副作用计数：`dbWrites=0`、`aiCalls=0`、`notificationAttempts=0`
- API：`BLOCKED_3001_PROHIBITED`，未伪造 API 通过

## 已通过门禁

- 四个样本 content ID 与固定期望一致，source/community/platform 身份一致。
- 四个 fingerprint 已记录。
- deep profile：`gpt-5.6-luna` / `sentiment-v1`。
- `919098` 当前只读 sentiment=`negative`，既有 deep=`completed`；不重新调用。
- 通知状态只读计数为 `not_sent=22`；未发现 outbox/message 表。

## 未通过/缺失门禁

| 样本 | 当前 deep job | 结论 |
|---|---|---|
| `919098` | `completed` | 仅保留 strict negative 基线 |
| `919167` | `pending` | 必须使用新 raw provider 补跑 |
| `6826813` | 缺失 | 必须补建/补跑受控 deep job，不能用缺失代替完成 |
| `920120` | `pending` | 必须使用新 raw provider 补跑 |

- prompt schema version 可见：`sentiment-quality-context-severity-exclusive-v4`。
- prompt hash 未持久化在当前 schema，状态为 `NOT_PERSISTED_IN_CURRENT_SCHEMA`；必须由补跑证据提供 raw prompt hash。
- 当前不存在可授权的 write phase；不得调用 AI、写 DB、发通知或重试旧 run。

## 补跑准入条件

开发负责人需先交接固定 runId、三条样本范围、raw provider 输出、profile/model/version、prompt hash、输入 fingerprint 和归一化/审计预期。任一身份、fingerprint、模型、版本、sentiment、severity 或审计原因不符，立即 `FAIL / STOPPED`。
