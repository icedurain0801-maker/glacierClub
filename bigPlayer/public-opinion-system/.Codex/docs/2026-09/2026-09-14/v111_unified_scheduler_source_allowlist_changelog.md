---
date: 2026-09-14
status: completed
scope: unified-source-scheduler-allowlist
owner: 开发负责人
---

# v111 统一调度双源 allowlist

## 变更

- 新增 `UNIFIED_SOURCE_SCHEDULER_SOURCE_ALLOWLIST`（逗号分隔 source ID）配置。
- 统一调度候选在 SQL 层按 allowlist 过滤；queued/manual 执行项再次按同一 allowlist 过滤。
- `UNIFIED_SOURCE_SCHEDULER_MODE=enabled` 且 allowlist 为空时 fail-closed，不启动调度。
- Worker 启动日志输出生效的 allowlist，便于识别和停止。

## 验证

- 候选加载测试确认仅 allowlist 内 source 入选，重复 ID 去重。
- 启动门禁测试确认缺失 allowlist 返回 `UNIFIED_SCHEDULER_SOURCE_ALLOWLIST_REQUIRED`。

## 范围限制

- 未改变频率、回溯窗口、checkpoint 或 Discord connector。
- 未执行发布或 push。
