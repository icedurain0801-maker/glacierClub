# Public Opinion Frontend

本目录是大玩家后台的舆情管理端，入口为 `index.html`。

## Local preview

1. 启动主服务：`npm --prefix public-opinion-system/server start`（默认 `http://localhost:4320`）
2. 如需联调抖音/小红书第一阶段 Mock 登录流程，另启动 `public-opinion-system/login-session-service`（默认 `http://127.0.0.1:4310`），并为两个服务配置相同的 `LOGIN_SESSION_INTERNAL_TOKEN`
3. 用 HTTP 静态服务器打开当前 `bigPlayer` 根目录，或在编辑器中预览 `admin/PublicOpinion/index.html`
4. 页面默认请求 `http://localhost:4320/api/public-opinion`

如需切换正式 API，在加载 `assets/app.js` 前设置：

```html
<script>window.PUBLIC_OPINION_API = 'https://your-api.example.com/api/public-opinion';</script>
```

## Current prototype behavior

- 使用独立后端 API，不读取 `aiCompanion/server` 数据。
- 展示总览、趋势、平台来源、负面热帖、内容列表和告警列表。
- 支持内容筛选、内容详情、告警状态处置、采集源启停、手动触发 Mock 采集。
- 生产版接入时保留页面 API 模型，替换后端采集器、AI 分析器、钉钉通知器和鉴权即可。
