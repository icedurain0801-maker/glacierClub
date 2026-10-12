---
status: pass_isolated_precheck_blocked_on_run_evidence
date: 2026-09-22
role: test-owner
topic: 风险分级历史深度模型三样本补跑隔离候选
---

# 风险分级历史深度模型三样本隔离 QA

## 结论

**隔离结构 PASS；业务补跑仍 `BLOCKED_ON_RUN_EVIDENCE`。**

候选没有把预检结果冒充真实补跑完成，固定范围和 fail-closed 门禁符合要求。

## 验证结果

| 检查项 | 结果 |
|---|---|
| `node --test tests/isolated-verification.test.js` | `3/3 PASS` |
| 固定补跑样本 | `919167`、`6826813`、`920120`，无额外样本 |
| 固定配置 | `deep / gpt-5.6-luna / sentiment-v1` |
| 基线 `919098` | `negative`，`analysisLevel=deep`，身份匹配 |
| 三条 deep job | `919167=pending`、`6826813=missing`、`920120=pending` |
| raw provider output | 不存在 |
| prompt hash | 不存在；当前 schema 未持久化 |
| approved runId | 不存在；当前为 `N/A_PRECHECK_ONLY` |
| 写入/调用边界 | `dbWrites=0`、`aiCalls=0`、通知未调用、3001 明确禁止 |
| gate | `BLOCKED_PRECHECK_ONLY`，`writePhaseAllowed=false` |

## 结论边界

这不是三样本真实补跑 PASS，也不是 AI 结果验收。只有取得新的 raw provider output、prompt hash、approved runId 以及运行前后 DB/API/3000 三路只读证据后，才能进入真实验收；任何样本结果或身份不符都应 fail-fast。

本轮未访问生产 DB、未调用 AI、未发通知、未访问 3001、未发布或 push。
