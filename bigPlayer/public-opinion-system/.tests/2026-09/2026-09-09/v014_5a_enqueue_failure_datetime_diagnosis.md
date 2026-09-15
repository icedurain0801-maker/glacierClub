# 5A ENQUEUE_FAILED DATETIME 参数独立只读诊断报告

- 日期：2026-09-09
- 角色：测试负责人
- 目标：`127.0.0.1:43306/public_opinion_023_e2e_7e4ed9f5`
- 边界：只读 SQL、`EXPLAIN INSERT` 和代码审查；未重跑 scheduler，未修改数据库、业务、迁移、Worker、legacy 或 3306。

## 结论

**FAIL，退回开发负责人。** adapter 将调度器生成的 ISO UTC 字符串直接绑定到 MariaDB `DATETIME(3)` 字段；目标 session 启用 `STRICT_TRANS_TABLES`，该格式产生 1292 截断日期告警并会在真实 INSERT 作为严格模式错误，导致 `ENQUEUE_FAILED`。

## 证据

| 项目 | 结果 |
|---|---|
| job 结果 | 合法来源返回 `failed` / `ENQUEUE_FAILED` |
| run 写入 | `po_sync_runs=0` |
| lease 状态 | 合法来源 epoch=1，但 run/owner/until 均已清空，说明 enqueue 异常后释放成功 |
| schema | `scheduled_at`、`window_start`、`window_end` 为 `DATETIME(3)`；adapter 插入列与 schema 一致 |
| SQL mode | `STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION` |
| 格式复现 | `CAST('2026-09-08T18:00:00.000Z' AS DATETIME)` 返回值但产生 `Warning 1292 Truncated incorrect datetime value`；window 参数同样告警 |
| 无写验证 | 原 adapter INSERT 的 `EXPLAIN INSERT` 成功且 run 计数保持 0；EXPLAIN 不执行类型转换，不能替代真实 INSERT 诊断 |

`scheduleSlots` 返回的 `dueSlotAt`、`windowStartAt`、`windowEndAt` 都是 `YYYY-MM-DDTHH:mm:ss.sssZ`；`schedulerRepositoryAdapter.enqueueScheduled()` 将三者原样传给 INSERT。因此字段类型与参数格式的边界不兼容是当前唯一可由只读证据支持的 adapter 根因。

## 原始错误可观测性

原始 mysql2 error 未记录：`scheduleSources()` 捕获 enqueue 异常后只返回 `ENQUEUE_FAILED`，E2E 日志也只记录断言失败。隔离 MariaDB error log 和 `performance_schema.events_statements_history_long` 不含该客户端失败语句。不得在当前诊断范围内以真实 INSERT 重现。

## 最小修复范围

仅修改 `worker/src/schedulerRepositoryAdapter.js` 的写入边界：将 `scheduledAt`、`windowStartAt`、`windowEndAt` 的有效 ISO UTC 输入规范化为无 `T/Z` 的 UTC `YYYY-MM-DD HH:mm:ss.SSS` 参数，再传入 `DATETIME(3)`。补充 fake connection 参数契约，覆盖 slot 与窗口均已规范化；不改 schema、023、调度业务、Worker、legacy 或数据库。

建议在受控 E2E harness 记录（脱敏的）adapter 错误码/消息，避免下次 `ENQUEUE_FAILED` 丢失数据库原始错误。
