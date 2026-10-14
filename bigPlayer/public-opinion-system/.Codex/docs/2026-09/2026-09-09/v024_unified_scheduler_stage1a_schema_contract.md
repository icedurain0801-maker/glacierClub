# 统一来源调度：阶段 1A Schema Contract

- Status: ready_for_qa
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 范围

- 新增 `migrations/023_unified_source_scheduling.sql`。
- 幂等补齐仓库缺失的 019–022 schema 后果，再建立统一来源调度表结构。
- 本阶段不运行迁移、不连接真实业务库、不启动 Worker 或采集。

## 已完成

1. 已新增 023 迁移：
   - reconciliation `po_games` / `po_communities` 目录元数据字段与唯一索引；
   - reconciliation checkpoint 窗口字段和窗口唯一键；
   - reconciliation 翻译任务、翻译结果表；
   - 新增显式默认账号、调度版本与生效时间；
   - 扩展 sync run 的来源、触发类型、时刻槽、窗口、版本和重试字段；
   - 新增 `po_source_schedule_state`，保存最近/下一槽及 source 级 lease fencing；
   - 对无效默认账号、孤儿 run、重复槽和最终 schema contract fail-closed。
2. 已根据三评委 P0 修正：
   - 所有关键 reconciliation 对象增加类型、可空性、默认值、索引唯一性/列序及 FK delete rule 的 definition-aware 最终断言；
   - 历史空 trigger 仅在 `scheduled_at IS NULL` 时回填 `legacy`，非法 trigger/slot 组合直接中止；
   - 槽位唯一键收紧为 `(source_id, scheduled_at)`，三元组仅保留普通查询索引；
   - 默认账号候选必须已启用、`authorized` 且未过期，并满足 source/game/platform/community 归属；多候选按 `updated_at DESC, id ASC` 固定，无合法候选保持 NULL。
3. 新增 `server/test/unifiedSchedulerMigration.contract.test.js`，以纯 `fs` 静态读取和状态模型验证迁移契约，不加载数据库驱动、不执行迁移。
4. 根据首次测试盲审退回完成 R2 修正：
   - 新增 `po_sync_runs_trigger_slot_chk` 持久化数据库约束，阻止迁移后写入非法 trigger/slot 组合；
   - 将 `po_translation_jobs_status_chk` 的存在性与五个允许状态纳入 definition-aware contract；
   - 删除脱离 SQL 的 Set 并集模型，改为直接断言迁移 SQL 中的 guard、目标 DDL 和幂等 DML 文本；该测试明确不作为真实数据库执行证据。
5. 根据第二次盲审退回完成 R3 修正：
   - 将 translation status 与 trigger/slot 的 `CHECK_CLAUSE` 校验从关键词 `LIKE` 收紧为规范化后的完整定义白名单比较；
   - 静态测试加入正确定义、额外 `OR 1=1` 放宽、额外限制及错误枚举变体，确认只有精确定义及数据库可能附加的一层外括号可通过。
6. 根据第三次盲审退回完成 R4 修正：
   - 测试分别从目标 DDL 和迁移内 `@*_check_expected` 常量提取定义，规范化后交叉断言一致；
   - translation 与 trigger 分别覆盖替换非法枚举、删除合法枚举、`OR 1=1` 放宽及附加限制，避免 expected 常量自证。
7. 根据首次真实空库迁移失败完成 R5 修正：
   - 在删除任一 checkpoint 旧唯一索引前，幂等确保独立普通索引 `po_sync_checkpoints_account_idx (account_id)` 已存在；
   - 同名索引若唯一性或列序错误，立即通过专用 fail-closed 语句中止，不删除或重建账号外键；
   - 创建后再次核验精确定义，且把该支撑索引纳入最终 schema definition contract。
8. 根据 MariaDB 10.4 CHECK 元数据兼容性问题完成 R6 修正：
   - 根因确认：MariaDB 10.4 的 `information_schema.CHECK_CONSTRAINTS.CHECK_CLAUSE` 为 `varchar(64)`，复杂 CHECK 表达式会被截断，不能作为完整定义比对依据；
   - 023 SQL 内只按完整约束名称与 `constraint_type='CHECK'` 验证 `po_translation_jobs_status_chk`、`po_sync_runs_trigger_slot_chk` 是否存在，不再依赖可能截断的 `CHECK_CLAUSE`；
   - `migrate.js` 对 023 使用同一数据库连接：先执行 023 SQL，再在写入 `po_schema_migrations` 前分别 `SHOW CREATE TABLE po_translation_jobs` 与 `SHOW CREATE TABLE po_sync_runs`，对两条 CHECK 定义做精确规范化比对；
   - 定义缺失、枚举变化、额外放宽或额外限制均以 `MIGRATION_023_CHECK_DEFINITION_MISMATCH` 中止，且不得写入 023 ledger；
   - 非 023 迁移仍保持“执行 SQL 后写入 ledger”的原行为，不增加 `SHOW CREATE` 校验。
9. 根据交叉审查完成 R7 修正：
   - 发现 trigger CHECK 分支括号存在假阳性：测试 fixture 与真实 `SHOW CREATE TABLE` DDL 的括号形态不一致，且 runner 内 canonical expected 未与真实 DDL 同步，导致有效定义可能被错误拒绝；
   - 先将测试 fixture 对齐真实 DDL，聚焦 runner 测试暴露为 `2 passed, 2 failed`；
   - 随后仅对齐 canonical expected 与真实 DDL，未放宽精确匹配规则，聚焦 runner 测试恢复为 `4 passed, 0 failed`；
   - 主会话最终复跑两份目标测试为 `18 passed, 0 failed`。

## 验证结果

命令：

```bash
node --test --test-concurrency=1 server/test/unifiedSchedulerMigration.contract.test.js
```

首次 1A-R 结果：`8 passed, 0 failed`。测试负责人指出持久约束与 CHECK 定义覆盖不足后，先新增失败用例，得到 `8 passed, 2 failed`；完成 R2 后为 `10 passed, 0 failed`。第二次盲审指出 CHECK 仍为关键词匹配，新增负向精确定义用例后先得到 `10 passed, 1 failed`；完成 R3 后为 `11 passed, 0 failed`。第三次盲审指出 expected 常量仍可能自证，加入 DDL/expected/最终核验三方绑定后首次因动态 DDL 提取失败得到 `10 passed, 1 failed`，修正提取后最终为 `11 passed, 0 failed`。

首次真实 MariaDB 空库迁移在 023 删除 `po_sync_checkpoints_task_uk` 时失败，原因是该索引仍为 `po_sync_checkpoints_account_fk` 提供必需前缀。R5 先增加三项静态测试得到 `11 passed, 3 failed`，完成前置支撑索引 guard 后为 `14 passed, 0 failed`。当前失败库不重跑，真实修复验证须使用全新隔离空库。

R6 兼容性修正采用测试先行：红灯阶段合计 `11 passed, 7 failed`；完成 023 存在性校验收敛、`migrate.js` ledger 前 `SHOW CREATE` 精确校验及非 023 回归保护后，绿灯结果为 `18 passed, 0 failed`。相关 `node --check` 通过。

R7 交叉审查先将 trigger CHECK 测试 fixture 对齐真实 DDL，聚焦 runner 测试得到 `2 passed, 2 failed`；随后将 canonical expected 对齐真实 DDL，且不放宽匹配规则，聚焦 runner 测试得到 `4 passed, 0 failed`。主会话最终复跑两份目标测试为 `18 passed, 0 failed`。

本次 R6 仅执行静态语法检查与使用 fake connection 的离线单元测试，未连接任何数据库、未运行 023 或其他迁移。此前失败的 `4C-1`、`4C-2` 隔离库永久禁止重跑，后续真实验证必须新建全新隔离库。

## 验证边界

本阶段只允许静态 SQL contract 和状态模型验证。真实 MySQL/MariaDB 的空库、旧库与中断重跑验证必须在后续获得允许后使用隔离测试库执行。

未验证边界：

- 未验证 SQL 在目标 MySQL 8 / MariaDB 版本的真实解析与 DDL 行为。
- 未验证故意引用缺失表的 fail-closed 语句在目标数据库上的错误码及 ledger 行为。
- 未恢复 019/020 的完整权威目录种子；023 只 reconciliation 已确认的 schema 后果。
- 未验证并发入队、source lease fencing、Worker 接线与任何外部连接器。
- 本次 R6 未连接数据库、未运行迁移；`SHOW CREATE` 的真实 MariaDB/MySQL 输出兼容性仍须在全新隔离库验证，禁止复用或重跑 `4C-1`、`4C-2` 失败库。
- R7 聚焦 runner 测试为 `4 passed, 0 failed`，最终两份目标测试合并结果为 `18 passed, 0 failed`。
