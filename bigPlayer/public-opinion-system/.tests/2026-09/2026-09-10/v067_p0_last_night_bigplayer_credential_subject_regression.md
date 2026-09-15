# v067 P0 Last Light BigPlayer 凭据主体修复回归报告

- 测试日期：2026-09-10
- 测试角色：测试负责人
- 范围：`BigPlayerH5Connector` 的 Q1 凭据主体选择与 401/403 刷新后重载。
- 限制：未启动 Worker、未触发真实采集、未读写数据库、未请求真实 Q1 API。

## 结论

**PASS（代码回归）**。Q1 入口不再把 `source.id` 优先当作账号凭据主体：凭据加载优先级为“显式 `account`、`source.account`、历史 `source`”。认证刷新后的 token 重载仍使用绑定账号。

此结论仅准入“单来源真实采集”验证；不代表真实采集、数据库落库、API 与页面验收已经通过。

## 覆盖与结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 连接器语法 | PASS | `node --check server/src/connectors/bigPlayerH5Connector.js`，退出码 0 |
| 现有连接器回归 | PASS | `node --test --test-concurrency=1 server/test/connectors.test.js server/test/connectorSlice.test.js`：33/33 通过，0 失败 |
| 凭据主体优先级 | PASS | 单元测试 `Q1 token loading prefers explicit account, then source account, then legacy source` |
| 认证刷新重载 | PASS | 单元测试 `Q1 auth refresh reloads the API token with the bound account` |
| 三个 Q1 入口主体传递 | PASS | 内存 mock 入口矩阵：`discoverFeeds`、`listFeedContents`、`listQ1Comments` 在显式账号、`source.account`、历史 source 三种场景均传入预期主体 |
| 空白检查 | PASS | `git diff --check -- server/src/connectors/bigPlayerH5Connector.js server/test/connectors.test.js server/test/connectorSlice.test.js`；仅报告 CRLF 转换警告，无空白错误 |

## 入口矩阵实测

内存 mock 记录的 `loadApiToken(subject)` 主体顺序如下：

```text
explicit-account, explicit-account, explicit-account,
source-account, source-account, source-account,
source-id, source-id, source-id
```

每组三项依次对应 `discoverFeeds`、`listFeedContents`、`listQ1Comments`。历史 source fallback 仅用于没有任何账号绑定信息的兼容调用。

## 审查要点

- `loadApiToken(source, credentialContext, account)` 的主体选择为 `account || source?.account || source`。
- 三个 Q1 入口初始加载均显式传入 `account`。
- Q1 请求使用包装后的 `source`（保留绑定的 `account`）；因此 401/403 刷新完成后的 `loadApiToken(source, ...)` 继续选中同一账号。

## 后续准入与风险

请项目经理安排仅 Last Light / BigPlayer 的受控真实采集验收，并核对任务运行结果、落库计数和页面可见性。仍需关注 Q1 远端授权、接口可达性、限流、源端返回及数据时间窗口等运行时因素；本报告未覆盖这些外部依赖。
