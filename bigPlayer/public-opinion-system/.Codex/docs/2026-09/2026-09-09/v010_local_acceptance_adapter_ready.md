# 本地 3000 验收适配器交接

- Status: ready_for_qa
- Owner: 项目经理
- Updated: 2026-09-09

## 交付物

- `bigPlayer/.temp/public-opinion-acceptance-server.js`
- `bigPlayer/.temp/public-opinion-acceptance-fixtures.js`

启动命令（在 `bigPlayer` 根目录）：

```text
node .temp/public-opinion-acceptance-server.js 3000
```

适配器仅监听 `127.0.0.1:3000`，提供静态页面与 `/api/public-opinion` 固定只读 Mock；非 GET 返回 405，路径越界返回 400。验收后须停止。

## 开发自验

- 概览入口 200。
- overview 返回 `metrics.total=4`。
- contents 返回 4 条内容。
- A=completed 且译文非空；B=not_requested；C=retryable；D=failed 且安全错误码。
- 两个脚本 `node --check` 通过；端口 3000 已停止。

## QA 范围

概览非 404、筛选参数保持、详情往返、翻译 A-D 四态、情感分析字段不回归。
