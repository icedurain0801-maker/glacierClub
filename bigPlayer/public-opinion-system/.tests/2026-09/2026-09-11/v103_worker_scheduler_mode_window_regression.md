# Worker 调度 Mode 与非法窗口 Fail-Closed 独立盲测

- 日期：2026-09-11
- 测试角色：测试负责人
- 范围：scheduled main mode 门禁、off/shadow/enabled 分流、precreated 非法窗口收尾
- 边界：仅本地/隔离验证；已提交到当前恢复分支，未 push、未启停生产、未触发采集

## 执行结果

命令：

```text
cd worker
node --test --test-concurrency=1 test/schedulerMode.test.js test/worker.test.js test/dailyRunner.test.js test/q1DailyJob.test.js test/workerUnifiedSchedulerSeam.test.js
```

- 测试：**137/137 PASS**，0 fail，0 skipped
- `node --check`（`worker/src/q1DailyJob.js`、`dailyRunner.js`、`worker.js`）：PASS
- `git diff --check`：PASS（仅既有换行提示）

## 验收覆盖

- scheduled main 缺失 mode 返回 `UNIFIED_SCHEDULER_MODE_UNSET`，非法 mode 返回 `UNIFIED_SCHEDULER_MODE_INVALID`；入口在扫描/构建依赖/业务副作用前退出 1。
- `off` 与 `shadow` 保留 legacy 入口；`enabled` 由统一调度接管，legacy scheduled 入口返回 `UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS`。
- precreated run 的单边、非法或超窗固定窗口在账号读取和 connector 调用前 fail-closed。
- 非法窗口使用 claim 返回的 lease owner 调用 `finishPagedFailure`，run 收敛为 terminal `failed`，保留 `SYNC_RUN_WINDOW_INVALID`，并清理 lease；connector 调用数为 0。
- 既有手动、legacy、统一调度和 lease fence 路径未回归。

## 缺陷分级

- P0：0
- P1：0
- P2：0

## 结论

**代码合同：PASS，缺陷 0。** 对应实现提交为 `2c17693`。本轮未触发真实采集或生产操作。生产恢复仍受 migration、可信 Worker 制品/模式、来源与凭据准入等外部前置约束，不得据此宣称真实数据恢复。
