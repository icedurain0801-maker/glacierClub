---
last_updated: 2026-09-09
status: qa_pass_scope_audited
scope: scheduler-stage6a
---

# v045 Scheduler Stage 6A Legacy Handoff Gate

## 变更结论

- `dailyRunner` 与 Q1 scheduled legacy 入口仅在 `UNIFIED_SOURCE_SCHEDULER_MODE=enabled` 时让位。
- 让位结果固定为 `status: skipped`，稳定原因码为 `UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS`。
- `off`、未设置及 `triggerType: manual` 保持 legacy 行为。
- daily 入口在依赖构建、repository、lock 和采集前执行门禁；Q1 入口在 source 校验、lock、preflight 和 crawler 前执行门禁。
- installer 仅输出受控切换提示，不会自动 Disable/Delete Windows task；显式 `/remove` 行为保留。

## 修改文件

- `worker/src/dailyRunner.js`
- `worker/src/q1DailyJob.js`
- `worker/install-q1-daily-task.cmd`
- `worker/test/dailyRunner.test.js`
- `worker/test/q1DailyJob.test.js`
- `worker/test/q1DailyTaskInstaller.test.js`

## 验证记录

### 红灯

实现前专项测试共 38 项：35 passed，3 failed。失败分别对应 daily gate、Q1 gate 和 installer 提示缺失。

### 专项绿灯

```powershell
node --test --test-concurrency=1 `
  worker/test/dailyRunner.test.js `
  worker/test/q1DailyJob.test.js `
  worker/test/q1DailyTaskInstaller.test.js
```

结果：38 passed，0 failed。

### 扩展零 DB 回归

```powershell
node --test --test-concurrency=1 `
  worker/test/dailyRunner.test.js `
  worker/test/q1DailyJob.test.js `
  worker/test/q1DailyTaskInstaller.test.js `
  worker/test/workerUnifiedSchedulerSeam.test.js `
  worker/test/worker.test.js
```

结果：109 passed，0 failed，0 skipped。

## 安全边界

- 未连接数据库。
- 未启动 Worker、Windows task 或任何采集。
- 未 Disable/Delete Windows task。
- 未提交、未 push、未发版。

## 待办

- 后续提交前使用精确 patch 或逐行编辑暂存区，只纳入本节列出的 6A 行；不得直接接受混合 hunk。

## QA 结论

- 独立零 DB 复验：PASS。
- 证据：`.tests/2026-09/2026-09-09/v019_6a_legacy_handoff_gate_zero_db_regression.md`。
- 专项 38/38，扩展 109/109；未连接 DB，未运行 Worker、Windows task 或采集。

## 6A 交付范围只读审计

审计基准为当前工作树相对 `HEAD` 的 `git diff --unified=0`。当前目标文件同时承载阶段 6A 与此前未提交改动，因此以下行号是当前工作树行号，hunk 标识用于后续逐项核对。

### `worker/src/dailyRunner.js`

明确属于 6A：

- 当前行 20-25：常量与 `legacyScheduledGate`；位于混合 hunk `@@ -19,0 +20,36 @@`。同 hunk 的当前行 27-55 为既有 analysis scope / claim lock 改动，不属于 6A。
- 当前行 259-267：`runDaily` 新增 `triggerType`、`unifiedSchedulerMode`，先 gate、后 `buildDeps`；hunk `@@ -207 +259,9 @@`，属于 6A。
- 当前行 371-375：`main()` 在 `buildDeps()` 前 gate；hunk `@@ -300,0 +371,5 @@`，属于 6A。
- 当前行 391 的 `legacyScheduledGate` 导出：位于混合 hunk `@@ -316 +391 @@`；同一行的 `isDailyAnalysisScopeActive`、`registerDailyAnalysisScope`、`isClaimLockError`、`stableClaimLockError` 导出为既有改动，不属于 6A。

无法归入 6A、应排除的既有 hunk：

- `@@ -93 +129 @@`、`@@ -98 +134 @@`、`@@ -127,4 +163,20 @@`、`@@ -133 +185 @@`：source scope 与 claim lock retry。
- `@@ -208,0 +269 @@`、`@@ -236,0 +298 @@`、`@@ -264 +326,2 @@`、`@@ -267 +330 @@`、`@@ -270,5 +333,9 @@`、`@@ -283,0 +351,3 @@`、`@@ -286,3 +356 @@`、`@@ -290 +358,2 @@`、`@@ -293 +362 @@`、`@@ -295,0 +365 @@`：daily analysis scope、多 source pump 与 collection isolation。

关联测试：

- `worker/test/dailyRunner.test.js` 当前行 4 的导入变更，hunk `@@ -4 +4 @@`。
- 当前行 11-24 的 enabled/off/unset/manual 与零依赖访问测试，hunk `@@ -10,0 +11,15 @@`。
- 该测试文件其余 hunk `@@ -157,0 +173,19 @@`、`@@ -193,0 +228,55 @@`、`@@ -215,0 +305 @@` 为既有改动，不属于 6A。

### `worker/src/q1DailyJob.js`

明确属于 6A：

- 当前行 7-12：常量与 `legacyScheduledGate`；hunk `@@ -6,0 +7,6 @@`，属于 6A。
- 当前行 274-278：scheduled/manual 参数和 sourceId/lock/preflight/crawler 前 gate；位于混合 hunk `@@ -195 +261,18 @@`。同 hunk 中 `options` 解构、`businessDate`、`scope` 等为既有改动，不属于 6A。
- 当前行 385 的 `legacyScheduledGate` 导出：位于混合 hunk `@@ -261 +385 @@`；同一行其他新增导出为既有改动，不属于 6A。

无法归入 6A、应排除的既有 hunk：

- `@@ -5 +5 @@`、`@@ -30 +36,3 @@`。
- `@@ -108,0 +117,6 @@` 至 `@@ -155 +211,11 @@` 的统计、审计 scope、phase log、原子 report 写入改动。
- `@@ -197 +280 @@` 至 `@@ -254 +353,27 @@` 的 business window、scope、phase evidence、dry-run 与 report 改动。
- `@@ -257,2 +382 @@` 的默认输出目录改动。

关联测试：

- `worker/test/q1DailyJob.test.js` 当前行 8-23，hunk `@@ -8 +8,16 @@`：导入 gate，并覆盖 enabled/off/unset/manual 与 manual 原错误路径，属于 6A。
- 该测试文件其余 hunk `@@ -14 +29 @@`、`@@ -18,3 +33,5 @@`、`@@ -24,0 +42,14 @@`、`@@ -85,0 +117,30 @@` 为既有改动，不属于 6A。

### `worker/install-q1-daily-task.cmd`

明确属于 6A：

- 当前行 50-51：install 成功后的受控切换与“不自动 Disable/Delete”提示。
- 当前行 87-88：dry-run 中相同提示。
- 四行均位于混合 hunk `@@ -16,0 +50,40 @@`；同 hunk 的 validate、verify、dry-run 主体为既有 installer 改动，不属于 6A。

无法归入 6A、应排除的既有 hunk：

- `@@ -1,2 +1,2 @@`、`@@ -5 +5,9 @@`、`@@ -7,3 +15,3 @@`、`@@ -11,2 +19,21 @@`、`@@ -14 +41,7 @@`。
- 混合 hunk `@@ -16,0 +50,40 @@` 中除当前行 50-51、87-88 外的内容。
- `@@ -19,0 +93 @@`、`@@ -21 +95,2 @@`、`@@ -23 +98 @@`、`@@ -29 +104 @@`。

关联测试：

- `worker/test/q1DailyTaskInstaller.test.js` 当前为未跟踪新文件，当前行 1-22 整体属于 6A；验证 install block 有提示、无自动 Disable/Delete，并保留显式 `/remove` Delete。

### 可提交性结论

- **不能直接仅选择现有整 hunk 完成完整 6A 提交。** daily 常量、daily 导出、Q1 参数/gate、Q1 导出以及 installer 提示均与既有改动共享 hunk；直接接受这些整 hunk 会夹带非 6A 内容。
- 纯 6A hunk 可以单独选择，但不足以组成可运行的完整 6A 变更。
- 后续如需窄提交，必须由工作树唯一写入者使用精确 patch/逐行暂存方式构造索引，并再次以 `git diff --cached` 逐行审查；本次只读审计未暂存或提交任何内容。

## Stage 6B 专属 Patch 构造结果

- 已生成仅包含 6A 生产改动、三份关联测试及本文件范围审计快照的专属 patch。
- 工件：`bigPlayer/.temp/stage6b-6a-exclusive-20260909/v046_stage6a_exclusive_requires_pre6a_composite.patch`。
- SHA256：`CB911A6E6A3AAD317CB3C397C7000EAF74DC30F30D3ED51C62088A767779881E`。
- 在精确 pre-6A composite 隔离基线上，`git apply --check` 和实际 apply 均通过；三个定向零 DB 测试 3/3 PASS。
- 对纯 `HEAD` 的 apply check 失败，确认 patch 依赖 installer dry-run/validate/verify、daily analysis-scope/claim-lock、Q1 `beijingDayWindow`/options/scope/report 等既有未提交基础。
- 因此前置依赖真实存在，patch 文件名与 v046 均明确标注 `requires_pre6a_composite`；不得将其描述为可直接应用到 `HEAD` 的独立 patch。
