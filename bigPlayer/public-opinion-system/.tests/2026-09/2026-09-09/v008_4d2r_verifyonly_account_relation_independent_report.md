# 4D-2R VerifyOnly account 关系独立取证报告

- 日期：2026-09-09
- 角色：测试负责人
- 目标：`127.0.0.1:43306/public_opinion_023_retry_65a2e4a2`
- 边界：只读查询、日志和脚本审查；未重跑 migration/023/VerifyOnly，未修改数据库、3306 或 Worker。

## 结论

迁移与同库恢复事实通过；VerifyOnly 失败是验收脚本查询引用了不存在的 `po_sources.account_id`，不是 schema 或 migration 失败。当前库继续冻结，等待仅修正 VerifyOnly 脚本后重新执行只读验证。

## 已独立确认

| 项目 | 结果 | 证据 |
|---|---|---|
| 首次 023 fail-closed | 通过 | `exit_code=1`、`timed_out=0`，stderr 命中 `po_migration_023_fail_schema_definition` |
| 首次 023 ledger | 通过 | 中断封存日志 `ledger_023_count=0` |
| 部分 DDL | 通过 | 封存日志 `partial_ddl_committed=PASS` |
| 唯一障碍清理 | 通过 | run log 为 `DROP TABLE po_source_schedule_state` |
| 同库恢复 | 通过 | retry 023 `exit_code=0`，当前 ledger 精确 21 条，023 恰一条，019-022 不存在 |
| 连接关闭 | 通过 | 首次 runner 未超时且已返回；隔离实例只读查询目标当前连接 0、事务 0、全局 lock wait 0 |
| 已执行 VerifyOnly schema 断言 | 通过 | 日志显示 ledger、reconciliation 表、核心列、15 个索引、6 个外键、两条 CHECK、legacy index 移除均通过 |

## 关系事实

```text
po_sync_runs.account_id -> po_accounts.id
po_sync_runs.source_id  -> po_sources.id
po_accounts.source_id   -> po_sources.id
po_sources.default_account_id -> po_accounts.id（无反向 FK，业务校验归属）
```

当前真实数据下，以下正确关系断言结果为 `0`：

```sql
SELECT COUNT(*)
FROM po_sync_runs r
LEFT JOIN po_sources s ON s.id = r.source_id
LEFT JOIN po_accounts a ON a.id = r.account_id
WHERE s.id IS NULL OR a.id IS NULL OR a.source_id <> r.source_id;
```

同时，默认账号与来源的游戏、平台、社区归属一致性断言结果也为 `0`。

## 最小修复建议

只替换 `verify-4d2.ps1` 的 `data_invariants` 中错误的第三个加数：

```sql
-- 错误：po_sources 不存在 account_id
SELECT COUNT(*) FROM po_sync_runs r
LEFT JOIN po_sources s ON s.id=r.source_id
WHERE s.id IS NULL OR s.account_id<>r.account_id
```

替换为：

```sql
SELECT COUNT(*) FROM po_sync_runs r
LEFT JOIN po_sources s ON s.id=r.source_id
LEFT JOIN po_accounts a ON a.id=r.account_id
WHERE s.id IS NULL OR a.id IS NULL OR a.source_id<>r.source_id
```

该修改仅修正 VerifyOnly 的只读验收关系，不改变 023、runner、数据库 schema 或 Worker。
