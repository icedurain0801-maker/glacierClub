# 境外 BigPlayer 站点身份阻塞：隔离回归与方案变更记录

Status: local-candidate-pending-independent-qa

## 当前只读证据

2026-10-08 对指定两条 source 做独立只读事务核对；查询脚本位于仓库根 `.temp/po-closeout-20261008/overseas-shape-readonly.js`，脱敏证据为同目录 `overseas-shape-readonly-1791455518461.json`（UTC 10:31:58，脚本 SHA256 `9275dcd93d2ff446941a1d9a259408b9945a857fc493a9f469a61e67e6e03ec6`）。输出只含 ID、计数、匹配布尔值和最近 Run 时间，不含 URL、凭据或业务行。Last Night `081a16d2-5545-4afd-9c65-e04777e4540b` 为 enabled/authorized、`boardId=100017`；config 3 个已启用 `site-*`，registry 仅一个同 URL 异 ID 的 `legacy-*`。另一 `8c690d6e-12ea-4ad3-b434-d941276c4906` 同样 3/1 不匹配且缺 `boardId`。两者最近 Run 均为 2026-09-21 14:34:32。

## 已改文件与验证

- `.Codex/docs/2026-10/2026-10-08/v004_sync_migration_window.md`：补实际准入阻塞、Last Night 保留 legacy 身份的三站点对齐方案、拟议生产写集合/回退与 029→030 顺序。仅方案，未执行生产写入。
- `server/test/repository.test.js`：追加真实形状的手动准入回归：3 config 对 1 legacy 必须 `MULTISITE_SITE_REGISTRY_MISMATCH` 且零 Run；对齐后 parent+3 child 全部 `boardId=100017`、legacy 游标与历史身份保留；另一 source 缺板块 ID 仍 `BOARD_ID_REQUIRED`。单文件 149/149 通过。
- `worker/test/schedulerRepositoryAdapter.test.js`：追加同形状的定时准入回归：不匹配时事务回滚、零 child/不推进游标；对齐后 parent+3 child 精确绑定 board 与 site，legacy cursor 只用于旧站。单文件 17/17 通过。
- `worker/test/sourceScheduler.test.js`：补第二境外 source 缺 `boardId` 的入口拒绝，不调用原子排程或创建 parent/child；单文件 20/20 通过。

## 尚未完成与边界

- 本地准入候选已发测试负责人独立 QA，结论待回；尚无生产配置对齐的执行批准。
- 未改 `repository.js`、scheduler 业务逻辑，未改生产 registry/config，未重键/删除历史 Run 或 checkpoint；029/030 未因本次本地测试获生产授权。
- 只允许 Last Night 作为将来另行批准的受控真实 Run 目标；另一 source 的正确 boardId 待核，保持 NO-GO。
