---
last_updated: 2026-09-10
status: aborted_and_isolated
scope: p0-target-manual-collection
---

# v055 P0 单次采集因跨 Worker 抢占终止并隔离

## 精确范围

- source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- account：`70c393cf-9600-11f1-b3d2-d85ed3ae61b0`
- game：`896b6b25-39ea-4979-bb87-8c1d7334fde7`
- community：`00000000-0000-0000-0000-000000000101`
- platform：`bigplayer_h5`
- business date：`2026-09-09`
- UTC 数据窗口：`[2026-09-08 16:00:00, 2026-09-09 16:00:00)`

## 已完成结果

| 阶段 | 结果 |
|---|---|
| preflight | PASS |
| 拉取与导入 | PASS |
| 数据库存量 | post 179、comment 303（其中评论 296、回复 7），合计 482 |
| 写入结果 | inserted 482、changed 0、failedBatches 0、failedItems 0 |
| light 分析 | completed 482 |
| deep 分析 | completed 80、running 10；未完成 |

原始产物保留于 `bigPlayer/.temp/p0-20260910/q1-final-2026-09-09/`。`summary.json` 存在且状态为 `collection_completed`；由于分析阶段未正常收口，未生成 `daily-report.json`。

## 终止原因与证据

稳定原因码：`P0_CROSS_WORKER_ANALYSIS_LEASE_CONFLICT`。

- manual 进程 PID 为 `48316`，其预期租约 owner 前缀为 `q1-daily:48316`。
- 10 条 deep running 任务在 `09:52:11` 和 `09:54:22` 被 PID `12800` 的常驻 Node Worker 以新的租约 owner 认领。
- 这些任务均属于本次目标 source 和精确日期窗口；PID `12800` 是 2026-09-08 已存在的通用 Worker，不是本次 manual 进程。
- `claimAnalysisJobs` 的全局 backlog 路径没有 `po_sources.enabled=1` 条件，因此禁用 source 可以阻止新采集调度，但不能阻止现有分析任务被全局 Worker 继续认领。
- 同时观察到目标 account 的统一调度每分钟创建失败 run，稳定错误码为 `CREDENTIAL_NOT_FOUND`；source 禁用后没有再观察到新 run。

## 已执行隔离

1. 仅向现有 manual session 发送中断，session exit code 为 1。
2. 已确认 PID `48316` 退出。
3. 仅将目标 source 从 enabled=true 改为 enabled=false，affectedRows=1。
4. 未终止或重启 PID `12800` 及其他 Worker。
5. 未删除或改写 482 条内容、90 条 deep 任务或已有分析结果。
6. 未重试、未再次采集、未提交、push 或发版。

## 当前终态

- manual 终态：`aborted`（人为隔离终止，未生成完成报告）。
- source：disabled。
- 内容：482 条完整保留。
- 分析：light 482 completed；deep 80 completed、10 running，后者仍可能被既有全局 Worker 操作。

## 最小隔离修复建议

待项目经理另行派单后，在分析任务认领 SQL 中联接 `po_sources`，并让全局 backlog claim 默认要求 `s.enabled=1`；对明确携带 source 且用于受控恢复的 manual runner，增加独立、可审计的 claim scope/owner fence。补充并发测试，验证 disabled source 的 pending/retryable/running-expired job 不会被全局 Worker 认领，同时不影响其他 enabled source。
