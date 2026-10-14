# 统一来源调度：migration runner 异常连接释放修复

- Status: completed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09
- Scope: `server/src/db/migrate.js`、`server/test/migrate023Runner.test.js`

## 问题

阶段 4D-2 在 023 definition guard 按预期抛错后，Node 进程未退出。独立只读取证确认数据库无残留连接、事务或锁；代码审查确认 runner 只在成功路径调用 `conn.end()`，异常路径由顶层 catch 设置 `process.exitCode` 后仍保留 mysql2 连接句柄。

## 修改

- 新增可注入依赖的 `runMigrations()` 编排函数，连接所有权仍由 runner 持有。
- 数据库连接创建成功后，无论 migration 成功或异常，均在唯一 `finally` 路径调用一次 `conn.end()`。
- 保存 primary migration error；若关闭连接同时失败，仍抛出原 migration error，不被 cleanup error 覆盖。
- 若主体成功但关闭连接失败，则传播关闭错误；成功日志只在连接关闭完成后输出。
- `applyMigration()` 与 migration 023 SQL 语义未修改。

## 红绿测试

先新增三条 orchestration 级回归并执行目标测试，得到预期红灯：既有模块未导出 `runMigrations`，三条新增用例均以 `runMigrations is not a function` 失败。

实现后同一命令转绿，10 条测试全部通过。新增覆盖：

1. 023 CHECK definition 失败且 `end()` 同时失败：关闭一次、不写 ledger、保留 023 primary error。
2. 普通 migration SQL 失败：关闭一次、不写 ledger、保持原错误对象且不执行 SHOW CREATE。
3. 普通 migration 成功：先写 ledger，随后关闭连接一次，关闭为最后操作。

## 验证边界

- 本次仅运行 Node 语法检查、目标 runner 测试、migration contract 静态测试和精确路径 diff check。
- 未连接任何数据库，未访问 3306、Worker 或冻结的 4D-2 目标。
- `public_opinion_023_retry_27fb3ffc` 保持失败现场，不重跑、不移障、不 Verify。
- 4D-2 真实验收须在 QA 通过后由项目经理另行授权，并使用全新随机 retry 库。

最终无数据库验证结果：`migrate023Runner.test.js` 与 `unifiedSchedulerMigration.contract.test.js` 合计 24/24 通过；两个 JavaScript 文件 `node --check` 通过；三个精确变更路径的 `git diff --check` 通过。

## 测试负责人独立盲审

测试负责人完成独立 Mock/静态复核，结论为 PASS：24/24 测试通过，023 失败、普通 migration 失败与成功三条核心路径均确认只关闭连接一次；失败不写 ledger，关闭失败不覆盖 primary migration error。独立报告：`.tests/2026-09/2026-09-09/v007_migrate_runner_connection_cleanup_regression.md`。
