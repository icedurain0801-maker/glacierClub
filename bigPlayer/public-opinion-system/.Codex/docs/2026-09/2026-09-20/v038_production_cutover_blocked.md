# v038 生产执行停点

- CandidateId：`v038-bigplayer-migration-api-hermetic-20260920-2230`
- 结果：`STOPPED_AT_API_BUILD`
- manifest SHA256：`2CE660E7DE6EAB8A3C23BD5224896F98DE96FAF5D63DB6CD9F81C92C8CE4ABA8`

## 已完成

- 生产迁移 027/028：成功；重复执行确认 `all migrations up to date`。
- 生产 ledger：`027_bigplayer_multisite.sql`、`028_bigplayer_scheduled_site_runs.sql` 各 1 行。
- schema：`po_sync_runs_parent_fk`，`ON DELETE SET NULL`；MariaDB `10.4.14-MariaDB`；lock waits `0`。
- 迁移前/后只读证据：`.temp/production-v038-pre-schema.json`、`.temp/production-v038-post-schema.json`。

## 停点

`prepare-services.ps1 -Mode Apply` 首次按包装器自覆盖保护停止；改用同 SHA 独立 WinSW 副本后，API release 构建再次停止：v038 候选缺少 `server/package.json`。

## 当前状态

- API XML 仍指向旧 release：`C:\ProgramData\PublicOpinion\releases\release-31135-668-15061\server\src\app.js`。
- 旧 release 保留，v038 API runtime 未创建。
- API health：HTTP 200。
- 未重启 API/Worker，未执行 API cutover，未执行 sync，未触碰 TapTap。

按门禁停止，不补文件、不修改候选、不回滚或扩大范围，等待项目经理重新派发修订候选。
