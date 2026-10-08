---
status: candidate_pending_independent_qa
scope: isolated_regression_evidence_only
---

# BigPlayer 隔离回归证据记录

## 范围

- 候选根独立执行 Discord、TapTap、Facebook 定向回归。
- 纯 fixture 对照国内/境外 BigPlayer 配置，确认 base URL/gameId 不串线。

## 安全边界

- 未修改其他平台业务逻辑。
- 未创建真实 Run、未访问生产 DB、未切服务。

## 独立复测结果（2026-09-23）

- 候选根：`.temp/candidates/v001-bigplayer-api-collector-20260923`
- manifest：`683/683`，`bad=0`
- checksums：`683/683`，`bad=0`
- manifest SHA：`70C33815971B93A69B7572EBA33000BB14C7BA060790ECA53411FA8BF61FD175`
- checksums SHA：`45A362B7C4A7ED145C525306E898BDA1B9FEADCC0568C8BB1306B225E2E72DFA`
- 独立回归套件：`65/65 PASS`，`0 fail`

覆盖 Discord、TapTap、Facebook 既有定向回归，以及国内/境外 BigPlayer `gameId/baseUrl` 隔离 fixture。未执行真实 Run、生产 DB 或服务切换。
