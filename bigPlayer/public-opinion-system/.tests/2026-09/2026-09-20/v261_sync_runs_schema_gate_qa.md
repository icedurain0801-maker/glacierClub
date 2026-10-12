# sync-runs schema 门禁报告

- 日期：2026-09-20
- 结论：**FAIL，禁止切 API/发起 sync**

## 证据

- `migrations/027_bigplayer_multisite.sql` 声明了 `parent_run_id`，但 `server/test/app.routes.test.js` 的 bootstrap 只手工创建 `po_sync_runs`，没有正式执行该迁移，也没有 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS parent_run_id`。
- 完整回归仍为 `67/69`；列表/详情两个定向用例因 `r.parent_run_id` 缺失返回 500。
- 生产库只读 `information_schema.COLUMNS` 查询：`po_sync_runs.parent_run_id` 不存在；没有可读的 `schema_migrations` 版本记录。

## 判定

不能用业务层吞掉缺列。当前测试库和生产库都未证明 schema 已完成 027 迁移，因此旧记录 `parent_run_id=null`、父子 run 保持值、列表/详情不 500 的门禁均未通过。

需先由开发/迁移流程正式补齐 schema 并完成 69/69 回归；生产库不得由 QA 直接改写。完成前继续冻结 API 切换和所有 sync。
