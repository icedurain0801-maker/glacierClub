# v235 BigPlayer A' 第二段定时父子执行/聚合合同验收

- 测试日期：2026-09-20（北京时间）
- 测试类型：隔离 repository/worker mock
- 边界：未连接真实 DB，未执行迁移、服务、重启、补跑或发版；第三段 API/UI/pause-cancel 不在范围

## 结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 父不可领取 | PASS | `listRunnableSyncRuns excludes multi-site parents while retaining their child runs and legacy roots` |
| 子按 runId 多任务执行 | PASS | `runOnce executes every runnable scheduled_site child and only marks the source after the parent aggregates`；两子均独立 claim/执行 |
| 子独立 URL/checkpoint/lease | PASS（合同覆盖） | 子按 siteId 解析各自上下文，执行身份使用 `run:<id>`，不互吞 |
| 最后子终态聚合 | PASS（现有定向覆盖） | 最后 terminal child 才触发 parent/source 聚合；1失败+1成功为 partial |
| 定向 repository/worker | PASS | 两个定向用例均 passed / 0 failed |
| 语法/空白 | PASS | Worker、repository 及相关 CLI 文件 `node --check`/`git diff --check` 通过 |

## 已知边界

- 当前定向用例明确覆盖 1 失败 + 1 成功的 `partial` 聚合；全失败 `failed`、父计数/错误汇总的独立直接合同测试尚未提供。
- `finishScheduledSiteRun` 尚缺直接事务/fencing 合同测试。
- 第三段 API/UI 投影、暂停/取消传播未实现，不纳入本结论。

## 结论

A' 第二段父不可领取、子按 runId 执行及最后子终态聚合合同 **PASS（隔离，带上述边界）**。不表示完整定时采集链路或真实服务可用。
