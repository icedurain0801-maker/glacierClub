# 统一来源调度：阶段 4C-3 全新空库首次迁移验收

- Status: qa_passed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 结论

4C-3 在创建新数据库和账号之前，于隔离实例身份查询结果解析门禁处失败。已遵循“失败立即停止、记录首错、无现场修复”要求停止执行；本轮没有创建 4C-3 数据库或账号，没有运行任何项目 migration，也没有进入 schema 核验。

首次错误：

```text
identity query returned an unexpected shape
```

## 执行范围与证据

- 目标实例仍为 `127.0.0.1:43306`，执行前确认仅有一个监听进程，PID 为 `32720`。
- 配置与身份 marker 的静态门禁通过：`bind-address=127.0.0.1`、`port=43306`、`server-id=423309`、`socket=public-opinion-mariadb-023`、`engine=MariaDB 10.4.14`。
- 使用既有隔离 root 凭据在内存中执行只读身份查询；密钥未进入命令行、日志或本文档。
- PowerShell 对身份查询结果做字段拆分时判定结果形状不符合预期，并在任何 `CREATE DATABASE` / `CREATE USER` 之前抛错。
- 未生成 `credential-path.txt` 或任何 4C-3 凭据文件，证明流程未进入新账号凭据落盘阶段。
- 失败日志：`C:\Users\Administrator\AppData\Roaming\Code\User\project manage\.temp\public-opinion-mariadb-023-4c3\provision-4c3.log`。
- 执行脚本：`C:\Users\Administrator\AppData\Roaming\Code\User\project manage\.temp\public-opinion-mariadb-023-4c3\provision-4c3.ps1`；脚本不包含数据库密钥。

## 隔离边界

- 未连接或修改 3306。
- 未重跑或写入 4C-1、4C-2 失败库。
- 未创建任何 4C-3 数据库或账号。
- 未运行标准 `migrate.js`，未执行 001–023。
- 未启动 Worker、dailyRunner、q1DailyJob、计划任务或采集。
- 43306 隔离实例保持运行，等待项目经理决定是否另行授权修正预检脚本并重新发起全新空库验收。

## 后续建议

首次停止后须由项目经理另行派单修正预检脚本；即使预检修复通过，也必须等待新的 4C-3 执行授权后，才可创建全新 `public_opinion_023_` 前缀库和新最小权限账号。不得把预检结果冒充 4C-3 迁移结果。

## 4C-3P 预检脚本修复

项目经理另行授权仅修复预检脚本并重跑只读身份门禁，不得创建数据库、用户或运行 migration。修复内容：

- 将 mysql 客户端输出统一包装为数组，并使用 `[string]($rows[0])` 明确先取首行再转换字符串，消除原 `[string]$rows[0]` 的运算优先级歧义。
- 增加显式 `-PreflightOnly` 模式；该分支位于密码生成和所有 `CREATE DATABASE`、`CREATE USER`、`GRANT` 之前，完成只读检查后立即返回。
- 使用真实只读查询输出验证六个身份字段，确认 MariaDB `10.4.14`、`127.0.0.1:43306`、`server_id=423309`、隔离 datadir 与 socket 均符合预期。
- 本次计划目标为 `public_opinion_023_empty_4c3_6ba3b514`，计划账号为 `po_mig_4c3_6ba3b514@127.0.0.1`；预检及结束后的独立只读查询均确认二者不存在。
- 未生成 `credential-path.txt` 或 4C-3 凭据文件；日志记录 `write_statements_executed=0`、`migration_command_invoked=0`。

4C-3P 结果为 `PREFLIGHT_PASS`。这只证明身份门禁与零写入预检通过，不代表 4C-3 已创建空库或完成 001–023 迁移。43306 实例继续保持运行，等待新的 4C-3 执行派单。

## 4C-3 正式建库与授权

项目经理续派后，正式 provision 严格读取并校验 4C-3P 日志，只使用已验证目标：

- 数据库：`public_opinion_023_empty_4c3_6ba3b514`
- 账号：`po_mig_4c3_6ba3b514@127.0.0.1`
- 地址：`127.0.0.1:43306`
- `server_id`：`423309`

创建前再次确认目标数据库、账号和凭据文件均不存在。创建后确认用户表数为 0，账号仅拥有目标数据库的 `SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, REFERENCES, INDEX, ALTER` 权限，无额外全局权限。

凭据保存于 `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\.temp\public-opinion-mariadb-023-4c3\credentials-4c3-6ba3b514.json`，ACL 已关闭继承，只有当前 Windows 用户 `LIUFUYI-2-48\icedurain` 拥有显式完全控制；密钥未回显。正式 provision 日志为同目录下的 `provision-4c3-execution.log`。

正式建库与授权阶段结束时尚未执行 migration；其后的标准迁移结果记录如下。

## 4C-3 标准迁移与首错

随后使用新最小权限账号及标准命令 `node server/src/db/migrate.js` 完整执行。迁移日志依次报告 001–018、同前缀的第二个 018，以及 `023_unified_source_scheduling.sql` 均已 applied，最后输出 `all migrations up to date`；进程退出码为 0。

迁移成功后进入只读核验，已依次取得以下结果：

- `ledger_023=PASS`
- `translation_check=PASS`

随后在独立核验脚本的 trigger CHECK 比较处首次失败：

```text
trigger CHECK verification failed
```

已按“失败立即停止、记录首错、无现场修复”门禁停止。未继续执行 checkpoint 索引/FK及最终 schema 查询，未修改核验脚本，未重跑 migration，也未对已创建数据库做任何现场修复。该错误只证明独立核验未完成；在进一步只读取证前，不将其推断为数据库 CHECK 定义错误或 runner 错误。

证据文件：

- 迁移日志：`C:\Users\Administrator\AppData\Roaming\Code\User\project manage\.temp\public-opinion-mariadb-023-4c3\migration-4c3-full.log`
- 核验日志：`C:\Users\Administrator\AppData\Roaming\Code\User\project manage\.temp\public-opinion-mariadb-023-4c3\verification-4c3.log`

目标数据库、最小权限账号、受限凭据文件与失败现场均保留；43306 隔离实例继续运行，等待测试负责人或项目经理授权只读取证。

## 4C-3V 只读核验脚本修复与首错

测试负责人只读取证确认上一轮 trigger CHECK 失败来自外部 PowerShell 核验脚本：双引号字符串把标识符开头的反引号与 `t` 解析为 TAB，并非数据库 CHECK 定义错误。项目经理随后授权仅修复该脚本并只读复核既有 4C-3 库。

修复内容：

- CHECK 白名单改用安全的 PowerShell 单引号字符串，保留字面反引号。
- 增加 `-VerifyOnly` 模式，所有 Node 与 `migrate.js` 调用均处于该模式不会进入的分支。
- 纯字符串 AST fixture 验证两条 trigger 定义均无 TAB、各保留两个字面 `` `trigger_type` ``，结果为 `PASS`。

仅运行 `-VerifyOnly` 后，依次取得：

- `ledger_023=PASS`
- `translation_check=PASS`
- `trigger_check=PASS`
- `checkpoint_indexes=PASS`
- `checkpoint_account_fk=PASS`
- `core_tables=PASS`
- `core_columns=PASS`

随后在关键索引全集比对处首次失败：

```text
key_indexes verification failed
```

已再次按门禁立即停止，未继续外键全集核验，未修改脚本或数据库。`verification-4c3.log` 明确记录 `mode=VerifyOnly`、`migration_invoked=0`；原迁移日志执行前后 SHA-256 均为 `9BAD62CD372F5BACA318E01D30638EE12D452D96F7C5001F1166BE42A869E87F`，UTC 修改时间均为 `2026-09-09T12:10:31.7690801Z`，证明本次未重跑 migration。

当时只能确认关键索引全集核验未通过，尚不能把原因归结为数据库 schema 或外部核验脚本；需另行授权对保留现场做只读取证。

## 4C-3V 关键索引排序修正与最终结果

测试负责人对保留现场完成独立只读取证，确认 15 个关键索引定义及关键外键全集均正确。上一轮 `key_indexes` 失败来自 MariaDB 默认非二进制排序：`po_sources` 排在 `po_source_schedule_state` 前，与脚本内按字节顺序维护的 expected 数组不同。

项目经理授权后，仅将关键索引查询改为：

```sql
ORDER BY BINARY table_name, BINARY index_name
```

使用真实 15 行索引顺序 fixture 的离线测试确认：MariaDB 原顺序下 `po_sources` 位于 `po_source_schedule_state` 前；按 ordinal/binary 规则排序后与脚本 expected 逐行一致。

随后仅运行 `run-verify-4c3.ps1 -VerifyOnly`，最终结果为 `PASS`：

- `ledger_023=PASS`
- `translation_check=PASS`
- `trigger_check=PASS`
- `checkpoint_indexes=PASS`
- `checkpoint_account_fk=PASS`
- `core_tables=PASS`
- `core_columns=PASS`
- `key_indexes=PASS`
- `key_foreign_keys=PASS`
- `unexpected_default_account_fk=PASS`

核验日志明确记录 `migration_invoked=0` 与 `mode=VerifyOnly`。迁移日志执行前后 SHA-256 均为 `9BAD62CD372F5BACA318E01D30638EE12D452D96F7C5001F1166BE42A869E87F`，UTC 修改时间均为 `2026-09-09T12:10:31.7690801Z`，证明未重跑 migration。

至此，4C-3 开发侧真实首次迁移与完整只读 schema 核验通过，状态转为 `ready_for_qa`。目标数据库、最小权限账号、受限凭据和 43306 隔离实例继续保留，供测试负责人独立复核。

## 独立复核结论

测试负责人对既有 4C-3 库完成独立只读复核，结论为 `PASS`：023 隔离空库真实首次迁移与完整 `VerifyOnly` 验收通过；ledger、两条 CHECK、checkpoint 索引/FK、15 个关键索引、6 个关键外键、核心 schema 与账号权限均符合预期。

独立复核确认 `migration_invoked=0`，迁移日志 SHA-256 与 UTC 修改时间均未变化。本轮未修改数据库、023、`migrate.js`、runner 或 Worker，未重跑 migration。4C-3 状态正式更新为 `qa_passed`。
