---
date: 2026-09-14
status: completed
scope: unified-source-scheduler-formal-admission
owner: 开发负责人
---

# v114 全部合格来源正式调度

## 变更

- 正式 Worker 不再读取或应用临时双源 allowlist；统一调度恢复加载全部候选来源。
- 既有 `sourceEligibility` 继续拦截停用、未授权、配置不完整、无 connector capability 的来源，并输出明确 rejection evidence。
- 候选加载器保留可选过滤参数，仅用于测试/受控调用，不作为正式运行配置。

## Last Light 只读证据

- 截图显示社区为 `境外 / Last Light`、平台 `BigPlayer社区`，内容页为 `暂无匹配内容`、`共 0 条`，未显示授权或错误状态。
- 数据库核查使用 `g.region_code`（`po_sources` 无 `region_code` 列）：source `081a16d2-5545-4afd-9c65-e04777e4540b` 归属 game `00000000-0000-0000-0000-000000000002`、community `00000000-0000-0000-0000-000000000102`、`region_code=overseas`，内容行的 `community_id` 与页面筛选 UUID 一致。
- 该 source 的非删除内容按 `published_at` 分日为：9/8 `23`、9/9 `43`、9/10 `19`、9/11 `9`；按北京时间近 7 天半开区间 `[2026-09-07 16:00:00, 2026-09-14 16:00:00)` 查询为 `104` 条，同一 Last Light community 全平台为 `203` 条。`2026-09-13 00:00:00` 至 `2026-09-14 00:00:00`（北京时间“昨天”）为 `0`，因此“昨天 0 条”是时间窗口真实结果，不是 community 映射或时区转换漏数。
- 内容接口的边界仍按半开区间 `[publishedFrom,publishedTo)`，前端日期会转换为带 `+08:00` 的 ISO 边界；服务端归一化为 UTC wall-clock 后按 `c.published_at` 比较。定向 API 验证应使用近 7 天窗口确认已有内容可见，并保留昨日窗口的零值断言。

## 范围

- 不改频率、回溯、checkpoint、删除语义或 Discord connector；不发版、不 push。
