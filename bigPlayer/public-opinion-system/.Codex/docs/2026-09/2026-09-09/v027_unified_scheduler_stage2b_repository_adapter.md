# 统一来源调度：阶段 2B-1 Repository Adapter

- Status: p0_datetime_fix_pass_awaiting_qa
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 变更范围

- 新增 `worker/src/schedulerRepositoryAdapter.js`。
- 新增 `worker/test/schedulerRepositoryAdapter.test.js`。
- 未修改或接入现有 Repository、Worker、dailyRunner、q1DailyJob 或计划任务。

## 数据库操作契约

- scheduled 入队先执行 `INSERT ... ON DUPLICATE KEY UPDATE`，再按 `(source_id, scheduled_at)` 唯一键读取胜出 run；不存在“先查再插”竞态。
- 重复 slot 返回既有 run ID 和稳定的 `created: false`；manual/legacy 禁止进入 scheduled slot 合并入口。
- source lease 通过 `po_source_schedule_state` 条件更新获取，成功时原子递增 `lease_epoch`。
- renew、release、finalize 均要求 source、run、owner、epoch 完整匹配且租约未过期；旧 epoch 或过期租约写入返回 false。
- finalize 使用单条多表 UPDATE，在同一 fencing 条件下更新 `po_sync_runs` 与 `po_source_schedule_state`。
- adapter 仅实现持久化操作契约，不重复 connector、授权或调度资格决策。

## 验证

实现前运行：

```bash
node --test --test-concurrency=1 worker/test/schedulerRepositoryAdapter.test.js
```

红灯结果：`0 passed, 1 failed`，错误为 `ERR_MODULE_NOT_FOUND`。

最小实现后再次运行同一命令，绿灯结果：`8 passed, 0 failed`。

测试全部使用 fake connection，仅断言 SQL、参数、重复 slot、未过期租约拒绝、过期/旧 epoch fencing 行为；未连接真实数据库。

### R1：finalize 多表更新结果判定

- 盲审发现 finalize 同时更新 run/state 两行时，`affectedRows: 2` 被严格等于 1 的旧判断误报为失败。
- 先将成功用例改为 `affectedRows: 2`，红灯结果为 `7 passed, 1 failed`；`affectedRows: 0` 的过期/旧 epoch 拒绝用例保持通过。
- 成功条件最小修正为严格等于 2，避免用宽松真值掩盖非预期影响行数。
- 测试负责人独立复审结果：`PASS`，专项回归 `8 passed, 0 failed`，本轮无缺陷退回。

### R2：MariaDB DATETIME(3) UTC 参数规范化

- 5A 真实 E2E 发现 scheduler 传入的 ISO UTC 字符串会在 MariaDB strict mode 下触发 Warning 1292 并导致 `ENQUEUE_FAILED`。
- 先将 enqueue、lease acquire/renew/release、finalize 的 fake 输入改为 ISO UTC，SQL 参数仍要求精确 `YYYY-MM-DD HH:mm:ss.SSS`；修复前 adapter/runtime 联合专项为 `8 passed, 5 failed`。
- adapter 边界新增统一时间规范化：`Date` 或带明确时区的字符串一律通过 UTC 转换，已规范化的 MariaDB DATETIME(3) 字符串原样保留，nullable window/状态时间继续保留 `null`；无明确时区的非规范字符串 fail-closed。
- scheduled slot 的 INSERT 与唯一键回读使用同一规范化值；lease acquire、renew、release、finalize 的写入和时间比较参数全部执行同一转换，旧 epoch fencing 条件未改变。
- 修复后 adapter/runtime 联合专项为 `14 passed, 0 failed`；完整调度相关零数据库回归为 `112 passed, 0 failed`。额外覆盖 `+08:00` 显式偏移、`Date` 输入和无时区歧义字符串拒绝。
- 本轮未连接数据库，未修改迁移、Worker、legacy 或种子；等待独立复核后再由项目经理派发 5A E2E 重跑。

## 未接线边界

- 本阶段没有把 adapter 接入任何 Worker 或现有 Repository。
- 未运行迁移、数据库、Worker、外部连接器或采集。
