---
status: implemented
scope: public-opinion-system
---

# v017 Run 可观测性修复

## 变更

- Run 详情契约测试确认 `window_start/window_end` 及 camelCase 别名可独立读取。
- Run contents API 返回 `scope` 元数据，并在只读内容行中暴露已持久化的 `feed_key/page_kind`。
- Run 详情页增加“帖子 / 动态”和“评论正文”只读切换；内容表显示帖子、评论或动态类型。
- 评论正文统计继续与帖子 engagement 中的声明评论数分开显示，避免把数量误报为正文。
- feed membership 按 `last_seen_at <= rc.fetched_at` 回溯，避免后续采集把旧 Run 误标为动态。
- 详情空态列数与类型列保持一致，并补充真实评论行的只读契约断言。

## 验证边界

- 未重跑真实 Run `f349c6cc-dbd3-4c5a-9a03-8ac34b5750f9`。
- 未写入、删除或修改线上采集数据，未解除 BigPlayer gate。
- 已执行离线 UI 测试和 Node 语法检查；数据库集成测试未执行，避免测试夹具写入共享数据库。
- 开发负责人已复审通过，已转测试负责人做只读回归。

## QA 运行态修复

- 根因：4320 仍运行旧 `v053-unified-scheduler-index-compat-20260921-qa` release，3000 仍使用旧 hermetic 静态候选。
- 已切换 API 到 `C:\ProgramData\PublicOpinion\releases\v017-runtime-observability-20260924-qa`，保留旧 XML 备份并通过 `/health`。
- QA 数据库尚未具备 `site_url_snapshot/last_request_at` 列，候选包仅回退这两个非本次验收字段，未执行迁移；窗口和 feed 历史字段仍生效。
- 3000 已重启为仓库 `.temp/qa_proxy_3000.js`，静态页面与 4320 同源代理均可读。
- 运行态只读验证确认目标 Run 返回窗口字段、posts/comments scope、`feed_key/page_kind`，页面详情显示窗口和评论正文切换。
