---
date: 2026-09-14
status: completed
scope: unified-source-scheduler-state-recovery
owner: 开发负责人
---

# v115 调度状态安全恢复

## 根因

`po_source_schedule_state` 的历史 lease 已过期但 `next_scheduled_at`、`last_scheduled_at` 为空；候选加载器此前没有读取状态，租约获取也没有写回槽位，导致合格来源（包括 Last Light BigPlayer）无法形成可审计的下一次调度状态。

## 最小修复

- 候选加载器读取 `last_scheduled_at` / `next_scheduled_at`，统一调度将 `last_scheduled_at` 作为已处理槽位。
- lease 原子获取成功时写入本次 `scheduled_at` 与 `nextSlotAt`，同时清理已过期 lease 的旧 owner/token。
- 只有没有 queued/running run 且 lease 为空或已过期时才允许更新；停用、未授权、配置不完整或 connector 不可用来源仍 fail-closed。

## 验证

- `worker` 调度定向测试：52/52 通过。
- 覆盖过期 lease 恢复槽位、Last Light 合格来源入选，以及 disabled/unauthorized/incomplete 来源拒绝。
- 未改变频率、历史数据、checkpoint 或 Discord/Facebook 配置；未执行回补、删除、push 或发版。
