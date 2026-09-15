# migrate.js 异常连接释放 P0 无数据库回归报告

- 日期：2026-09-09
- 角色：测试负责人
- 范围：`server/src/db/migrate.js`、`server/test/migrate023Runner.test.js`
- 测试边界：静态审查和 Mock 测试；未连接数据库，未访问 3306、Worker、023 SQL 或任何 4D-2 隔离库。

## 结论

**通过。** P0 修复满足准入全新 4D-2 retry 的无数据库门槛。

`runMigrations()` 持有连接生命周期，创建成功后通过唯一 `finally` 调用 `conn.end()` 一次。主体错误优先于关闭错误，普通和 023 guard 失败均不会写 ledger；成功路径在写 ledger 后关闭连接。顶层 `main().catch()` 保持原错误输出与非零退出语义。

## 独立验证

| 场景 | 结果 | 断言 |
|---|---|---|
| 023 definition guard 失败且 close 同时失败 | 通过 | 保留 `MIGRATION_023_CHECK_DEFINITION_MISMATCH`；`end()` 一次；无 ledger INSERT；关闭为最后操作 |
| 普通 migration SQL 失败 | 通过 | 保留原错误对象；`end()` 一次；无 ledger INSERT；不执行 023 SHOW CREATE |
| 普通 migration 成功 | 通过 | 先写对应 ledger，随后 `end()` 一次且为最后操作 |
| 023 既有契约回归 | 通过 | 完整 CHECK 定义验证仍在 ledger 写入之前 |
| 静态合约 | 通过 | 023 schema contract 保持 fs-only |

执行：

```text
node --check server/src/db/migrate.js
node --test server/test/migrate023Runner.test.js server/test/unifiedSchedulerMigration.contract.test.js
```

结果：24/24 通过，0 失败。`git diff --check` 通过。

## 测试缺口

当前未单列 Mock 用例覆盖“主体成功但 `conn.end()` 失败时传播 close error”；实现逻辑已明确处理该分支，且不影响本次派单要求的三条核心路径。建议在后续常规回归中补充。

## 后续门槛

仅准入**全新** `public_opinion_023_retry_*` 隔离库执行完整 4D-2。`public_opinion_023_retry_27fb3ffc` 继续冻结，不移障、不重跑、不 Verify。
