---
status: queued
priority: P1
date: 2026-09-21
role: test-owner
scope: 概览指标卡片
---

# 概览指标卡片 API/浏览器验收队列

## 验收范围

仅做 API 与 `127.0.0.1:3000` 浏览器只读验收，不修改代码，不接触抓取、Worker、服务切换或发布。

需求文档：`.Codex/docs/2026-09/2026-09-21/v055_overview_metric_cards_reorder_and_content_breakdown.md`。

## 固定门禁

1. 四卡顺序必须为：今日发布内容、关注级内容、负面待处理、当前告警。
2. 负面待处理只计最终 `severity=urgent`，并与 `riskMode=negative` 列表一致。
3. 关注级只计最终 `severity=attention`，并与 `riskMode=attention` 列表一致；两者交集必须为 0。
4. 当前告警只计 `pending/processing`，不得包含历史已解决/误报。
5. 今日总数 = 帖子/动态数量 + 评论实际入库数量；两个明细之和必须等于总数。
6. 今天、昨天、近 7 天、近 30 天及清空/自定义窗口切换后，四卡与明细全部重新请求并一致刷新。
7. 空数据仍保留四卡并显示 0；风险颜色由关注到负面到告警逐级加深，文本不溢出不遮挡。

## 待采证据

- 概览 API 原始响应：地区、社区、平台、时间范围、`metrics` 全字段。
- 内容列表 API：`riskMode=negative`、`riskMode=attention` 的总数和 ID 集合。
- 告警 API：`pending/processing` 过滤后的总数与状态集合。
- 浏览器标签：`http://127.0.0.1:3000/admin/PublicOpinion/index.html`，截图/可访问文本/筛选变更前后响应。
- 同一筛选条件下帖子/动态列表与评论列表计数。

## 当前状态

`BLOCKED_ON_LIVE_API_EVIDENCE`。需求已读取，尚未执行 API 请求或浏览器操作；不能用截图中的示例数字 `135/21/0` 代替实时数据。

## 通过标准

API、内容列表、告警集合与 3000 浏览器四卡顺序、数值、明细、筛选范围完全一致；任一口径不一致、交集非零、空态隐藏卡片或颜色/文本布局异常，整体 FAIL 并退回开发负责人。
