# v034 BigPlayer migration/API hermetic candidate

- CandidateId: `v034-bigplayer-migration-api-hermetic-20260920-2015`
- 状态：`PENDING_QA` / manifest `SEALED_FOR_QA`
- manifest SHA256：`857AE28EEDF177EC94B70D4D13E15791B6A1E1A29B9CB61A72C2D87A12BC42AB`

## 本轮变更

- `migrations/027_bigplayer_multisite.sql`：父 FK 创建改为基于约束元数据的幂等动态 SQL。
- `server/src/db/migrate.js`：增加 migration 027 前置版本/字段 fail-fast 检查，并在每个 migration 成功后更新本轮 `applied` 集合。
- `server/src/db/repository.js`：纳入 027 scheduler schema 检查并修正 migration ledger 查询参数。
- `server/test/app.routes.test.js`：补齐 `parent_run_id`、`site_id` 兼容 fixture。
- `server/test/repository.test.js`：补齐 027 ledger mock。

## Hermetic 验证

封存副本：`.temp/hermetic-runs/v034-bigplayer-migration-api-hermetic-20260920-2015-copy`

- 文件数：486
- reparse point：0
- 工作树绝对路径引用：0
- manifest 路径逃逸：0
- 从封存副本执行全量 `001 -> 028`：PASS，退出码 0
- 从封存副本执行相关回归：`223/223 PASS`
- `git diff --check`：通过（仅有现存 CRLF 转换提示，无 whitespace error）

## 独立集成验证

- 空库全量迁移：PASS
- 删除 027/028 ledger 后幂等重跑：PASS
- 旧 schema（先到 026，再到 027/028）：PASS
- 缺少 `window_start` 的 027 前置依赖：fail-fast，错误码 `MIGRATION_027_PREREQUISITE_NOT_READY`
- schema 断言：`parent_run_id CHAR(36) NULL`、`ON DELETE SET NULL`、父站点索引、站点状态索引、checkpoint 站点窗口唯一键均 PASS

## 生产只读证据

- MariaDB `10.4.14-MariaDB`
- `po_sources.id`、`po_accounts.source_id`、`po_sync_runs.id` 均为 `char(36)`
- 生产旧 schema 缺少 `parent_run_id`、`site_id` 与 `po_source_sites`
- `po_sync_runs` 行数：15076
- `information_schema.innodb_lock_waits`：0
- 未读取或输出明文凭据/token

## 交接与冻结

- 已交接测试负责人独立验收；QA 不修改候选、不触生产。
- 项目经理状态仅报告 `PENDING_QA`。
- 生产 migration、API cutover、服务重启、sync 继续冻结，等待 QA 明确 PASS。
