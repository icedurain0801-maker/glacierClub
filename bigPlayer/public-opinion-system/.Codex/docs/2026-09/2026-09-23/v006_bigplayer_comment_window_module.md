---
status: candidate_pending_independent_qa
scope: bigplayer_comments_replies_window_only
---

# BigPlayer 评论与回复窗口变更记录

## 范围

- post/activity 根内容均通过 Q1 comment API 获取评论。
- 评论与回复按自身发布时间使用统一 `[publishedFrom,publishedTo)` UTC 窗口。
- 保留 `rootPlatformContentId`、`platformParentId`、`contentDepth`，一级为 1、回复为 2+。
- 保留 provider 声明总数与当前页实际正文数的分离；分页继续到末页。

## 排除范围

- 不接入入库、AI、生产 Run、生产 DB、服务切换或其他平台。

## 验证

- 纯 fixture/in-memory 覆盖 post/activity 根、回复关系、窗口边界、分页和声明/实际计数。
