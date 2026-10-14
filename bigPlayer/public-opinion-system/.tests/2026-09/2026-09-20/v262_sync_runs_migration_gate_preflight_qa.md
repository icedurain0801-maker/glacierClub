# sync-runs 迁移门禁前置报告

- 日期：2026-09-20
- 结论：**BLOCKED，禁止生产迁移和 sync**

## 前置检查

- 当前 `PublicOpinionApi.xml` 仍指向 `release-20260920-1621-v027`，旧稳定 API 尚未回滚。
- API、4311、Worker 均 Running；4311 health `200`，但这不能替代 API 回滚门禁。
- 生产库只读 `information_schema` 仍查不到 `po_sync_runs.parent_run_id`。
- `migrations/027_bigplayer_multisite.sql` 虽包含 `ADD COLUMN IF NOT EXISTS parent_run_id`，但生产库未应用；测试 bootstrap 也未正式执行该迁移。

## 判定

迁移门禁要求“先回滚稳定 API，再验证正式迁移与全量回归”。当前 API 回滚未完成，生产 schema 仍缺列，故暂停后续迁移、API 切换和所有 sync。QA 不直接修改生产库。
