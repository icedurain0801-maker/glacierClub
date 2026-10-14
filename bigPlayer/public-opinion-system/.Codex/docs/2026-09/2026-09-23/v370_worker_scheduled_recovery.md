# v370 定时调度消费修复变更记录

## 范围

修复 `runOnce()` 在统一调度入队后不重新读取队列，以及动态轮询遗漏 `scheduled` / `scheduled_catchup` 的问题。同步保留账户、凭据、站点和时间窗传递逻辑。

## 变更

- 调度接管周期源后，同一轮重新读取并合并新建的 runnable run。
- 动态轮询触发类型扩展为 `manual`、`scheduled`、`scheduled_catchup`、`scheduled_site`。
- 未执行生产 Run、生产 DB、服务切换、3001 或发布操作。

## 验证

- `node --test .tests/2026-09-23/v370_worker_scheduled_recovery.test.js`：1/1 PASS
- `node --test worker/test/worker.test.js --test-name-pattern "runOnce prefers queued|runOnce executes every runnable scheduled_site|runOnce polls newly queued manual runs|runOnce lets an admitted enabled scheduler"`：90/90 PASS
- `node --test worker/test/credentialBindingAndCatchupWindow.test.js worker/test/workerUnifiedSchedulerSeam.test.js`：27/27 PASS
- `node --check worker/src/worker.js`：PASS
