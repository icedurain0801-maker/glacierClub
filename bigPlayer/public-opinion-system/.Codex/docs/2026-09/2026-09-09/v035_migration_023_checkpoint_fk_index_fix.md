# Migration 023：Checkpoint 外键支撑索引修复

- Status: qa_passed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 问题

阶段 4C-1 在全新隔离 MariaDB 10.4.14 空库执行完整迁移时，023 首次失败：

```text
Cannot drop index 'po_sync_checkpoints_task_uk': needed in a foreign key constraint
```

独立只读复核确认，旧索引的首列 `account_id` 正被 `po_sync_checkpoints_account_fk` 用作必需支撑索引；023 在建立替代索引前删除旧索引，触发 MariaDB 拒绝。

## 修复

- 在删除 `po_sync_checkpoints_identity_uk` 或 `po_sync_checkpoints_task_uk` 之前，先处理独立普通索引 `po_sync_checkpoints_account_idx (account_id)`。
- 若同名索引不存在，则幂等创建。
- 若同名索引已存在但不是非唯一、单列且列序精确为 `account_id`，通过 `po_migration_023_fail_checkpoint_account_index_definition` fail-closed。
- 创建或复用后再次核验精确定义；未满足时通过 `po_migration_023_fail_checkpoint_account_index_missing` 中止。
- 最终 schema definition contract 同时要求该索引存在、非唯一且列序为 `account_id`。
- 不删除或重建 `po_sync_checkpoints_account_fk`，不改变窗口唯一键或迁移其他语义。

## 测试

先新增三项静态回归，覆盖：

1. 支撑索引 definition guard、创建与最终核验均早于任一旧索引 DROP。
2. 缺少同名索引时创建精确的 `(account_id)` 普通索引；已有正确定义时复用。
3. 已有同名索引但唯一性或列序错误时，在旧索引 DROP 前 fail-closed。

红灯结果：`11 passed, 3 failed`。

最小修复后运行：

```bash
node --test --test-concurrency=1 server/test/unifiedSchedulerMigration.contract.test.js
```

结果：`14 passed, 0 failed`。

测试负责人独立静态盲审结果：`PASS`，专项 `14 passed, 0 failed`；本轮未连接数据库。

## 验证边界

- 本轮仅执行静态 SQL contract 测试，未运行任何数据库迁移。
- 4C-1 失败库永久保留取证，不得重跑。
- 修复后的真实首次应用必须在后续 4C-2 新建隔离空库中验证。
