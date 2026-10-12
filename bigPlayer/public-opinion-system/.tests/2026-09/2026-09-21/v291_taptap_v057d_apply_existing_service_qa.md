---
status: blocked
priority: P0
date: 2026-09-21
role: test-owner
---

# TapTap v057d 唯一 apply 独立验收

## 结论

**FAIL，未进入 run 验收。** 唯一 apply 在 WinSW install 阶段失败，按失败即停；不重试，不创建第二个 run。

## 证据

- 记录：`.temp/taptap-v057d-apply-existing-service-install-failure-20260921.json`
- 状态：`MANUAL_STOP_REQUIRED`
- 错误：`WIN_SW_INSTALL_EXISTING_SERVICE`
- 原始错误：`PublicOpinionWorker.exe install` 失败，服务已存在
- 回滚 install 同样失败；`artifactsRestored=true`
- `runCreated=false`，`runId=null`，`retryAttempted=false`
- 根因：服务仍已注册时重复调用 WinSW install；回滚路径重复同一无效 install

## 恢复与边界

- 原 Worker 已恢复 `Running`，wrapper PID `13548`，Node PID `28780`
- active release 仍为 `worker-release-p0-parallel-20260918130000`
- Worker/API 原 hash 未变
- 未执行 claim/lease、`started_at`/`attempts`、终态/计数或 3000 浏览器 run 验收
- 未创建第二 run，未触碰 3001 或数据库写入

## 退回要求

修复已注册服务的 install/更新流程及回滚路径后，重新交付并申请唯一受控 apply；在此之前不得创建 TapTap run。
