---
status: candidate_pending_independent_qa
scope: bigplayer_board_feed_only
---

# BigPlayer 版块与 Feed 模块变更记录

## 范围

- 版块发现优先调用 `/api/club/v2/auth/board`，失败后回退 `/api/club/v1/auth/board`。
- 版块/子栏目生成完整独立 feed scope；fixture 验证 23 个 feed。
- `post/list`、`activity/list` 使用独立 endpoint；activity 归一化为 `contentType=activity`。
- 沿用现有 `[publishedFrom,publishedTo)` UTC 窗口、分页游标和不完整边界状态。

## 排除范围

- 不接入评论、入库、AI、生产 Run 或其他平台。
- 不恢复旧 BigPlayer HTML 采集器。

## 验证

- 纯 fixture/in-memory：V2→V1、23 feed、activity 类型、半开窗口和分页均覆盖。
