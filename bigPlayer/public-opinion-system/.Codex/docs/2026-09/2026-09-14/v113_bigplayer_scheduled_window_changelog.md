---
date: 2026-09-14
status: completed
scope: bigplayer-scheduled-bounded-window
owner: 开发负责人
---

# v113 BigPlayer 定时有界窗口

## 变更

- BigPlayer 3600 秒 scheduled/scheduled_catchup 入队时，若调度槽没有自然日窗口，补充 `[now-7d, now)` UTC 固定窗口。
- Discord 与其他平台继续使用原有 connector-defined window，不改变其行为。

## 验证

- `sourceScheduler.test.js` 覆盖 BigPlayer 七天窗口长度和非 BigPlayer 不变。

## 范围限制

- 未改变频率、allowlist、checkpoint 或回溯删除语义；不触发全量回溯。
