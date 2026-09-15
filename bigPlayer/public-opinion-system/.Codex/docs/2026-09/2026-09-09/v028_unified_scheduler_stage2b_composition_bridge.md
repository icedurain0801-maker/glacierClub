# 统一来源调度：阶段 2B-2 Composition Bridge

- Status: p0_enqueue_error_evidence_pass_awaiting_qa
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 变更范围

- 新增 `worker/src/sourceSchedulerRuntime.js`。
- 新增 `worker/test/sourceSchedulerRuntime.test.js`。
- 未修改或接入现有 Worker、Repository、dailyRunner、q1DailyJob 或计划任务。

## 组合职责

- 由调用方注入数据库 connection、worker identity、可选租约时长和 run ID 工厂；模块不自行创建连接。
- 构造已签核的 `schedulerRepositoryAdapter`，并把 acquire、release、scheduled enqueue 适配给已签核的 `sourceScheduler`。
- 每次运行使用调用方传入的同一个 `now` 计算租约截止时间，并将 worker identity 作为 lease owner 传入 adapter。
- 不重复实现来源授权、active window、槽位计算、SQL 或 lease fencing 规则。
- 在调度结果上补齐 `runId` 与 `leaseEpoch` 证据；sourceId、scheduledAt、triggerType、reasonCode 等既有证据保持不变。
- 既有 manual/legacy evidence 按原对象、原顺序保留；单来源 adapter 异常继续由决策模块隔离，不阻断后续来源。

## 验证

实现前运行：

```bash
node --test --test-concurrency=1 worker/test/sourceSchedulerRuntime.test.js
```

红灯结果：`0 passed, 1 failed`，错误为 `ERR_MODULE_NOT_FOUND`。

最小实现后再次运行同一命令，绿灯结果：`3 passed, 0 failed`。

测试使用 fake connection，覆盖正常入队、重复 slot、lease epoch 证据、单来源 adapter 异常隔离及 manual/legacy evidence 保留；未连接真实数据库。

测试负责人独立盲审结果：`PASS`；bridge 专项 `3 passed, 0 failed`，2A、2B-1、2B-2 联合回归 `22 passed, 0 failed`，本轮无缺陷退回。

### R1：ENQUEUE_FAILED 脱敏数据库错误证据

- runtime 在 repository enqueue 异常时记录受限的数据库错误 code/message，再把异常重新抛给既有 decision 层，保持单来源失败隔离与后续来源继续处理不变。
- 仅当稳定 reason code 为 `ENQUEUE_FAILED` 时，将 `errorCode`、`errorMessage` 附加到对应 decision/evidence；不附带 SQL、连接对象或 error stack。
- 错误 code 只允许大写字母、数字与下划线，其他值降级为 `DATABASE_ERROR`；消息清理控制字符、凭据键值和连接 URI，并限制为 512 字符。
- 红灯确认原 runtime decision 缺少错误字段；修复后新增用例验证原始 MariaDB code 保留、凭据和连接信息被移除、第二来源仍正常入队。
- adapter/runtime 联合专项为 `14 passed, 0 failed`；完整调度相关零数据库回归为 `112 passed, 0 failed`。子代理审查发现非 URI driver 错误仍可能暴露连接信息后，已补齐 Access denied、Unknown database、DNS、超时及主机端口文本的脱敏断言。

## 未接线边界

- 本阶段没有修改 `worker/src/worker.js` 或任何现有 Repository。
- 未运行迁移、数据库、Worker、外部连接器或采集。
- fake connection 通过不代表真实数据库事务和并发行为已验证，真实 DB 验证仍待后续阶段。
