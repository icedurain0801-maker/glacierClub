---
last_updated: 2026-09-10
status: implemented_and_verified
scope: p0-analysis-claim-isolation
---

# v056 P0 分析任务 claim 隔离修复

## 问题

`claimAnalysisJobs` 原先仅通过 `po_contents` 筛选候选，不检查来源启用状态，也无法识别受控 manual owner。结果是来源被禁用后，常驻 Worker 仍可认领既有分析任务；manual 租约过期时也可能被其他 Worker 接管。

稳定原因码：`P0_CROSS_WORKER_ANALYSIS_LEASE_CONFLICT`。

## 修复

1. analysis claim 的 UPDATE 候选新增 `po_sources` 联接；普通 Worker 默认仅认领 `s.enabled=1` 的来源。
2. 普通 Worker 不接管带完整 manual 审计范围的 `q1-daily:<pid>:<source>:<date>:<claim-uuid>` 租约。
3. 新增 `allowDisabledSource` 窄口径：只有同时提供 sourceId、非空 contentIds、publishedFrom、publishedTo、businessDate，且 owner 中的 source/date 与这些精确范围一致时才允许绕过 enabled 门禁；否则抛出 `ANALYSIS_CLAIM_SCOPE_REQUIRED`。
4. `Q1AnalysisRunner` 为 manual run 生成含 PID、source 和 business date 的 owner，并把精确范围传到仓储层。
5. `runQ1Daily` 仅在 `triggerType='manual'` 时启用该窄口径；scheduled 路径保持普通门禁。

本修复没有 schema 迁移，不删除或迁移已有任务，也不改变 enabled source 的正常 backlog 消费路径。

## 修改文件

- `server/src/db/repository.js`
- `server/test/repository.test.js`
- `worker/src/q1DailyAnalysisRunner.js`
- `worker/src/q1DailyJob.js`
- `worker/test/q1DailyAnalysisRunner.test.js`
- `worker/test/q1DailyJob.test.js`

## 验证

| 命令 | 结果 |
|---|---|
| `node --check src/db/repository.js` | PASS |
| `node --test --test-concurrency=1 test/repository.test.js` | PASS，84/84 |
| `node --check src/q1DailyAnalysisRunner.js` | PASS |
| `node --check src/q1DailyJob.js` | PASS |
| `node --test test/q1DailyAnalysisRunner.test.js test/q1DailyJob.test.js test/worker.test.js` | PASS，90/90 |
| `git diff --check -- <本次六个代码/测试文件>` | PASS |

合计通过 174 项测试。验证不连接真实数据库，不启动采集或 Worker。

## 运行状态与剩余风险

- 目标 source 继续保持 disabled。
- 未重跑采集，未重启或停止 PID 12800，未改动既有 482 条数据。
- manual 绕过依赖调用方维持精确 source/content/date scope；仓储层会拒绝缺失任一范围字段或 owner 格式不合规的调用。
- manual owner 租约不会被普通 Worker 接管。若 manual 进程异常退出，需要由后续受控 manual run 接续或由运维明确处置，避免自动跨 Worker 恢复破坏审计边界。
- 未提交、push 或发版。
