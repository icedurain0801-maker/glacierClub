# v019 collection-runs 深链初始化最终独立 QA

- 日期：2026-09-24
- 方式：仅使用 `http://127.0.0.1:3000`，只读。
- 禁止项遵守：未重跑 Run、未写真实采集数据、未解除 `BIGPLAYER_API_SYNC_ENABLED` gate。
- 目标 Run：`f349c6cc-dbd3-4c5a-9a03-8ac34b5750f9`。

## 结论

`FAIL_DEEPLINK_UI_RUNTIME`

## 证据

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 深链初始地址 | PASS | 新开页请求包含 `runId=f349c6cc-dbd3-4c5a-9a03-8ac34b5750f9`。 |
| 深链参数保持 | FAIL | 页面初始化后地址变为 `collection-runs.html?regionCode=...&communityId=...&platform=...`，`runId` 被移除。 |
| 目标详情渲染 | FAIL | 页面持续显示“加载中…” / “正在加载抓取记录…”，未呈现目标 Run 详情。 |
| API 窗口字段 | PASS | Run API 同时返回 `window_start/window_end` 和 `windowStart/windowEnd`。 |
| API 内容字段与统计 | PASS | contents 行存在 `feed_key/page_kind` 属性；真实 Run 为 posts=209、comments=337，评论正文可读。 |

## 门禁

UI 深链与详情页加载未通过，真实 Run gate 必须保持关闭。该轮为最后一次只读复验；请以本报告的实际浏览器结果为准处理缺陷。
