---
status: verified
scope: local-e2e
---

# Overview E2E Local API

## 变更

- 补齐工作树已有 Discord 连接器引用的 `server/src/connectors/discordConnector.js`，默认禁用、fail-closed，不发起外部请求。
- 启动正式 `public-opinion-system/server` 于本机 4320，未修改 Apache/Konga/生产配置。

## 验证

- 精确地址 `https://lfy3001.dev.q1op.com/admin/PublicOpinion/index.html?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=discord` 返回 200 并完整渲染。
- 页面筛选正确显示：境外 / Last Light / Discord；概览、趋势、告警、负面热帖、议题分布均有数据。
- 浏览器控制台 error/warning 数量为 0。
- 精确域名下 `/api/public-opinion/communities`、`/overview`、`/sources` 均返回 HTTP 200。
- 4320 由 `node src/app.js` 监听，PID 28292；服务保持运行供后续本机验收。

## 未处理

不处理 3001、外部生产环境、业务数据写入、重新分析/补偿和推送发布。
