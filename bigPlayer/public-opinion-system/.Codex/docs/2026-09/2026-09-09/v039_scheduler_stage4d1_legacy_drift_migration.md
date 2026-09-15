# 统一来源调度：阶段 4D-1 旧库漂移真实验收

- Status: completed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 目标

在 `127.0.0.1:43306` 创建全新 `public_opinion_023_legacy_` 前缀隔离库，使用标准 runner 应用仓库实际存在的 001–018 migration；随后仅按标准 ledger 格式登记本机真实存在但仓库缺失的 019–022 version，不创建其 schema 后果；最后执行 023 并验证 reconciliation。

## 首次停止点

执行前已读取 `server/src/db/migrate.js`，确认 ledger 表及写入格式为：

```sql
CREATE TABLE IF NOT EXISTS po_schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO po_schema_migrations (version) VALUES (?);
```

仓库 migration 目录只有 001–018、同前缀的第二个 018，以及 023，没有 019–022 文件。为避免猜测 version 名称，尝试从 43306 的既有基准隔离库 `public_opinion_023` 只读查询 019–022 ledger version；该查询首次失败：

```text
ledger lookup failed
```

已按“任何失败立即停止、记录首错、无现场修复”门禁停止。本轮没有创建 4D-1 数据库或账号，没有写入任何 ledger，没有执行 migration，也没有触碰 4C-1、4C-2、3306 或 Worker。

## 证据与现场

- 日志：`C:\Users\Administrator\AppData\Roaming\Code\User\project manage\.temp\public-opinion-mariadb-023-4d1\discovery-4d1.log`
- 43306 仍由 PID `32720` 监听 `127.0.0.1`。
- 由于读取失败且命令未回显数据库客户端原始错误，本轮只能确认 ledger 名称取证未完成，不能推断目标库不存在、权限不足或其他具体根因。
- 尚未生成任何 `public_opinion_023_legacy_` 目标名、账号或凭据文件。

## 下一步

需要项目经理另行授权只读诊断 ledger 查询失败原因，并确认 019–022 的准确 version 名称；未获得新派单前不得继续 4D-1。

## 4D-1D 只读诊断结果

项目经理授权后新增独立诊断脚本，固定只连接已验证的 4C-3 数据库 `public_opinion_023_empty_4c3_6ba3b514`，并使用 `System.Diagnostics.Process` 分别捕获 mysql 客户端退出码、stdout 与 stderr。密码仅通过子进程环境变量传入，日志会脱敏。

原命令封装在 mysql 非零退出时只抛出通用 `ledger lookup failed`，没有保留已捕获的客户端 stderr，因此无法定位首次失败的真实数据库错误。新封装执行同类最小只读 ledger 查询结果为：

- `exit_code=0`
- stdout 正常返回 001–018、同前缀的第二个 018 与 023 共 20 条 version。
- stderr 为空。
- 未执行任何写语句、Node 或 migration。

诊断日志：`C:\Users\Administrator\AppData\Roaming\Code\User\project manage\.temp\public-opinion-mariadb-023-4d1\diagnose-ledger-4d1.log`。

## 019–022 名称证据

对当前文档、Git 历史与相关审计记录逐字检索后，只有以下名称具备可引用证据：

| 版本 | 完整名称 | 证据 |
|---|---|---|
| 019 | 待确认 | 仅有编号及 Last Night 语义描述，无完整文件名原文 |
| 020 | `020_complete_game_community_directory.sql` | `.Codex/docs/2026-09/2026-09-01/v002_complete_game_community_directory_changelog.md` 第 5 行；Git commit `6787afb41af11857c78264ddb2d80fc59635fcd6` |
| 021 | 待确认 | 仅有 019–022 范围描述，无完整文件名原文 |
| 022 | 待确认 | 仅有 019–022 范围描述，无完整文件名原文 |

4C-3 ledger 不包含 019–022，不能作为名称来源。当前证据不足以安全构造四条 ledger 记录，4D-1 继续保持未 provision 状态；不得根据 schema 用途推测 019、021、022 文件名。

## 权威 version 证据补齐

项目经理提供新的只读 Git 原始 stash 树证据。开发负责人执行以下命令逐字复核，未恢复或应用 stash：

```bash
git ls-tree -r 'stash@{4}^3' -- migrations
```

对象 `stash@{4}^3` 解析为 commit `b4d5d3b1955fe6c2814e192a3b1eed5dff059920`，其中四条记录为：

| version | blob |
|---|---|
| `019_overseas_last_night_community.sql` | `2183b338cb9c67b1dfef60ef0271e78b24782682` |
| `020_complete_game_community_directory.sql` | `55f303f8c29bad19ee529a70f6e482ed0ecb1b7c` |
| `021_checkpoint_collection_window.sql` | `d58d60640f0bb0ceebaedff5fb2fbdc2cf56936d` |
| `022_content_translations.sql` | `7f6a7ac057587604836b1302fa8e1227b3d0fc00` |

该证据仅用于新建的 43306 legacy-simulation 隔离库 ledger 模拟，不从 stash 恢复文件，也不执行其中 SQL。至此 019–022 version 名称证据闭合，4D-1 可按新派单继续。

## 正式执行：provision

`provision-4d1.ps1` 执行成功，新建隔离数据库 `public_opinion_023_legacy_17f8890b` 与最小权限账号 `po_mig_4d1_17f8890b@127.0.0.1`。目标为空库，端口、server-id、datadir、socket 与预期 43306 隔离实例一致；无全局权限。

## 正式执行：run 首错停止

`run-4d1.ps1` 首次执行失败，首错为：

```text
Cannot find an overload for "AppendAllLines" and the argument count: "3".
```

失败点位于首次逐文件 runner 返回后的日志追加语句。`run-4d1.log` 已记录 `status=FAIL`、`target_identity=PASS`、`full_runner_invocations=0`；`migration-4d1-full.log` 已创建但长度为 0。由于错误发生在 runner 调用之后，新库可能已被部分修改，现保持原样作为失败现场，不修复、不重跑、不执行 verify，也不删除数据库或账号。

## 测试负责人独立只读取证

测试负责人对失败目标完成独立只读核验，确认：

- migration ledger 仅有 `001_initial.sql`。
- user tables 数量为 9。
- 019–022 与 023 均未入账。
- 023 对应新表不存在。
- 根因定位为 `run-4d1.ps1:74` 使用的三参数 `AppendAllLines` 重载在当前 PowerShell/.NET 运行时不可用。

该 legacy-simulation 目标已形成部分迁移状态，不可重跑，继续原样保留为失败现场。后续若获新派单，应仅将日志追加改为当前运行时支持的重载或 `AppendAllText`，并新建全新的 legacy 目标重新验证。

## 4D-1R 修复与新目标重建

仅将 `run-4d1.ps1` 的两处三参数 `AppendAllLines` 改为显式 UTF-8 的 `AppendAllText` 封装，未修改项目 migration、runner、Worker 或数据库业务逻辑。无数据库 fixture 执行通过：`database_connected=0`，连续两次追加后的内容逐字匹配。

随后 provision 成功创建全新隔离目标 `public_opinion_023_legacy_5022bfe2` 与最小权限账号 `po_mig_4d1_5022bfe2@127.0.0.1`。空库、实例身份、schema 权限与无全局权限检查均通过；失败库 `public_opinion_023_legacy_17f8890b` 未被访问、修改或复用。

新目标 run 成功：仓库实际存在的 20 个 001–018 migration 均以带文件参数的标准 runner 逐个执行；019–022 四条权威 version 仅登记 ledger；随后只执行 `023_unified_source_scheduling.sql`。总计 21 次逐文件 runner 调用，无无参数全量 runner 调用。019–022 的 `version + applied_at` 前后快照 SHA-256 均为 `1ac9f3e94b6438d65f65e26c341ee87758b059ef62ec9725f17a8956a65d8f7e`，确认 023 未改写历史 ledger。

4D-1R 的 VerifyOnly 执行失败，已立即停止且未修复、未重跑。失败前已通过：快照哈希与不变性、数据库身份、精确 25 条 ledger、reconciliation 列/索引/表、023 ledger、两条 CHECK、checkpoint FK、核心列、15 个关键索引、6 个关键 FK、无意外 default-account FK、schema 权限、无其他 schema/global/table 权限。随后只读查询返回通用错误：

```text
read-only verification query failed
```

按验证脚本执行顺序，失败位置位于 `unexpected_table_privileges=PASS` 之后、`unexpected_routine_privileges` 结果写入之前；当前日志未保留数据库客户端 stderr，不能进一步断言具体数据库错误。新目标保持现场，等待测试负责人独立只读取证或项目经理另行派单。

## 4D-1R VerifyOnly 独立只读取证

测试负责人对 `public_opinion_023_legacy_5022bfe2` 完成独立只读取证。原始数据库错误为：

```text
ERROR 1109 (42S02): Unknown table 'routine_privileges' in information_schema
```

MariaDB 10.4 不提供 `information_schema.ROUTINE_PRIVILEGES` 视图，因此 VerifyOnly 的末项查询与当前引擎不兼容；该失败不是 migration 或目标 schema 验收失败。独立取证确认数据库事实检查全部通过，`ROUTINES=0`，且 schema/global 权限均无 `EXECUTE`。

建议的兼容策略为：VerifyOnly 先判断 `ROUTINE_PRIVILEGES` 视图是否存在；存在时查询该视图，不存在时同时断言 `ROUTINES=0` 并保留无额外 schema/global 权限检查。不得简单删除 routine 权限验证。该建议尚待项目经理正式派单，当前未修改脚本、未重跑 VerifyOnly、未改动数据库。

## 4D-1RV MariaDB routine 权限核验兼容修复

按项目经理正式派单，仅修改 `verify-4d1.ps1`：先检测 `information_schema.ROUTINE_PRIVILEGES` 是否存在；存在时沿用原 routine privilege 查询，不存在时断言目标 schema `ROUTINES=0`、目标 schema 无 `EXECUTE`、全局无 `EXECUTE`。原有 schema/global/table 权限断言全部保留，没有无条件跳过 routine 验证。

零数据库连接的双分支 fixture 已通过，随后仅对 `public_opinion_023_legacy_5022bfe2` 全量重跑 VerifyOnly，结果 `status=PASS`。MariaDB 10.4 分支记录 `routine_privileges_view_present=0`，三项替代断言全部通过。验证期间 `migration_invoked=0`；`run-4d1.log` 前后 SHA-256 均为 `4e0aa449b0d83410ad37be54458bd89f8af4392db6a947579939fc43729f9a2f`，UTC mtime ticks 前后均为 `639245548248628465`，确认未重跑 migration 且 run 证据未变。

## 测试负责人最终复核

测试负责人完成独立最终复核，结论为 `4D-1RV PASS`：双分支零数据库 fixture 与全量 VerifyOnly 均通过，`migration_invoked=0`；精确 25 条 ledger、reconciliation、两条 CHECK、核心 schema、15 个关键索引、6 个关键外键及权限边界均独立确认通过，`run-4d1.log` 的 SHA-256 与 mtime 保持不变。阶段 4D-1RV 至此完成。
