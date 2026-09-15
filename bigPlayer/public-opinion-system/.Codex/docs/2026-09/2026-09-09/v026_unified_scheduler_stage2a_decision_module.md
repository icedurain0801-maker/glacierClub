# 统一来源调度：阶段 2A 决策模块

- Status: qa_passed
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 变更范围

- 新增 `worker/src/sourceScheduler.js`，消费已签核的 `scheduleSlots` 纯函数。
- 新增 `worker/test/sourceScheduler.test.js`。
- 未修改或接入现有 Worker、Repository、dailyRunner、q1DailyJob 或计划任务。

## 决策逻辑

- 同一决策路径覆盖境内/境外和 BigPlayer/Discord 等平台，不按平台拆分调度规则。
- 来源、游戏、社区、显式默认账号、来源/账号授权、授权有效期、连接器能力及 `active_window` 均为 fail-closed 准入条件。
- `active_window` 按北京时间判断，并支持跨零点窗口归属前一自然日。
- 调用注入的 source lease adapter 后才允许 enqueue；有效同源租约返回 `PREVIOUS_RUN_ACTIVE`。
- 幂等键固定为 `sourceId:scheduledAt`，不包含 trigger 类型。
- 单来源 lease/enqueue 异常转换为稳定 reason code，继续处理后续来源。
- 既有 manual/legacy evidence 使用数组追加保留，不按 source Map 合并。

## 验证

首次测试在模块不存在时按预期失败。实现后运行：

```bash
node --test --test-concurrency=1 worker/test/sourceScheduler.test.js
```

阶段 2A 首次实现结果：`8 passed, 0 failed`。

### R1：`active_window` 非法配置 fail-closed

- 先增加畸形 `active_window`、来源授权过期、lease 获取异常隔离三类回归测试。
- 修复前专项测试为 `10 passed, 1 failed`，畸形窗口实际无拒绝码，确认存在 fail-open。
- 新增窗口结构校验：仅 `null`/`undefined` 表示无附加窗口；非空值必须为对象或可解析为对象的 JSON，且只允许 `days`、`start`、`end` 字段。
- 空对象、数组根节点、未知字段、非法 JSON、非法星期、非法时间及不成对的 `start`/`end` 均返回 `INVALID_ACTIVE_WINDOW`。
- 合法配置但当前不在窗口仍返回 `OUTSIDE_ACTIVE_WINDOW`，跨零点窗口继续按前一自然日归属。
- 修复后专项测试结果：`11 passed, 0 failed`。
- 测试负责人独立盲审结果：`PASS`，专项回归 `11 passed, 0 failed`，本轮无缺陷退回。

## 未接线边界

- lease 与 enqueue 均为注入适配器，本阶段没有数据库实现。
- 未修改 `worker/src/worker.js` 或 `server/src/db/repository.js`。
- 未运行真实迁移、数据库、Worker、外部连接器或采集。
- source lease 的跨进程原子领取、代际 fencing 与 run 状态事务将在后续接线阶段验证。
