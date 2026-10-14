# 统一来源调度：阶段 0 完成与 1A 派单

- Status: in_progress_stage_1a_schema_contract
- Priority: P0
- Owner: 项目经理
- Updated: 2026-09-09

## 阶段 0 结论

- 新迁移固定使用 `023_unified_source_scheduling.sql`；禁止重用本机已登记但仓库缺失的 019-022 文件名。
- 023 必须先幂等 reconciliation 019-022 已有结构，再建设统一调度 schema；逐项 `information_schema` guard、可中断重跑、孤儿/重复数据 fail-closed。
- 目标核心：`po_sources.default_account_id`、`po_source_schedule_state`、扩展 `po_sync_runs` 的来源/槽位/窗口/版本字段。
- 已保存六个既存脏文件的基线；后续只能窄 hunk patch。

## 切换口径

1. `effective_at` 为统一调度切换时刻，不自动补历史旧槽。
2. `active_window` 保留为附加闸门，跳过时记录稳定原因。
3. 默认账号多候选按当前 `updated_at DESC, id ASC` 一次性固定；无合法账号保留 NULL 并 fail-closed。

## 阶段 1A 范围

- 新建 023 幂等 reconciliation 迁移与空库/旧库 schema contract 测试。
- 不在本阶段运行任何迁移、连接真实业务数据库、启动调度或采集。
- 阶段 1B 再实现纯时刻槽；阶段 2 后再接 repository/worker。
