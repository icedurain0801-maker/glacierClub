---
status: DIAGNOSED_BLOCKED
scope: read-only diagnosis of UNIFIED_SCHEDULER_SCHEMA_NOT_READY
date: 2026-09-21
---

# Unified Scheduler Schema 诊断

## 结论

4320 实际运行候选为 `v046-bigplayer-api-cutover-20260921-0200`。唯一一次增量同步失败在入队前的 `assertUnifiedSchedulerSchemaReady()`，直接原因是 API 仍检查旧的 checkpoint 唯一索引：

- API 检查项：`po_sync_checkpoints_window_uk`
- 期望列序：`account_id,task_kind,task_key,sync_scope,root_platform_content_id,window_start,window_end`
- 生产实际索引：`po_sync_checkpoints_site_window_uk`
- 实际列序：`account_id,site_id,task_kind,task_key,sync_scope,root_platform_content_id,window_start,window_end`

027 多站点迁移明确删除旧索引并创建 site-aware 索引，因此这是 API readiness 检查与已应用多站点 schema 的兼容性缺陷，不是生产库缺少 027/028。

## 触发链路

```text
POST /api/public-opinion/sources/{sourceId}/sync
  -> server/src/app.js source sync route
  -> repo.startSourceSync / enqueueManualSourceSync
  -> assertUnifiedSchedulerSchemaReady(conn)
  -> checkpoint_window_index_ready = 0
  -> UNIFIED_SCHEDULER_SCHEMA_NOT_READY
  -> HTTP 503
```

schema gate 在插入 `po_sync_runs` 之前失败，所以本次没有创建 runId，也没有写入 run/checkpoint。

## 生产库只读结果

数据库：本机 3306 `public_opinion`，仅执行 information_schema、SHOW CREATE 和 migration ledger 查询。

| 检查项 | 结果 |
|---|---:|
| migration_table_ready | 1 |
| default_account_ready | 1 |
| source_schedule_columns_ready | 1 |
| checkpoint_window_columns_ready | 1 |
| checkpoint_window_index_ready | 0 |
| run_source_ready | 1 |
| run_trigger_ready | 1 |
| run_schedule_column_ready | 1 |
| run_window_columns_ready | 1 |
| run_lease_epoch_ready | 1 |
| run_slot_ready | 1 |
| run_trigger_constraint_ready | 1 |
| run_source_fk_ready | 1 |
| schedule_state_ready | 1 |
| schedule_state_columns_ready | 1 |
| schedule_state_fk_ready | 1 |
| worker_lease_table_ready | 1 |
| worker_lease_columns_ready | 1 |
| worker_heartbeat_table_ready | 1 |
| worker_heartbeat_columns_ready | 1 |

已应用 migration ledger：

- `023_unified_source_scheduling.sql`
- `025_worker_scan_leases.sql`
- `026_scheduler_runtime_schema_reconciliation.sql`
- `027_bigplayer_multisite.sql`
- `028_bigplayer_scheduled_site_runs.sql`

生产 `po_worker_heartbeats` 的 9 个列和 3 个索引均符合 026；`po_sync_runs` 的 trigger CHECK、source FK、lease 列和 slot 唯一索引均符合 v046 检查。

## 最小修复范围

不执行生产 migration。数据库已经具备 027/028 目标结构，重新添加旧 `po_sync_checkpoints_window_uk` 会破坏多站点 checkpoint identity，不应作为修复。

下一候选只需调整 API 的 readiness predicate，使其在已应用 027/028 时检查 `po_sync_checkpoints_site_window_uk` 及包含 `site_id` 的列序；候选可兼容旧库时，应根据 migration ledger 选择 legacy/site-aware 版本，不能同时强制两个唯一约束。

## 预检与回滚建议

- 预检：只读执行 20 项 readiness、`SHOW CREATE TABLE po_sync_checkpoints`、`SHOW CREATE TABLE po_sync_runs`，并核对 5 个 migration ledger 版本；确认不存在需要删除/重建的重复 checkpoint identity。
- QA：在隔离 API 候选上验证 schema gate 通过，再按单次授权闭环审批执行 sync；不得用补加旧索引掩盖代码兼容性问题。
- 回滚：本次不涉及 DDL，保留现有 027/028 schema；若 API 候选验证失败，回滚 API release，不回滚或删除 `po_sync_checkpoints_site_window_uk`，也不重放 027/028。

## 操作边界

- 未执行 DDL/DML。
- 未发起新的 sync、未重试此前失败请求。
- 未修改授权链路，未触碰 TapTap、Worker、3001。
