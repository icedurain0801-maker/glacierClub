# 统一来源调度：阶段 4C-1 空库迁移验收

- Status: failed_confirmed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 结论

完整仓库 migration 001–023 在已签核隔离 MariaDB 空库中首次执行失败。已按门禁立即停止，未重试、未修改迁移文件、未切换数据库。

首次错误：

```text
Cannot drop index 'po_sync_checkpoints_task_uk': needed in a foreign key constraint
```

## 隔离目标

| 项目 | 值 |
|---|---|
| 引擎 | MariaDB `10.4.14` |
| 地址 | `127.0.0.1:43306` |
| server_id | `423309` |
| 数据库 | `public_opinion_023_empty_4c1` |
| 专用账号 | `po_migration_4c1@127.0.0.1` |
| 凭据文件 | `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\.temp\public-opinion-mariadb-023\credentials-4c1.json` |
| 迁移日志 | `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\.temp\public-opinion-mariadb-023\migration-4c1-full.log` |

创建后、迁移前通过目标库连接确认：

- `DATABASE() = public_opinion_023_empty_4c1`
- `CURRENT_USER() = po_migration_4c1@127.0.0.1`
- `@@port = 43306`
- `@@server_id = 423309`
- 用户表数为 `0`
- 账号仅拥有该目标库的 `SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, REFERENCES, INDEX, ALTER` 权限

## 精确执行方式

未使用 `.env`，而是在单个 PowerShell 子进程中从隔离凭据文件读取连接信息并注入以下环境变量：

```text
DATABASE_URL=<unset>
DB_HOST=127.0.0.1
DB_PORT=43306
DB_USER=po_migration_4c1
DB_PASSWORD=<从 credentials-4c1.json 读取，未回显>
DB_NAME=public_opinion_023_empty_4c1
```

执行的仓库标准命令：

```bash
node server/src/db/migrate.js
```

## 首次执行结果

日志显示以下迁移已逐项报告 applied：

- `001_initial.sql` 至 `018_keyword_rule_platform_normalization.sql`
- 同版本前缀的 `018_source_community_id.sql`

随后执行 023 时首次失败，错误为无法删除仍被外键约束依赖的索引 `po_sync_checkpoints_task_uk`。命令退出非零；未出现 `migration applied: 023_unified_source_scheduling.sql` 或 `all migrations up to date`。

由于收到“失败立即停止”约束，本轮未在失败后再次查询 ledger 或 schema，不能把 023 未入账作为额外数据库查询事实；仅能确认标准迁移入口没有输出 023 成功登记。

测试负责人随后对保留现场完成独立只读复核，结论为 `FAIL`：

- `po_schema_migrations` 中没有 023，但 023 前段 DDL 已因 MariaDB 隐式提交而部分落库。
- `po_sync_checkpoints_task_uk` 的 `account_id` 当前为 `po_sync_checkpoints_account_fk` 提供必需索引。
- 023 在建立另一个以 `account_id` 开头的替代索引之前直接删除 `po_sync_checkpoints_task_uk`，因此被 MariaDB 拒绝。
- 当前失败库继续仅作取证，禁止重跑。

## 保留现场与边界

- 隔离实例保持运行，失败后的目标库与日志原样保留，供测试负责人复核。
- 未重试 migration 023，未尝试修复索引/外键关系。
- 未连接或修改 XAMPP 3306、真实业务库及其他数据库。
- 未启动 Worker、dailyRunner、q1DailyJob、计划任务或采集。

## 下一步建议

1. 测试负责人先基于保留现场与日志确认 FAIL 证据。
2. 项目经理另行派单修复 023：先确保另一个以 `account_id` 开头的索引存在（新 window 唯一键或显式普通索引），再删除 `po_sync_checkpoints_task_uk`。
3. 修复获批后使用新的隔离空库重新执行首次迁移；当前失败库仅用于失败现场复核与后续中断重跑场景，不应冒充干净空库。
