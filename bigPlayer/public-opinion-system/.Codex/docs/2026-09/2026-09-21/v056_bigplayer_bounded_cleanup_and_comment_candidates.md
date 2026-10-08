---
status: in-progress
priority: P0
date: 2026-09-21
---

# BigPlayer 有界清理与评论候选

## 运行时收口

- 目标 run：`1c252178-604a-4381-98aa-129bdd0a9ca2`
- 触发：`manual`；模式：`incremental`；目标：境内 `bigplayer_h5` 单一来源。
- 原 run 未持久化窗口，实际帖子发布时间覆盖 `2022-07-06` 至 `2026-09-20`，不符合近一周边界。
- 仅对该 run 做 `cancelling -> cancelled` 状态修复，保留原计数、`finished_at`、`SYNC_RUN_CANCELLED` 与审计记录。

## 精确清理

- 北京时间边界：`2026-09-14 00:00:00`，SQL UTC 边界：`2026-09-13 16:00:00`。
- 事务脚本：`.temp/cleanup-cancelled-bigplayer-run.js`。
- 删除计划：`22,952` 条，计划摘要 SHA-256：`3cde11302a9448496f2be8839aa572b6dc2d33042a1d40729a15f51d594f473e`。
- 事务成功提交；计划 ID 剩余 `0`，run-content 孤儿 `0`，计划集合的分析、告警、质量、翻译和 feed 从属记录均为 `0`。
- 近七天保留 `6,615` 条，最早 `2026-09-13T08:02:24Z`，未删除边界内内容。

## 评论候选

- B 已完成 repository 只读缺口查询与全量测试 `143/143`，接口为 `listDomesticBigPlayerCommentGaps`，仅按声明数缺口或未完成 checkpoint 入队，并排除有效 lease 的 active checkpoint。
- A 隔离候选：`.temp/bigplayer-comments-a-20260921`，基于 v055，已增加缺省 effective window 的 fail-closed 门禁，定向测试 `2/2` 通过。
- A 候选的 5 个 precreated BigPlayer worker 测试夹具已补齐合法 `window_start/window_end`，开发定向测试 `5/5`，Worker 全量 `88/88`；正式 fail-closed 门禁未放宽。
- B 尚未与 A 整合，A 尚未切 live Worker，已交测试负责人做独立回归，最终验收待回执。

## 未完成门禁

- 所有 BigPlayer 定时、手动、缺口补抓必须由服务端计算并持久化最多近七天的 effective window；缺省请求不得回退全历史。
- 未创建新 BigPlayer 或 TapTap run；未切换或重启 live Worker；未发版。
