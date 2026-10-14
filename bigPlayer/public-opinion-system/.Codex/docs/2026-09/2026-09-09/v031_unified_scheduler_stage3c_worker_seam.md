# 统一来源调度：阶段 3C Worker 调用 Seam

- Status: qa_passed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 变更范围

- 在 `worker/src/worker.js` 增加独立 `runUnifiedSchedulerSeam` helper、旧扫描末尾的单一调用点及导出。
- 新增 `worker/test/workerUnifiedSchedulerSeam.test.js`。
- 未切换或禁用 legacy scanner、dailyRunner、q1DailyJob 或计划任务。

## Seam 契约

- 默认模式为 `off`，不加载或调用统一调度 job，旧 Worker 扫描语义与返回结构保持不变。
- 仅显式 `shadow` 或 `enabled` 模式调用 `runUnifiedSourceSchedulerOnce`。
- connection、workerId、now、connector capabilities、租约时长和 run ID 工厂均通过 seam 注入；不读取新环境变量。
- 新 job 使用延迟加载，默认关闭或配置缺失时不会加载调度实现。
- 显式模式缺少必要配置时返回 `UNIFIED_SCHEDULER_CONFIG_INVALID` 并记录原错误。
- job 抛错时返回 `UNIFIED_SCHEDULER_FAILED` 并将原异常交给 logger，异常不会终止旧 Worker。
- seam 调用位于既有扫描流程末尾，不替换、不跳过任何旧扫描或分析步骤。

## 验证

新增 seam 前运行专项测试，红灯结果：`1 passed, 4 failed`，失败原因为 `runUnifiedSchedulerSeam is not a function`；原 `runOnce` 默认行为用例已通过。

最小接线后运行：

```bash
node --test --test-concurrency=1 worker/test/workerUnifiedSchedulerSeam.test.js
```

结果：`5 passed, 0 failed`。

测试覆盖默认 off、shadow/enabled、依赖注入、缺配置、job 异常隔离与既有空扫描行为；未连接真实数据库，未启动 Worker 或采集。

2A 至 3C 模块与既有 `worker.test.js` 联合回归结果：`101 passed, 0 failed`。

测试负责人独立盲审结果：`PASS`；seam 专项 `5 passed, 0 failed`，完整 Worker 测试 `151 passed, 0 failed`，本轮无缺陷退回。

## 未验证边界

- 本阶段不配置生产模式，不执行真实 DB、并发事务或 Worker E2E。
- shadow 与 enabled 当前均只调用新 job，均不会替换 legacy scanner；两种模式的后续差异待新派单。
