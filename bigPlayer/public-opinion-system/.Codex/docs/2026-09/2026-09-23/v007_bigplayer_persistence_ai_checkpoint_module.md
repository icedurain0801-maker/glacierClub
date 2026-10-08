---
status: candidate_pending_independent_qa
scope: bigplayer_idempotent_store_async_ai_checkpoint_only
---

# BigPlayer 幂等入库、异步 AI 与 checkpoint 变更记录

## 范围

- 先由 worker 归一化并提交 `upsertContentPage`，保留 raw/normalized 字段。
- 仅变更内容创建 AI job，unchanged 内容不重复 enqueue。
- AI 失败保留内容，analysis job 标记 `retryable` 并记录稳定错误码。
- 已完成 scope 重启时不重复 claim/fetch；scope identity 保持 posts/feed/comments 隔离。

## 排除范围

- 不接入生产 DB、真实 Run、服务切换或其他平台。

## 验证

- 纯内存 fixture 覆盖 upsert 顺序、changed/unchanged 去重、AI retryable 和 completed checkpoint 恢复。
