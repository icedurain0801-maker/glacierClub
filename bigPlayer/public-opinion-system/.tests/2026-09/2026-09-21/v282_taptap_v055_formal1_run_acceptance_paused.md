---
status: blocked
priority: P0
date: 2026-09-21
role: test-owner
---

# TapTap v055 formal1 唯一 manual run 验收暂停记录

## 结论

**未进入 run 验收，不能宣告 PASS。** 唯一切换在创建 run 前失败，按失败即停；不得创建第二个 run。

## 已核对证据

- 开发失败记录：`.temp/taptap-v055-single-cutover-ebusy-20260921.json`
- 记录状态：`MANUAL_STOP_REQUIRED`
- 错误：`EBUSY`；回滚错误：`EBUSY`
- `runCreated=false`，`runId=null`，`retryAttempted=false`
- `apiChanged=false`
- 记录中的 active Worker release：`C:\ProgramData\PublicOpinion\releases\worker-release-p0-parallel-20260918130000`
- 独立只读服务检查：`PublicOpinionWorker` 当前为 `Stopped`，启动类型 `Automatic`

## 未执行项

- 未创建、未请求、未补发 TapTap run。
- 无 `runId`，因此未执行 claim/lease、`started_at`、`attempts`、终态、计数、API/数据库或浏览器 run 详情验收。
- 未操作 3001、4320/v046、数据库或生产 sync。

## 恢复条件

收到开发负责人提供的旧 Worker 恢复证据后，才恢复排队：

1. `PublicOpinionWorker=Running`；
2. 原 Worker EXE/XML hash 与预期回滚 hash 一致；
3. 健康日志有效；
4. 项目经理提供新的明确指令。

恢复前禁止创建任何 TapTap run。
