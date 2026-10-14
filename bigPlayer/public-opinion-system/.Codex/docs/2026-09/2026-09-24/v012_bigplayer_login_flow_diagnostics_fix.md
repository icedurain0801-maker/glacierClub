---
status: READY_FOR_QA
scope: BigPlayer login authorization
---

# BigPlayer 登录链路修复

## 修复内容

- 登录表单兼容账号、用户名和标准 password 字段，并兼容多种登录按钮选择器。
- `startLogin` 后统一轮询登录会话到 `active`，再执行一次性授权结果领取。
- 失败、验证码/二次验证、超时和 Token 未出现分别保留明确错误码；不回退旧 Token。
- 登录状态未知时仅记录脱敏诊断（页面/iframe host、字段和验证码存在性、截断后的页面信号），不记录账号、密码、Token 或 Cookie。

## 验证

- `node --test server/test/bigplayerApiAuthorization.test.js`：6/6 PASS。
- 定向登录服务/Playwright 用例：2/2 PASS。
- `node --check login-session-service/src/adapters/bigPlayerH5Playwright.js`：PASS。
- `node --check server/src/connectors/bigPlayerH5Connector.js`：PASS。

真实运行保持 gate 关闭，待独立 QA 复测后再决定是否进行受控运行。
