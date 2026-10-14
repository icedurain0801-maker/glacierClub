---
date: 2026-09-23
status: ready_for_review
scope: scheduler-admission
---

# v370 调度准入复现与修复

## 根因

兼容租约路径在 `acquireLease` 成功时提前写入 `last_scheduled_at` / `next_scheduled_at`。后续入队失败只释放 lease，不回滚游标；下一轮候选加载把 `last_scheduled_at` 作为 `lastProcessedBySource`，当前槽因此变成 `NOT_DUE`。此外，所有准入失败原先都压成 `PREVIOUS_RUN_ACTIVE` 或 `LEASE_FAILED`，BigPlayer 多站点 schema/registry 错误无法解释。

## 修复

- 租约获取只写 lease；入队成功后由 `advanceLease` 按 fencing token 推进游标。
- 失败准入查询 active run/lease 状态，写入 `last_reason_code` 并返回结构化 reason。
- scheduler 透传 adapter/provider 错误码，保留 BigPlayer `MULTISITE_SITE_REGISTRY_MISMATCH`、schema/DB 错误。

## 验证

`node --test .tests/2026-09-23/v370_scheduler_admission_repro.test.js worker/test/sourceSchedulerRuntime.test.js worker/test/schedulerRepositoryAdapter.test.js`：24/24 PASS。

未执行生产 Run、生产 DDL、服务切换、3001 或发布操作。
