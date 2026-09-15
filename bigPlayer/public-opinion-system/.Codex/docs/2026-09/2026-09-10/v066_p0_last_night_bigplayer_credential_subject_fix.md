---
last_updated: 2026-09-10
status: completed
scope: last-night-bigplayer-credential-subject-fix
owner: 开发负责人
---

# v066 P0 Last Night BigPlayer 凭据主体修复

## 问题与根因

- 目标来源为 `081a16d2-5545-4afd-9c65-e04777e4540b`，绑定账号为 `75c8205f-37eb-4bdf-b6a4-f4f502e35658`。
- `BigPlayerH5Connector` 将 source 对象传给 `CredentialContext.loadApiToken()`，导致 source `id` 被当作 accountId 查询，运行时稳定返回 `CREDENTIAL_NOT_FOUND`。
- 目标账号对象可正常加载 active `api_token`，因此本次不修改凭据、schema、配置或数据。

## 修改内容

- Q1 凭据主体统一按“显式 `account` → `source.account` → legacy `source`”解析。
- `discoverFeeds`、`listFeedContents`、`listQ1Comments` 的首次 token 加载显式传递账号。
- Q1 请求保留绑定账号，使 401/403 认证刷新后的 token 重载继续使用 account，而非误用 source。
- 保留无账号调用时的 legacy source fallback，避免破坏旧调用方。

## 定向验证

```text
node --check src/connectors/bigPlayerH5Connector.js
通过

node --test --test-concurrency=1 test/connectors.test.js test/connectorSlice.test.js
33 passed, 0 failed

git diff --check -- server/src/connectors/bigPlayerH5Connector.js server/test/connectors.test.js server/test/connectorSlice.test.js
通过（仅有工作树 LF/CRLF 提示，无空白错误）
```

新增回归覆盖：

1. 显式 `account` 优先。
2. 缺少显式账号时使用 `source.account`。
3. 无账号绑定时保留 legacy source fallback。
4. Q1 认证刷新后使用绑定 account 重载 token。

## 边界与剩余事项

- 未启动采集或 Worker，未修改 schema、凭据、`.env`、调度、任务或业务数据。
- 未执行 commit、push 或发版。
- 真实采集、DB/API/页面验收仍由后续获授权流程执行，本记录不将其标记为已完成。
