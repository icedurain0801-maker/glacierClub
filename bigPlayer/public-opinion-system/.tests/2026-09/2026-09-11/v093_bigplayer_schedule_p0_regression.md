# BigPlayer 调度 P0 独立回归报告

- 测试角色：测试负责人
- 日期：2026-09-11
- 范围：失败任务 60 分钟节流、统一来源调度接线、migration 023 准入合同
- 边界：仅本地代码/隔离合同；未连接生产库、未执行 migration 023、未重启 Worker、未读取或修复真实凭据、未触发真实采集、未发版或 push

## 结果

| 检查项 | 结果 |
|---|---:|
| 定向调度/迁移/Worker seam 测试 | 82/82 PASS |
| server 全量 `npm test` | 338/338 PASS |
| worker 全量 `npm test` | 183/183 PASS |
| 目标文件 `node --check`（9 个） | 9/9 PASS |
| `git diff --check` | PASS（仅 LF/CRLF 提示） |

## 验收覆盖

- 失败尝试按 `frequency=3600` 节流，不再每分钟重试；queued/running run 不重复入队。
- `enabled + schema-ready` 时统一调度独占周期来源；统一调度 enqueue 失败不回退 legacy，避免双采。
- `off` 保持既有 legacy；`shadow` 仅做准入验证、不写任务；既有成功路径保持通过。
- migration 023 缺失、列/索引/约束定义不完整、schema 查询失败均 fail-closed 并返回稳定原因。
- 调度租约、epoch/run fence、重复 slot 幂等、候选加载失败不调度、错误证据脱敏均通过合同测试。

## 缺陷分级

- P0：0 个代码合同缺陷
- P1：0 个代码合同缺陷
- P2：0 个阻断本次准入的缺陷

## 生产准入结论

**代码与隔离合同：PASS。生产外部准入：NOT_ADMITTED。**

根据事故记录，生产仍需完成以下前置条件后才能验收真实数据恢复：

1. 生产库应用并核验 migration 023 ledger/schema。
2. 重启或滚动替换旧 Worker（当前进程未加载统一调度代码）。
3. 核验境内 BigPlayer disabled 状态及境内/境外真实凭据、授权有效性。
4. 在受控窗口进行真实采集观测，确认 8/9 号数据补采结果与无重复调度。

本报告不宣称 BigPlayer 真实数据已恢复，也不关闭原事故。

## 执行命令

```text
node --test --test-concurrency=1 server/test/repositorySchedulerFrequency.test.js server/test/migrate023Runner.test.js server/test/unifiedSchedulerMigration.contract.test.js worker/test/scheduleSlots.test.js worker/test/schedulerCandidateLoader.test.js worker/test/schedulerRepositoryAdapter.test.js worker/test/sourceScheduler.test.js worker/test/sourceSchedulerRuntime.test.js worker/test/unifiedSourceSchedulerJob.test.js worker/test/workerUnifiedSchedulerSeam.test.js
server/npm test
worker/npm test
node --check <9 target files>
git diff --check -- <target files>
```
