# v001：worker 社区同步并发提速

## 变更

- B1 数据路径保持不变：仍由现有 worker 使用原 source/account、`upsertContentPage` 幂等落库和现有 checkpoint。
- Q1 feed 抓取由串行循环改为有界并发，新增 `SYNC_FEED_CONCURRENCY`，默认 1（串行）。
  - 说明：默认 4 时在本环境出现跨事务加锁顺序不一致，`upsertContentPage` 对同一 `po_sync_runs` 行的 `FOR UPDATE` 与各自 `po_contents` 行锁互相等待，触发 `ER_LOCK_WAIT_TIMEOUT` / `ER_LOCK_DEADLOCK`。故默认回退串行，保留并发代码路径，可按环境显式调高。
- Q1 回复钻取由串行循环改为有界并发，新增 `SYNC_REPLY_CONCURRENCY`；未配置时继承 `SYNC_COMMENT_CONCURRENCY`。
- daily 评论并发默认值从 4 提升至 8。
- daily 评论页预算默认值从 3 提升至 5；仍可用 `DAILY_COMMENT_PAGE_BUDGET` 覆盖。

## 兼容与安全

- 保留 feed 独立 checkpoint、失败重试、截止时间、人工验证错误处理和历史评论补偿分流。
- 并发写入仍经过现有 repository 事务与 sync-run lease 校验，不改变去重、计数和展示口径。
- 不执行数据库迁移，不删除 checkpoint，不输出凭据或供应商原始响应。

## 验证

- `node --check worker/src/worker.js`
- `node --check worker/src/dailyRunner.js`
- `node --test worker/test/worker.test.js`：34 项全部通过。
- `git diff --check`：通过。

## 实测（串行 feed + 评论/回复并发）

- 昨日窗口 `[2026-08-17 16:00Z, 2026-08-18 16:00Z)`（北京时间前一自然日）实跑一次 daily：
  - sync run `ed234d0d`：`completed_authorized_scope`，`error_code` 为空，**无任何 `ER_LOCK_WAIT_TIMEOUT`/`ER_LOCK_DEADLOCK`**；耗时约 2887s（≈48 分钟），落在 1 小时上限内。
  - runner 退出码 0，`collectionStatus: collection_completed`，来源 `completed_authorized_scope`；`contents`=post 180 / comment 121；分析 `analyzed 42`（light 完成 301、deep failed 65 属分析阶段问题，与采集完整性无关）。
- 对照：并发 feed（`SYNC_FEED_CONCURRENCY=4`）的 `6950c4db` 撞满 1 小时（3603s）后仍 `partial/PARTIAL_SYNC`，`error_message` 为成片 feed 锁等待/死锁。
- 结论：回退串行 feed 后，昨日全量采集**约 48 分钟完成**且不再死锁；评论/回复并发保留，速度较早期纯串行（曾多次撞 60 分钟超时）已改善并可稳定收敛。

## 运维回退

可将 `SYNC_FEED_CONCURRENCY=1`、`SYNC_REPLY_CONCURRENCY=1`、`SYNC_COMMENT_CONCURRENCY=4`、`DAILY_COMMENT_PAGE_BUDGET=3` 恢复为低并发/旧预算行为，无需改代码。当前默认即 `SYNC_FEED_CONCURRENCY=1`（串行 feed），后续上调 feed 并发前需先解决写库锁的顺序/重试问题。
