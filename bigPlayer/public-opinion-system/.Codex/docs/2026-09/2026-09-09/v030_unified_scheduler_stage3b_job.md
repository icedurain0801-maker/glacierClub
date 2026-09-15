# 统一来源调度：阶段 3B 单次作业

- Status: qa_passed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 变更范围

- 新增 `worker/src/unifiedSourceSchedulerJob.js`。
- 新增 `worker/test/unifiedSourceSchedulerJob.test.js`。
- 未修改或接入现有 Worker、Repository、dailyRunner、q1DailyJob 或计划任务。

## 作业契约

- `runUnifiedSourceSchedulerOnce` 接收调用方注入的 connection、workerId、now、connector capabilities，以及可选的 last processed、既有 evidence、租约时长和 run ID 工厂。
- 同一 connection 先交给 candidate loader；只有候选加载成功后才构造 composition runtime 并执行调度。
- loader 失败返回稳定批次结果：`status: failed`、`reasonCode: CANDIDATE_LOAD_FAILED`、候选数 0、无部分 source 决策。
- loader 成功返回候选总数及逐 source 决策，保留 slot、trigger、reason、run、epoch 等 runtime 证据。
- runtime 内部的单来源 adapter 异常继续隔离，后续来源仍可处理。
- manual/legacy evidence 原对象、原顺序保留，不与 scheduled evidence 合并覆盖。
- 作业模块不创建连接、不读取环境变量、不发起采集，也不重复实现 loader、调度决策、SQL 或 lease 规则。

## 验证

实现前运行：

```bash
node --test --test-concurrency=1 worker/test/unifiedSourceSchedulerJob.test.js
```

红灯结果：`0 passed, 1 failed`，错误为 `ERR_MODULE_NOT_FOUND`。

最小实现后再次运行同一命令，绿灯结果：`4 passed, 0 failed`。

测试使用 fake connection，覆盖加载后调度顺序、完整批次证据、loader 稳定失败、单来源 adapter 失败隔离、manual/legacy evidence 保留及空候选；未连接真实数据库。

测试负责人独立盲审结果：`PASS`；job 专项 `4 passed, 0 failed`，2A 至 3B 联合回归 `30 passed, 0 failed`，本轮无缺陷退回。

## 未接线边界

- 本阶段没有修改 `worker/src/worker.js` 或任何现有 Repository。
- 未运行迁移、数据库、Worker、外部连接器或采集。
- fake connection 通过不代表真实数据库事务、并发与 Worker E2E 已验证。
