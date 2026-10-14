# v370 定时调度抓取不到根因与修复

## 根因

1. `worker/src/worker.js` 的 `runOnce()` 在统一调度入队前读取 runnable 队列；旧逻辑不重读，且动态轮询白名单遗漏 `scheduled` / `scheduled_catchup`，导致新建父 Run 长期停留在 `queued`。
2. `worker/src/schedulerRepositoryAdapter.js` 的 fallback `acquireLease()` 原先在抢租约时同时推进 `last_scheduled_at` / `next_scheduled_at`。后续 enqueue 失败只释放租约，游标已前进，下一槽被判定为非 due，形成永久漏槽。
3. queued/running/lease 拒绝此前统一返回 `acquired:false`；现在通过只读判因返回并记录 `PREVIOUS_RUN_ACTIVE`、`LEASE_ACTIVE` 或 `SCHEDULE_STATE_UNAVAILABLE`，且不推进游标。
4. BigPlayer 配置存在 3 个 `siteUrls` 而 registry 只有 1 个 legacy 站点时，准入明确 fail-closed 为 `MULTISITE_SITE_REGISTRY_MISMATCH`，不静默只抓一个站点。

## 生产边界证据

只读证据显示常驻旧 release 的 poll 条件仅允许 `manual`，未包含本地 `scheduled/scheduled_site` 修复；081a/8c 两个 BigPlayer 来源各配置 3 个 `siteUrls`，`po_source_sites` 各仅 1 个 legacy registry。该状态证明生产风险边界，未执行生产修复或服务切换；旧 release 的 `WORKER_RELEASE_STALE` admission 检查另行安排。

## 验证

- `node --test .tests/2026-09-23/v370_scheduler_admission_repro.test.js worker/test/sourceSchedulerRuntime.test.js worker/test/schedulerRepositoryAdapter.test.js`：24/24 PASS
- `node --test .tests/2026-09-23/v370_worker_scheduled_recovery.test.js`：1/1 PASS
- Worker 定向回归：90/90 PASS；账户/时间窗与 scheduler seam：27/27 PASS
- `node --check worker/src/worker.js`：PASS
