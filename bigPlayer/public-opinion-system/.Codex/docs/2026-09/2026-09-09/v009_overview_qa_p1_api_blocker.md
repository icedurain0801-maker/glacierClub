---
status: implemented
scope: local-acceptance-only
---

# Overview QA P1 API Adapter

## 变更

- 新增 `.temp/public-opinion-acceptance-server.js`，在 `127.0.0.1:3000` 提供只读静态服务和 `/api/public-opinion/*` 固定 JSON 路由。
- 新增 `.temp/public-opinion-acceptance-fixtures.js`，包含概览、内容列表、详情、评论和翻译 A-D 固定样本。
- 适配器不加载数据库、不访问外部服务、不修改正式 API/Apache/Konga/4320/3001 配置。

## 验证

启动命令：`node .temp/public-opinion-acceptance-server.js 3000`

- `/admin/PublicOpinion/index.html`：HTTP 200，HTML 可读取。
- `/api/public-opinion/overview?...`：HTTP 200，返回 4 条样本概览。
- `/api/public-opinion/contents?contentType=post`：HTTP 200，返回 4 条内容。
- `/api/public-opinion/contents/translation-a`：`completed`，译文非空且包含目标 ID。
- `/api/public-opinion/contents/translation-b`：`not_requested`。
- `/api/public-opinion/contents/translation-c`：`retryable`。
- `/api/public-opinion/contents/translation-d`：`failed`，错误码 `TRANSLATION_PROVIDER_UNAVAILABLE`。
- 非 GET 请求：HTTP 405 `READ_ONLY`。

验收完成后已停止 3000 服务；4320 未监听问题仍不在本单范围内。
