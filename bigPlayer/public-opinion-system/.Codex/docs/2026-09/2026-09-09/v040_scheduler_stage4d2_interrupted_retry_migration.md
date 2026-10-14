# 统一来源调度：阶段 4D-2 中断重跑真实验收

- Status: provision_failed_stopped
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 目标

在 `127.0.0.1:43306` 创建全新 `public_opinion_023_retry_` 前缀隔离库，以标准 runner 逐文件执行仓库实际存在的 001–018 migration。随后预置仅含 `source_id`、`schedule_version`、`effective_at` 与主键的残缺 `po_source_schedule_state`，使 023 在早期 DDL 已隐式提交后由最终 definition guard 预期失败且不写入 023 ledger；只读取证后仅删除该受控障碍表，在同库标准重跑 023 并只读验证完整恢复。

## 固定边界

- 不访问任何既有业务/验收库、3306 或 Worker。
- 不修改项目 migration 或 runner。
- 首次 023 必须以 `po_migration_023_fail_schema_definition` 失败；其他错误均为非预期错误并立即停止。
- 中断后 023 ledger 必须为 0，同时 translation 表及 scheduler 相关列等早期 DDL 必须存在。
- 恢复前只允许执行仓库根 `.temp/public-opinion-mariadb-023-4d2/cleanup-4d2.sql` 中的 `DROP TABLE po_source_schedule_state;`。
- 恢复后 ledger 必须为实际 20 条 001–018 加单条 023，共 21 条；019–022 不登记。

## 脚本与证据

- `fixture-4d2.ps1`：零数据库连接验证 UTF-8 写入/追加 API 与脚本路径。
- `provision-4d2.ps1`：新建随机 retry 库与最小权限账号。
- `execute-4d2.ps1`：执行基线、预置障碍、预期中断、封存现场、仅删障碍、同库重跑。
- `verify-4d2.ps1`：只读验证精确 ledger、schema、索引、外键、CHECK、数据不变量、权限与执行日志不变性。
- `obstacle-4d2.sql` / `cleanup-4d2.sql`：唯一允许的受控障碍与清理 SQL，运行日志记录 SHA-256。

## 无数据库 fixture

PowerShell AST 与禁止目标扫描通过。`fixture-4d2.ps1` 执行结果为 `status=PASS`、`database_connected=0`；显式 UTF-8 无 BOM 写入、CRLF 追加、全部脚本/SQL 路径和密钥哨兵扫描均通过。

## provision 首错停止

`provision-4d2.ps1` 在数据库连接前失败，首错为：

```text
Cannot overwrite variable PID because it is read-only or constant.
```

PowerShell 变量名大小写不敏感，脚本第 9 行的 `$pid` 与只读自动变量 `$PID` 冲突。失败发生在读取隔离实例 pid 文件后的本地变量赋值阶段，尚未连接数据库，未创建 retry 库或账号，未执行任何 migration、障碍 SQL 或清理 SQL。已按“任一非预期错误立即停”门禁停止，未现场修复、未重跑。

## 4D-2P fixture 首错停止

项目经理授权将 provision 中的 `$pid` 重命名为 `$mariadbProcessId`。修改后全部 PowerShell AST 解析通过，但零数据库 fixture 的保留变量扫描出现非预期失败：

```text
reserved automatic variable PID is assigned or referenced by task scripts
```

原因是 fixture 使用 `Select-String` 扫描所有 `.ps1` 时，将 fixture 自身的检测正则字面量也计为命中，形成自匹配。失败发生在任何数据库连接或 provision 之前；未创建 retry 库/账号，未执行 001–018、023 或障碍 SQL。已再次按门禁停止，未现场修复或重跑。

## 4D-2PF fixture 与 provision

保留变量扫描已改为基于 PowerShell AST 的真实 `VariableToken` 检测，字符串与正则字面量不参与匹配。fixture 的普通变量正例与动态构造 `$pid = 1` 负例均通过，全部脚本 AST 与零数据库 fixture 通过。

随后 provision 成功创建全新隔离目标 `public_opinion_023_retry_72cad885` 与最小权限账号 `po_mig_4d2_72cad885@127.0.0.1`。目标为空库，43306 实例身份、datadir、socket、schema 权限与无全局权限检查均通过。

prepare 随后在初始化空 runner 日志时失败，首错为：

```text
Cannot bind argument to parameter 'Text' because it is an empty string.
```

`Write-Utf8Text` 的必填 `Text` 参数未声明允许空字符串。失败发生在 prepare 的任何数据库身份查询、001–018 runner 或障碍 SQL 之前；`public_opinion_023_retry_72cad885` 仍保持 provision 后的空库状态，023 未调用。已按门禁停止，未现场修复或重跑。

## 4D-2PFA prepare 首错停止

`Write-Utf8Text` 已支持空字符串，零数据库 fixture 的空/非空写入、追加、路径与保留变量检测全部通过。随后在同一目标继续 prepare，但在首次 runner 返回后的日志追加处失败：

```text
Cannot bind argument to parameter 'Lines' because it is an empty string.
```

`Add-Utf8Lines` 的 `Lines` 参数未允许数组中的空 stdout/stderr 元素。错误发生在首次 migration runner 调用之后、runner 日志写入之前；`prepare-runner-4d2.log` 长度为 0。目标库可能已应用 `001_initial.sql`，不再视为空库，不得直接重跑 prepare。`prepare-4d2.log` 明确记录 `migration_023_invoked=0`，障碍 SQL 未执行。已停止且未现场修复、未继续后续 migration。

## 4D-2 端到端零数据库 mock 加固

日志工具已统一处理空字符串、空数组、`null` 与无 stdout/stderr：`Write-Utf8Text` 可写空内容，`Add-Utf8Lines` 对空输入稳定 no-op，并仅追加非空行。provision、prepare、run、verify 四个实际脚本均增加隔离的 `-Mock` 路径，总编排 `mock-e2e-4d2.ps1` 逐个调用全部脚本，模拟 runner 成功但 stdout/stderr 为空。

PowerShell AST、基础 fixture 与端到端 mock 全部通过；总编排记录 `database_commands=0`、`runner_success_empty_stdout=PASS`，四个阶段均为 `PASS`。污染风险目标 `public_opinion_023_retry_72cad885` 不再使用。

## 4D-2 全新目标真实执行停止

provision 成功创建全新隔离目标 `public_opinion_023_retry_27fb3ffc` 与最小权限账号。真实编排日志确认：001–018 全部成功、baseline ledger 为 20 条、受控三列残缺 `po_source_schedule_state` 创建成功。

首次 023 调用随后长时间未返回，未按预期以 `po_migration_023_fail_schema_definition` 非零退出并进入只读取证阶段。阶段日志停留在 `controlled_obstacle_created=PASS`，runner 日志尚未写入首次 023 的返回结果。该行为属于非预期错误，开发负责人已中断当前 PowerShell/Node 编排进程并停止后续操作；未执行受控表删除、023 重跑或 VerifyOnly。

由于 023 子进程在中断前已经启动，`public_opinion_023_retry_27fb3ffc` 可能保留早期 DDL 的部分提交现场，但当前尚未进行数据库只读取证，不能断言 023 ledger 或具体 schema 状态。该库不得重跑，保持现场等待独立只读取证。

## 测试负责人独立只读取证

测试负责人对 `public_opinion_023_retry_27fb3ffc` 完成独立只读取证，确认：

- migration ledger 精确为 20 条 001–018，023 为 0。
- 三个部分对象及 11 个 scheduler 相关部分列已提交。
- 受控 `po_source_schedule_state` 仍仅有三列。
- 目标库无残留连接、事务或锁等待。

测试报告：`.tests/2026-09/2026-09-09/v006_4d2_interrupted_migration_independent_acceptance.md`。

挂起根因定位为 `server/src/db/migrate.js` 仅在成功路径调用 `conn.end()`；SQL definition guard 抛错后，顶层 catch 只设置 `process.exitCode`，未关闭数据库连接，Node 进程因此不退出，编排无法取得最终退出码与 stderr。`27fb3ffc` 保持原样，不移障、不重跑、不 Verify。修复项目 runner 及使用全新 retry 库重做须等待项目经理正式派单。
