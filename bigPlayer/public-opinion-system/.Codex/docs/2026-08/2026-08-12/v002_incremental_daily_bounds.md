# v002：每日采集增量与限时边界

## 变更

- daily runner 默认使用 15 分钟总墙钟上限（`DAILY_RUN_TIMEOUT_MS=900000`）。
- 采集和分析阶段共享 deadline；到期后停止启动新的分页、评论父帖、回复或分析批次，并保留已有 checkpoint。
- Q1 feed 继续使用 feed 独立 checkpoint；不再要求 daily 任务从头扫描全部历史分页。
- daily runner 不再强制刷新所有已完成评论父帖，默认只处理待处理/失败/过期 checkpoint。
- 历史评论刷新增加父帖数量和每个父帖页数预算：`DAILY_COMMENT_PARENT_LIMIT`、`DAILY_COMMENT_PAGE_BUDGET`。
- 分析补偿批次增加 `DAILY_ANALYSIS_MAX_BATCHES` 上限，范围外历史积压仍不参与 daily 分析。
- `listSyncParents` 支持数据库层 `LIMIT`，避免先取回全部候选父帖。

## 运行状态口径

`discovered/fetched` 表示接口扫描或同步发现量，不表示某个自然日发布量。每日发布量仍以 `po_contents.published_at` 的北京时间半开区间筛选结果为准。

超时运行必须报告为 partial/timeout，不能声明来源完整或分析全部完成；下一次运行通过 checkpoint 继续。

## 安全边界

不恢复历史全局分析积压，不启动无范围 `analysisWorker`，不输出 Token、Cookie、凭据明文或供应商敏感原文；不执行生产迁移。
