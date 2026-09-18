# v158 Windows 常驻服务阶段 B1：真实迁移后只读核验

- 验收日期：2026-09-17
- 验收角色：测试负责人
- 结论：**PASS — 允许进入 Windows 服务安装分段验收**
- 验收方式：对目标库和 Windows 计划任务做只读查询；未触发迁移、调度写入、服务安装或旧任务变更。

## 真实库核验

| 检查项 | 实际结果 | 判定 |
| --- | --- | --- |
| Migration ledger | `023_unified_source_scheduling.sql` 为 `2026-09-11 16:36:09`；`024`、`025`、`026` 依次为 `2026-09-17 13:10:18`、`13:10:33`、`13:11:14` | PASS |
| 023 历史 ledger | 保留原有 2026-09-11 记录；未被重跑或改写 | PASS |
| 默认采集频率 | `po_sources.frequency_seconds` 为 `INT NOT NULL DEFAULT 21600` | PASS |
| Sync run 栅栏 | `po_sync_runs.lease_epoch` 为 `BIGINT UNSIGNED NOT NULL DEFAULT 0` | PASS |
| Worker 全局租约 | `po_worker_leases` 四列合同齐全；仅有 `worker_scheduler` singleton，`PRIMARY(lease_key)` 完整 | PASS |
| Worker 心跳 | `po_worker_heartbeats` 九列齐全；`PRIMARY(worker_id)`、`last_seen_at`、`scan_started_at,scan_finished_at` 三个索引均完整 | PASS |
| Server schema admission | 对真实库执行 `assertUnifiedSchedulerSchemaReady` 成功 | PASS |
| Worker shadow admission | 对真实库执行 shadow seam 返回 `UNIFIED_SCHEDULER_SHADOW_NO_WRITE` | PASS |

## 旧任务只读快照

| 任务 | 当前状态 | 最近结果 |
| --- | --- | --- |
| BigPlayer Keep Server Alive | Disabled | 0 |
| BigPlayer Last Night Overseas Daily 02 | Ready | 1 |
| BigPlayer Q1 Daily 02 | Ready | 3 |

本次未对旧任务运行任何启用、停用、删除、导出或修改操作。由于本轮未持有迁移前的独立任务快照，“状态保持原样”采用开发交付声明并以本表记录迁移后可复核基线，不将其推断为测试侧的时间序列证明。

## 下一步边界

可进入已授权的 Windows 服务安装、启动、唯一实例与短时故障恢复分段验收。旧任务停用仍需独立高影响门禁，禁止提前执行。
