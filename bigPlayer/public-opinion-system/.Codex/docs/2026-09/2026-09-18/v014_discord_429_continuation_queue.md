# v014 Discord 429 续队列语义

## 范围

仅处理 Discord `owned_content/comments` 运行中的 429 续队列行为；未修改 BigPlayer、TapTap、provider 调用、部署或数据库结构。

## 变更

- `worker/src/worker.js`：Discord 评论或回复请求收到 `RATE_LIMITED` 后，停止同一 run 的后续评论与回复派发，并将错误交由运行级续队列路径处理。
- `server/src/db/repository.js`：新增受 lease owner/epoch fencing 的 `deferSyncRun`。它将 throttled run 置回 `queued`、写入 provider `Retry-After` 到 `po_sync_runs.next_retry_at`、释放 lease，并保持 `finished_at` 为 `NULL`。
- 既有 runnable/claim 查询在 `next_retry_at` 前拒绝发现和领取，到期后才允许一次原子 claim；最后成功 checkpoint cursor 不变。
- Discord 评论/回复在此场景下固定串行派发，避免并发 worker 在首个 429 被观察前启动额外请求。

## 离线验证

- `node --test worker/test/worker.test.js`：81 passed，0 failed。
- `node --test server/test/repository.test.js`：131 passed，0 failed。
- 新增用例覆盖：两个候选评论中首个 429 后，第二个评论不调用，回复阶段不派发；checkpoint 保留安全 cursor，run 以 `queued` 写入 `RATE_LIMITED` 与 `nextRetryAt`。
- repository 定向用例覆盖：仅持有当前 lease 的 running run 可被 defer，写入后无终态时间戳、lease 被释放；既有 runnable/claim 用例覆盖冷却时间前不可见、到期后才可 claim 的 UTC 条件。

## 边界

- 未创建或重试真实 run，未调用 Discord provider。
- 未启动服务、未部署、未 push。
