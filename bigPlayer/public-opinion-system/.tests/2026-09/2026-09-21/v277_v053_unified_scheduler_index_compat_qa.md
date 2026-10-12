# v053 Unified Scheduler 多站点索引兼容 QA

- 测试日期：2026-09-21
- 测试角色：测试负责人
- 候选：`.temp/candidates/v053-unified-scheduler-index-compat-20260921-qa/release`
- 测试范围：027/028 多站点 checkpoint 索引的 scheduler readiness 兼容性
- 边界：未切换 4320、未执行 migration、未发起 sync、未触碰 TapTap、Worker、3001 或授权链路。

## 结论

**PASS**

## 工件完整性

- 使用 `scripts/windows-services/verify-api-release.js` 完整验证候选：`PASS: verified API release (393 files)`。
- `package-release-manifest.json` SHA-256：`ED26E5FF4E21D852E187EB3E70B68AF33EFBEBCE83BF5D287244C3CAEC8A2F90`。
- 候选 `server/src/db/repository.js` SHA-256：`D608C1F12DD894697CF7820702542D29634855ACB21E17A1955B3E27C517B65C`。
- 候选文件与本地用于定向回归的 `server/src/db/repository.js` 哈希一致，确认回归运行覆盖候选代码。

## 定向回归

- 执行：`node --test server/test/repository.test.js`
- 结果：141/141 PASS。
- 覆盖确认：
  - 027 已应用且 legacy `po_sync_checkpoints_window_uk` 缺失时，仅 site-aware `po_sync_checkpoints_site_window_uk` 作为门禁，测试通过。
  - 027 未应用时，仅 legacy 索引作为门禁，测试通过。
  - site-aware/legacy 索引缺失以及其他 readiness 缺口仍返回 `UNIFIED_SCHEDULER_SCHEMA_NOT_READY`，保持 fail-closed。
  - 027 已应用时，028 仍为必需 migration，缺失时保持 fail-closed。

## 只读生产 Schema 证据

通过候选自身 `assertUnifiedSchedulerSchemaReady()` 后，只读取 `information_schema.statistics` 与 `po_schema_migrations`：

- candidate readiness：`PASS`。
- 唯一可用 checkpoint 索引：`po_sync_checkpoints_site_window_uk`。
- 精确列序：`account_id,site_id,task_kind,task_key,sync_scope,root_platform_content_id,window_start,window_end`。
- 已应用 migration：`023_unified_source_scheduling.sql`、`025_worker_scan_leases.sql`、`026_scheduler_runtime_schema_reconciliation.sql`、`027_bigplayer_multisite.sql`、`028_bigplayer_scheduled_site_runs.sql`。

该结果满足 v053 的 site-aware predicate；候选不会在 027/028 已应用的 schema 上再要求 legacy `po_sync_checkpoints_window_uk`。本次没有调用入队、run、sync 或任何 DML/DDL 路径。

## 交接

v053 scheduler readiness 索引兼容修复通过独立 QA，可进入项目经理后续评审；后续如需执行实际同步，仍须另行获得单次同步授权与验收门禁。
