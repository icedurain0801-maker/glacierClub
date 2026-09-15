# 统一来源调度：阶段 4C-2 新空库首次迁移验收

- Status: failed_confirmed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 结论

修复后的 migration 023 在全新隔离 MariaDB 空库中仍未完成首次应用。旧 checkpoint 索引删除错误未再次出现，但 023 最终 schema definition fail-closed 校验触发。已按门禁立即停止，未重跑、未修复现场、未切换数据库。

首次错误：

```text
Table 'public_opinion_023_empty_4c2.po_migration_023_fail_schema_definition' doesn't exist
```

## 隔离目标

| 项目 | 值 |
|---|---|
| 引擎 | MariaDB `10.4.14` |
| 地址 | `127.0.0.1:43306` |
| server_id | `423309` |
| 数据库 | `public_opinion_023_empty_4c2` |
| 专用账号 | `po_migration_4c2@127.0.0.1` |
| 凭据文件 | `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\.temp\public-opinion-mariadb-023\credentials-4c2.json` |
| 迁移日志 | `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\bigPlayer\.temp\public-opinion-mariadb-023\migration-4c2-full.log` |

创建后、迁移前通过目标库连接确认：

- `DATABASE() = public_opinion_023_empty_4c2`
- `CURRENT_USER() = po_migration_4c2@127.0.0.1`
- `@@port = 43306`
- `@@server_id = 423309`
- 用户表数为 `0`
- 账号仅拥有该目标库的 `SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, REFERENCES, INDEX, ALTER` 权限

## 执行方式

未使用 `.env`；单个 PowerShell 子进程从隔离凭据文件读取密钥并注入 `DB_HOST=127.0.0.1`、`DB_PORT=43306`、`DB_USER=po_migration_4c2`、`DB_NAME=public_opinion_023_empty_4c2`，且显式清空 `DATABASE_URL`。密钥未回显。

执行的仓库标准命令：

```bash
node server/src/db/migrate.js
```

## 首次执行结果

- 日志显示 001 至 `018_keyword_rule_platform_normalization.sql`，以及同前缀的 `018_source_community_id.sql` 均已报告 applied。
- 023 未再报 `po_sync_checkpoints_task_uk` 被外键依赖，说明前一轮阻塞点已越过。
- 023 随后触发 `po_migration_023_fail_schema_definition`，标准迁移入口未输出 023 applied 或全部完成。
- 由于失败即停，本轮未在失败后查询 ledger、schema definition 或具体 mismatch；不得把尚未查询的根因写成事实。

测试负责人随后对保留现场完成独立只读取证，结论为 `FAIL`：

- 全部目标列、索引与外键定义均符合预期。
- `SHOW CREATE TABLE` 显示两个 CHECK 约束定义完整且正确。
- MariaDB 10.4 的 `information_schema.check_constraints.check_clause` 对这两个 CHECK 均仅返回前 64 个字符，导致迁移用全文等值比较时误判 definition mismatch。
- 后续修复仍须验证完整 CHECK 定义，不能降级为前缀匹配；尤其不能遗漏 trigger-slot 的第二个约束分支。

## 保留现场与边界

- 4C-1 失败库未被重跑或修改；4C-2 新库保留当前失败现场。
- 未修改任何 migration，未尝试修复 definition mismatch。
- 未连接或修改 XAMPP 3306、真实业务库及其他数据库。
- 未启动 Worker、dailyRunner、q1DailyJob、计划任务或采集。

## 下一步建议

1. 项目经理根据已确认的 64 字符截断行为另行派发最小 MariaDB 10.4 CHECK metadata 兼容修复。
2. 修复必须保持完整定义校验，不能用前缀匹配替代。
3. 修复通过静态盲审后，使用第三个全新隔离空库重新验证首次应用；4C-2 库不得重跑。

## MariaDB 10.4 CHECK 元数据取证

对 4C-2 失败库执行只读查询后，候选机制结论如下：

| 候选机制 | 完整性 | 权限/可用性 | 能否在迁移 SQL 内完整 fail-closed |
|---|---|---|---|
| `information_schema.CHECK_CONSTRAINTS.CHECK_CLAUSE` | 不完整；列定义为 `varchar(64)`，两个目标约束均返回恰好 64 字符，`SUBSTRING(...,65)` 长度为 0 | 专用账号可读，MariaDB 10.4.14 可用 | 否 |
| 对 `CHECK_CLAUSE` 使用 `CAST(... AS CHAR(10000))`、`CONVERT(... USING utf8mb4)` 或 `CONCAT(...)` | 仍为 64 字符，源值截断后无法恢复 | 可执行，无需额外权限 | 否 |
| `information_schema.TABLE_CONSTRAINTS` | 仅提供约束名称和 `CHECK` 类型，不含表达式正文 | 专用账号可读 | 只能验证存在性，不能验证完整定义 |
| `mysql` schema 相关 constraint/check 表 | 未发现可读取完整 CHECK 定义的相关系统表 | 当前 MariaDB 10.4.14 无候选表 | 否 |
| `SHOW CREATE TABLE` | 两个 CHECK 定义均完整，包含 trigger-slot 第二分支 | 专用账号可执行 | 不能作为同一迁移 SQL 内的标量或子查询来源；可由迁移 runner 在 ledger 写入前校验 |

推荐的最小替代设计：由标准 `server/src/db/migrate.js` 在执行 023 后、写入 `po_schema_migrations` 前，对目标表执行 `SHOW CREATE TABLE`，规范化并与完整预期 CHECK 定义精确比较；任何缺失、放宽或额外限制均抛错且不写 ledger。023 内保留 CHECK 存在性验证，但不得使用 64 字符前缀作为完整定义证明。该方案把完整 fail-closed 门禁保留在标准迁移事务流程中，而不是降低为前缀匹配。此方案尚未实现，需项目经理另行派单。

本次取证仅执行 `information_schema` 查询和 `SHOW CREATE TABLE`，未写数据库、未重跑 023、未修改迁移文件、未启动 Worker。
