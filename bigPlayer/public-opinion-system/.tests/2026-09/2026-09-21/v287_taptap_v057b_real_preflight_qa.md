---
status: blocked
priority: P0
date: 2026-09-21
role: test-owner
---

# TapTap v057b 真实 preflight 独立验收

## 结论

**FAIL，退回开发负责人；未进入真实切换或 run 验收。** v057b 隔离 PASS 不能外推为真实切换资格。

## 证据

- 证据：`.temp/taptap-v057b-real-preflight-missing-readiness-20260921.json`
- preflight 状态：`STOPPED_BEFORE_APPLY`
- 错误：`MODULE_NOT_FOUND`
- 缺失候选文件：`scripts/windows-services/worker-readiness.js`
- `applyAttempted=false`、`serviceActions=0`
- `databaseWrites=0`、`runCreated=false`、`runId=null`、`retryAttempted=false`
- 原 `PublicOpinionWorker` 仍为 `Running`；原 Worker/API EXE/XML hash 未变

## 验收边界

- 未执行 stop/install/start 或任何真实 Worker 切换；
- 未创建 TapTap run，因此未核验 claim/lease、`started_at`、`attempts`、终态、计数或 3000 run 页面；
- 未触碰 3001、数据库写入或 API 配置。

## 退回要求

请交付包含 `worker-readiness.js` 及其 manifest/hash 的完整候选，并重新执行候选根目录真实只读 preflight。补齐并通过前，不得申请真实切换，不得创建 run。
