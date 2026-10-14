# MariaDB CHECK 与迁移 Runner 兼容性修正

- Status: qa_passed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09
- Scope: `023_unified_source_scheduling.sql` / migration runner schema contract

## 根因

MariaDB 10.4 的 `information_schema.CHECK_CONSTRAINTS.CHECK_CLAUSE` 为 `varchar(64)`。复杂 CHECK 表达式会被截断，因此迁移 SQL 无法依赖该字段完成约束定义的精确比对；继续使用截断值会把正确约束误判为不一致，或使定义核验失去可信度。

## 修正口径

1. 023 SQL 只验证两条 CHECK 的完整约束名称及 `constraint_type='CHECK'`：
   - `po_translation_jobs_status_chk`
   - `po_sync_runs_trigger_slot_chk`
2. `migrate.js` 对 023 使用执行迁移 SQL 的同一连接，在 SQL 成功后、写入 `po_schema_migrations` 前依次执行：
   - `SHOW CREATE TABLE po_translation_jobs`
   - `SHOW CREATE TABLE po_sync_runs`
3. Runner 从 `SHOW CREATE` 提取 CHECK，去除数据库格式差异并规范化，再与代码内完整白名单定义精确比较。
4. 定义缺失、枚举替换或删除、额外 `OR` 放宽、额外限制均抛出 `MIGRATION_023_CHECK_DEFINITION_MISMATCH`；发生不一致时不得写入 023 ledger。
5. 非 023 迁移行为保持不变：执行 SQL 后直接写入对应 ledger，不执行额外 `SHOW CREATE`。

## 交叉审查修正

交叉审查发现 trigger CHECK 分支括号存在假阳性：测试 fixture 与真实 `SHOW CREATE TABLE` DDL 的括号形态不一致，runner 内 canonical expected 也未与真实 DDL 同步，因此有效定义可能被错误拒绝。

修正时先将测试 fixture 对齐真实 DDL，聚焦 runner 测试得到 `2 passed, 2 failed`；随后仅将 canonical expected 对齐真实 DDL，未放宽精确匹配规则，聚焦 runner 测试得到 `4 passed, 0 failed`。主会话最终复跑两份目标测试为 `18 passed, 0 failed`。

## R1 QA 退回修复

QA 使用 4C-2 真实 `SHOW CREATE TABLE` 中无分支括号的 trigger CHECK 形态复现 runner 误拒；新增真实形态正例后的红灯为 `4 passed, 1 failed`，失败错误码为 `MIGRATION_023_CHECK_DEFINITION_MISMATCH`。

修复采用两条完整、显式的 trigger CHECK 白名单，分别覆盖带分支括号的 canonical 形态与 MariaDB 4C-2 无分支括号的等价形态；两条白名单继续复用既有精确匹配及“最多允许单层整体括号”规则，不做通用去括号，不接受其他结构变化。

防回归补齐无分支括号 alias 的整体一层括号正例，以及 alias 漏项枚举、alias + `OR 1=1`、alias + 额外限制和完全未知表达式负例。所有负例继续要求 `MIGRATION_023_CHECK_DEFINITION_MISMATCH`，且不得写入 023 ledger；聚焦 runner 测试结果为 `7 passed, 0 failed`，最终两份迁移测试合并结果为 `21 passed, 0 failed`。

测试负责人随后完成离线独立复审，结论为 `PASS`：真实 MariaDB 无分支括号形态与整体一层括号形态均通过，全部负例继续 fail-closed 且不写 ledger；独立复跑结果为 `21 passed, 0 failed`，语法检查与限定 `git diff --check` 均通过。本轮未连接数据库。

## 测试证据

- 红灯：`11 passed, 7 failed`。
- 绿灯：`18 passed, 0 failed`。
- `node --check`：通过。
- 覆盖正确 CHECK、数据库附加单层括号、错误枚举、删除合法枚举、`OR 1=1` 放宽、附加限制，以及非 023 行为不变。
- 交叉审查增量：fixture 对齐真实 DDL 后聚焦 runner 测试为 `2 passed, 2 failed`；canonical expected 对齐且保持精确匹配后为 `4 passed, 0 failed`。
- R1 前一轮最终合并测试：`18 passed, 0 failed`（历史结果，不代表 R1 最终结果）。
- R1 QA 红灯：真实 4C-2 无分支括号形态为 `4 passed, 1 failed`。
- R1 修复后聚焦 runner：`7 passed, 0 failed`；覆盖 alias 整体一层括号正例，以及漏项枚举、`OR 1=1`、额外限制、未知表达式负例。
- R1 最终合并测试：`21 passed, 0 failed`。

## 验证边界

- 本次未连接任何数据库，未执行 023 或其他迁移。
- 测试通过静态 SQL contract 与 fake connection 验证 runner 调用顺序、错误码和 ledger 门禁，不构成真实 MariaDB/MySQL 迁移通过证明。
- 此前失败的 `4C-1`、`4C-2` 隔离库永久禁止重跑；后续真实验证必须使用全新隔离空库。
- 真实 MariaDB 10.4 / MySQL 8 的 `SHOW CREATE TABLE` 输出仍需在获得授权后独立验收。
- R1 前一轮聚焦 runner 测试为 `4 passed, 0 failed`，两份目标测试最终合并结果为 `18 passed, 0 failed`；以上均为历史结果。
- 4C-3 已锁定，本次不得复用、重跑或写入；R1 修复未连接数据库、未执行迁移、未启动 Worker。
- R1 聚焦 runner 测试为 `7 passed, 0 failed`，最终两份迁移测试合并结果为 `21 passed, 0 failed`。
