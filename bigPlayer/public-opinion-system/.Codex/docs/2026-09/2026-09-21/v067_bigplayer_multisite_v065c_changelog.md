---
status: candidate_landed_qa_pending
date: 2026-09-21
candidate: v065c-bigplayer-multisite-execution-chain-20260921
manifest_sha256: E213548B11D73E466EC09AA83B9870537260F241ED0617E2DCE7B44079062EBE
---

# BigPlayer 多站点 v065c 变更记录

## 边界

- 仅按 v065c 候选正式差异串行落盘。
- 不执行 migration 029、真实 Run、数据库写入、API/服务切换、发布或 push。
- 候选根 `tests/v065b_multisite_chain.test.js` 按项目规范迁移到日期化 `.tests` 路径。

## 文件落盘状态

| 序号 | 正式路径 | 状态 |
|---:|---|---|
| 1 | `../admin/PublicOpinion/assets/collection-runs.js` | applied |
| 2 | `migrations/029_bigplayer_site_run_evidence.sql` | applied |
| 3 | `server/src/app.js` | applied |
| 4 | `server/src/connectors/bigPlayerH5Connector.js` | applied |
| 5 | `server/src/db/repository.js` | applied |
| 6 | `server/test/repository.test.js` | applied |
| 7 | `.tests/2026-09/2026-09-21/v307_multisite_chain.test.js` | applied |
| 8 | `worker/src/schedulerRepositoryAdapter.js` | applied |
| 9 | `worker/src/sourceScheduler.js` | applied |
| 10 | `worker/src/worker.js` | applied |
| 11 | `worker/test/schedulerRepositoryAdapter.test.js` | applied |
| 12 | `worker/test/sourceScheduler.test.js` | applied |
| 13 | `worker/test/worker.test.js` | applied |
| 14 | `worker/test/workerUnifiedSchedulerSeam.test.js` | applied |

## 验证

- 正式路径专项：`196/196 PASS`。
- Worker 全量：`257/258 PASS`；唯一失败为既有 `schedulerCandidateLoader.test.js` 断言差异（`config: undefined`），独立复跑为 `4/5`，与候选前正式基线一致。
- 迁移 029 与新证据列准入用例覆盖：缺迁移、缺任一字段均 fail closed。
- `node --check`：7 个变更 JS 文件全部通过。
- `git diff --check`：通过。
- 未执行 migration 029、真实 Run、数据库写入、API/服务切换、发布或 push。
