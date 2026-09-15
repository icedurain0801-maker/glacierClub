# 6A Legacy Scheduled Handoff Gate 独立零数据库复验报告

- 日期：2026-09-09
- 角色：测试负责人
- 范围：`worker/src/dailyRunner.js`、`worker/src/q1DailyJob.js`、`worker/install-q1-daily-task.cmd` 及对应测试
- 边界：仅 Node 零数据库测试和静态审查；未连接数据库、启动 Worker/Windows task、运行 installer、执行 crawler 或采集。

## 结论

**功能 PASS。** enabled 模式下两个 legacy scheduled 入口均在依赖、repository、lock、preflight 和采集前稳定让位；off、unset 与 manual 不回归；installer 不会自动禁用或删除 Windows 任务。

## 验收结果

| 门槛 | 结果 | 证据 |
|---|---|---|
| daily scheduled enabled gate | 通过 | `runDaily(..., { unifiedSchedulerMode: 'enabled' })` 返回 `skipped / UNIFIED_SCHEDULER_OWNS_SCHEDULED_RUNS`，注入 dependency 调用为 `0` |
| Q1 scheduled enabled gate | 通过 | `runQ1Daily({ unifiedSchedulerMode: 'enabled' })` 在 source 校验和 lock 前返回同一稳定 reasonCode |
| off / unset / manual | 通过 | 两个 `legacyScheduledGate` 对 off、unset 返回 `null`；enabled + manual 不短路，Q1 manual 按旧路径仍要求 `sourceId` |
| 零 sync run / 采集 | 通过 | gate 单测在 fake dependency/无 sourceId 断言下完成，未构建 repository、获取 lock、调用 crawler 或写入数据库 |
| installer 不自动改任务 | 通过 | 静态测试确认 install 区段仅创建任务和输出受控切换提示；不含 Disable/Delete；`schtasks /Delete` 只在显式 `/remove` 路径 |
| 专项回归 | 通过 | `dailyRunner`、`q1DailyJob`、`q1DailyTaskInstaller`：38/38 通过 |
| 扩展零 DB 回归 | 通过 | 加入 worker seam 与 worker 套件后：109/109 通过、0 failed、0 skipped |

## 范围审查备注

当前未提交工作树中 `dailyRunner.js`、`q1DailyJob.js` 和 installer 存在除 6A gate 外的既有大范围变更。因此本报告仅认证上述 6A 行为与测试结果，**不认证整个工作树相对 `HEAD` 的“窄 diff”归属**。项目经理在合并或发版前应要求开发负责人按任务边界拆分、说明或提交这些并行变更。

## 残余风险

本轮按授权没有执行 Windows 任务、installer、真实 Worker、数据库或采集；真实部署切换仍应沿用项目经理的发版门禁。
