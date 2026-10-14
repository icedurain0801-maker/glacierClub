# 5A-2RRR 中断快照独立只读诊断报告

- 日期：2026-09-09
- 角色：测试负责人
- 目标：`127.0.0.1:43306/public_opinion_023_e2e_7e4ed9f5`
- 边界：只读 SQL 与 harness 审查；未释放 lease、未重跑 scheduler、未修改数据库、业务、迁移、Worker、legacy 或 3306。

## 结论

中断由 harness 断言错误引起，不是调度业务失败。合法来源首个固定 slot 已成功入队；当前存在有效 lease，不能直接重跑 first stage。

## 现场事实

| 项目 | 结果 |
|---|---|
| run | 仅一条 `5a200000-0000-4000-8000-000000000001`，状态 `queued` |
| 来源/账号 | 均为合法 source/account 对 |
| slot/trigger | `2026-09-08 18:00:00.000` / `scheduled` |
| collection window | `2026-09-07 16:00:00.000` 至 `2026-09-08 16:00:00.000` |
| eligible state | epoch `2`，有效 `lease_run_id`、`lease_owner=scheduler-e2e-5a2`、`lease_until=2026-09-08 18:05:00.000` |
| expired/capability 来源 | epoch 均为 0，且无 run、无 lease |
| 外部调用 | 当前脚本在入队断言后中止，未执行 Worker、connector 或 collector 路径；该调度 seam 只执行 lease/run SQL |

## Harness 根因

`sourceSchedulerRuntime` 将所有决策的 `runId` 标准化为 `null`（`decision.runId || decision.existingRunId || attempt?.runId || null`）。被拒绝来源因此是 `runId: null`，但 `e2e-5a2.js` 的 `assertRejectedSources()` 错误要求 `undefined`，触发：

```text
Expected values to be strictly equal: null vs undefined
```

## 安全续跑前提

1. 仅修 harness 断言，将两处 `undefined` 改为 `null`；不改业务代码或数据库。
2. 新增或启用阶段化 resume 路径，禁止再次执行初始“run=0 + 首次入队”阶段。
3. 使用已读取的完整有效 token 正常释放当前 lease：source `...0003`、run `...0001`、owner `scheduler-e2e-5a2`、epoch `2`、固定测试 `now=2026-09-08T18:00:00.000Z`。release 成功后，才可继续 duplicate 和旧 epoch fencing 验证。
4. resume 后必须先读取快照，确认仍只有该一条 run；过期与 capability 来源继续无 run；connector/collector 均为 0。
