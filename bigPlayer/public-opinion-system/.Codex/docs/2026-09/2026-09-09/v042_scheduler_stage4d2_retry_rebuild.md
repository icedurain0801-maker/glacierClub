# 统一来源调度：阶段 4D-2R 全新 retry 重做

- Status: completed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 范围与边界

使用 `127.0.0.1:43306` 上全新随机 `public_opinion_023_retry_` 前缀库验证 023 的部分 DDL fail-closed 与同库恢复重跑。所有既有 4D-2 库继续冻结，不访问 3306 或 Worker，不修改项目 migration/runner 语义。

执行顺序固定为：新库与最小账号 → 标准 runner 逐文件执行 001–018 → 预置受控三列残缺 `po_source_schedule_state` → 有限超时运行 023 并要求非零退出、连接关闭、023 ledger 为 0 → 记录部分 DDL → 仅删除受控残缺表 → 同库标准 runner 重跑 023 → VerifyOnly。

## 执行命令

```powershell
& .temp/public-opinion-mariadb-023-4d2/mock-e2e-4d2.ps1
& .temp/public-opinion-mariadb-023-4d2/provision-4d2.ps1
& .temp/public-opinion-mariadb-023-4d2/execute-4d2.ps1
& .temp/public-opinion-mariadb-023-4d2/verify-4d2.ps1
```

所有凭据仅保存在 ACL 收紧的 `.temp` JSON 中；日志仅记录数据库/账号身份、SQL 与 migration 文件 SHA-256、阶段结果、退出码和超时状态，不回显密码或 `DATABASE_URL`。

## Mock 与 provision

增加有限超时证据后，全部 PowerShell AST、基础 fixture 与 provision/prepare/run/verify 四阶段端到端零数据库 mock 通过，记录 `database_commands=0`。随后 provision 成功创建全新目标 `public_opinion_023_retry_65a2e4a2` 与最小权限账号 `po_mig_4d2_65a2e4a2@127.0.0.1`；空库、实例身份、schema 权限与无全局权限检查通过。

## 真实中断与恢复

`execute-4d2.ps1` 执行通过：

- 标准 runner 逐文件应用实际 20 个 001–018 migration，baseline ledger 精确为 20。
- 受控三列残缺 `po_source_schedule_state` 创建成功。
- 首次 023 在 60 秒有限超时内返回，`exit_code=1`、`timed_out=0`，错误命中 `po_migration_023_fail_schema_definition`。
- 中断现场确认 023 ledger 为 0，translation 表、scheduler 列等部分 DDL 已提交。
- 中断证据日志 SHA-256 为 `28c2904aea578c25973976474b720199d9f90cf17742433c548e9102a9ae8ccc`，随后保持封存不变。
- 仅执行 `DROP TABLE po_source_schedule_state` 删除受控障碍；未清理 023 已产生的其他对象。
- 同库第二次标准 runner 执行 023 成功，`exit_code=0`，023 ledger 精确为一条；总逐文件 runner 调用 22 次，无无参数全量 runner。

## VerifyOnly 首错停止

恢复后的 VerifyOnly 在数据不变量查询处失败，首错为：

```text
ERROR 1054 (42S22): Unknown column 's.account_id' in 'where clause'
```

验证脚本错误引用了不存在的 `po_sources.account_id`。失败前已通过：数据库身份、精确 21 条 ledger、023 单条 ledger、019–022 ledger 缺席、三张 reconciliation 表、核心列、15 个关键索引、6 个关键外键、两条 CHECK 存在及 legacy checkpoint 索引移除。`migration_invoked=0`。

该错误属于只读验收查询本身，未修改数据库；但按门禁已停止，不现场修复、不重跑 VerifyOnly。目标 `public_opinion_023_retry_65a2e4a2` 保持恢复后的现场，等待独立只读取证与项目经理后续派单。

## VerifyOnly 账号关系独立取证

测试负责人独立确认 `po_sources` 不存在 `account_id`。正确的数据关系应以 `po_sync_runs.account_id` 关联 `po_accounts.id`，即通过 `po_accounts a ON a.id=r.account_id` 检查运行记录账号是否存在；当前目标上的正确只读关系断言返回 0。

独立报告：`.tests/2026-09/2026-09-09/v008_4d2r_verifyonly_account_relation_independent_report.md`。`public_opinion_023_retry_65a2e4a2` 继续冻结，尚未修改 VerifyOnly 或重跑，等待项目经理正式派单。

## 4D-2RV VerifyOnly 数据关系修复

按项目经理派单，先增加零数据库 SQL 合同 fixture，确认旧查询红灯；随后仅将错误的 `s.account_id<>r.account_id` 替换为固定关系：`po_sync_runs.source_id` 关联 `po_sources.id`，`po_sync_runs.account_id` 关联 `po_accounts.id`，并验证 `po_accounts.source_id=r.source_id`。fixture 转绿且确认不存在 legacy `s.account_id` 引用。

对冻结目标 `public_opinion_023_retry_65a2e4a2` 只读重跑 VerifyOnly，结果 `status=PASS`、`migration_invoked=0`。数据库身份、精确 21 条 ledger、023 单条、019–022 缺席、reconciliation 表、核心列、15 个关键索引、6 个关键外键、CHECK、legacy 索引移除、数据不变量及权限全部通过。

`run-4d2.log` 前后 SHA-256 均为 `ae41fab6a69ec5c010d66bb67bb4092fd5fdf4374de20b207f881e940f9e7673`，mtime ticks 均为 `639245566266136400`；封存的中断日志前后 SHA-256 均为 `28c2904aea578c25973976474b720199d9f90cf17742433c548e9102a9ae8ccc`。确认 VerifyOnly 未调用 migration，执行证据未变化。

## 测试负责人最终验收

测试负责人完成独立只读验收，结论为 `4D-2RV PASS`：VerifyOnly 全项通过，修正后的 source/account 数据关系不变量为 0，`migration_invoked=0`，run 与 interrupted 日志的 SHA-256、mtime 均保持不变。独立报告：`.tests/2026-09/2026-09-09/v009_4d2rv_final_readonly_acceptance.md`。阶段 4D-2R 至此完成。
