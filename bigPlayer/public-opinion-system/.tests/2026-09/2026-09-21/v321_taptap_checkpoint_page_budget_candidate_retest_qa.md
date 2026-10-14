---
status: passed_candidate_only
priority: P1
date: 2026-09-21
role: test-owner
topic: taptap-checkpoint-page-budget-candidate-retest
---

# TapTap v320 证据候选独立复测报告

## 结论

**证据候选子项 PASS；不得据此宣称真实 TapTap 业务恢复。**

v320 候选的 hermetic fixture、lease/identity 隔离、连接器回归和 `127.0.0.1:3000` 只读 mock 浏览器验收均通过。候选明确 `businessLogicChanges=0`，Worker 全量结果为 `267/268 PASS`，剩余 1 项为已登记基线失败，`newFailures=0`。本结论只覆盖候选证据包，不覆盖生产 DB、真实账号、真实 run 或境外/境内实际采集数据。

## 候选完整性

- 候选：`.temp/candidates/v320-taptap-checkpoint-page-budget-evidence-20260921/`
- manifest：650 文件，SHA256 `C3AA311E0903670818C704073A189A33FB0F49662872EB5D23FDA5BF6998427B`
- `READY.json`：`ready_for_test`
- `provenance.json`：overlay 与 boundary 绑定，`businessLogicChanges=0`
- `verify-candidate.ps1`：独立执行 exit `0`
- 候选报告：`.tests/2026-09/2026-09-21/v320_taptap_checkpoint_page_budget_evidence.md`

候选验证汇总：fixture `8/8 PASS`、shared cursor `6/6 PASS`、connector `19/19 PASS`、Worker `267/268 PASS`（1 个已登记基线失败）、`newFailures=0`；local mock GET API `200`、GET page `200`、POST `405`，验证后 mock 已关闭。

## 独立重跑结果

| 项目 | 命令/范围 | 结果 |
|---|---|---|
| 页预算与 21 页续跑 fixture | `worker/test/taptapCheckpointPageBudget.fixture.test.js` | `5/5 PASS`（含第 20 页 cursor、第 21 页续跑、空/非法/重复 cursor） |
| lease 与 identity 隔离 fixture | `server/test/taptapCheckpointLease.fixture.test.js` | `2/2 PASS` |
| mock 合同 | `qa/taptap-checkpoint-mock.test.js` | `1/1 PASS` |
| TapTap connector | `server/test/taptapConnector.test.js` | `19/19 PASS` |

## 3000 浏览器只读验收

使用新建标签访问：`http://127.0.0.1:3000/admin/PublicOpinion/collection-runs.html`

- 页面 GET：`200`
- mock API GET：`200`
- 非 GET 写请求：`405`，未产生写入
- 页面显示 `Run status=partial`
- checkpoint cursor：`{"version":1,"accountIdx":0,"from":200}`
- retry 首请求 cursor 与 checkpoint 一致
- `Duplicate writes=0`
- 浏览器重载后上述 cursor 和重复计数保持不变
- 控制台 `warn/error`：空
- 3000 mock 验后已终止

## 安全边界核对

- 未写生产 DB，未创建真实 run，未发布/push。
- 未访问或占用 `3001`；检测到外部监听 `PID 34656`，保持原状。
- 未触碰 `PID 32020`、正式工作树或正式服务路径。

## 关闭条件与剩余风险

本轮可关闭“v320 证据候选复测”项。仍需由项目经理/开发负责人另行安排真实业务验收，至少覆盖已授权账号的实际采集、数据入库幂等和生产运行状态；本报告不提供这些事项的通过结论。
