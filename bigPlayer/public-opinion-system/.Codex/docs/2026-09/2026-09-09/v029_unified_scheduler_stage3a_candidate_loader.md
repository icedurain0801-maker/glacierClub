# 统一来源调度：阶段 3A Candidate Loader

- Status: p0_region_field_fix_pass_awaiting_qa
- Priority: P0
- Owner: 开发负责人
- Updated: 2026-09-09

## 变更范围

- 新增 `worker/src/schedulerCandidateLoader.js`。
- 新增 `worker/test/schedulerCandidateLoader.test.js`。
- 未修改或接入现有 Worker、Repository、dailyRunner、q1DailyJob 或计划任务。

## 读取与映射契约

- connection 必须由调用方注入；loader 不创建数据库连接，不发起采集。
- 每次 load 仅执行一条固定、确定性查询，按 source ID 排序。
- 游戏、社区和账号均使用 LEFT JOIN，避免因关联缺失而提前丢弃来源证据。
- 账号只通过 `a.id = s.default_account_id` 关联，不回退查找最新或 enabled account。
- 映射保留 runtime 所需的 source、account、region、community、platform、enabled、授权/到期、active window、frequency、effective time、schedule version 字段。
- NULL 字段保持 NULL；缺少默认账号时来源仍返回而 accounts 为空；账号归属不一致时保留实际账号字段，交由 2A runtime fail-closed 拒绝。
- SQL 无动态值拼接，显式传入空参数数组。

## 验证

实现前运行：

```bash
node --test --test-concurrency=1 worker/test/schedulerCandidateLoader.test.js
```

红灯结果：`0 passed, 1 failed`，错误为 `ERR_MODULE_NOT_FOUND`。

最小实现后再次运行同一命令，绿灯结果：`4 passed, 0 failed`。

测试全部使用 fake connection，精确检查单查询、参数、default account join、空集、NULL 和关联不一致行为；未连接真实数据库。

测试负责人独立盲审结果：`PASS`；loader 专项 `4 passed, 0 failed`，2A 至 3A 联合回归 `26 passed, 0 failed`，本轮无缺陷退回。

### R2：真实 SQL 的区域字段归属修复

- 5A-2R 在 MariaDB 候选加载阶段发现 `Unknown column 's.region_code'`；独立诊断确认 `region_code` 属于 `po_games`，不属于 `po_sources`。
- 先在 loader fake connection 测试中增加 SQL 契约：必须使用 `g.region_code AS region_code`，并禁止 `s.region_code`。修复前专项结果为 `3 passed, 1 failed`，红灯精确命中字段归属。
- 生产代码仅将 SELECT 字段由 `s.region_code` 改为 `g.region_code AS region_code`；候选映射仍读取稳定别名 `row.region_code`，未改变其他查询、join 或映射逻辑。
- 修复后 loader 专项结果为 `4 passed, 0 failed`；2A 至 3A 联合零数据库回归结果为 `26 passed, 0 failed`。
- 本轮未连接数据库，未修改迁移、Worker、legacy 或任何种子数据；等待测试负责人独立复核后再由项目经理派发 5A-2 重跑。

## 未接线边界

- 本阶段没有修改 `worker/src/worker.js` 或任何现有 Repository。
- 未运行迁移、数据库、Worker、外部连接器或采集。
- fake connection 通过不代表真实数据库字段兼容性、事务或 E2E 已验证。
