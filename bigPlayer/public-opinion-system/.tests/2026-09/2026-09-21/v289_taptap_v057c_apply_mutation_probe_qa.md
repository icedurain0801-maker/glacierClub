---
status: blocked
priority: P0
date: 2026-09-21
role: test-owner
---

# TapTap v057c 唯一 apply 独立验收

## 结论

**FAIL，未进入 run 验收。** 唯一 apply 在 mutation probe 阶段失败，按失败即停；未重试，不创建第二个 run。

## 证据

- 记录：`.temp/taptap-v057c-apply-mutation-probe-parser-failure-20260921.json`
- 状态：`MANUAL_STOP_REQUIRED`
- 错误：`WORKER_MUTATION_GATE_TIMEOUT`
- `rollbackSkipped=true`
- 根因：PowerShell `-Command` 未正确绑定 `$args`，参数被拼入脚本文本，触发 `ParserError`
- `artifactsMutated=false`
- `runCreated=false`，`runId=null`，`retryAttempted=false`

## 恢复与边界

- 旧 `PublicOpinionWorker` 已恢复 `Running`，wrapper PID `49520`，Node PID `45000`
- active release 仍为 `worker-release-p0-parallel-20260918130000`
- Worker/API 原 hash 未变
- 未进行 run claim/lease、`started_at`/`attempts`、终态/计数或浏览器 run 验收
- 未触碰 3001、数据库写入或创建第二 run

## 退回要求

修复 mutation probe 的 PowerShell 参数绑定后，须重新交付完整候选并走新的受控 apply；在此之前不得创建 TapTap run。
