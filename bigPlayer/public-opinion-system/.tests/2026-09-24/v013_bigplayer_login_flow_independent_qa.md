---
status: PASS_FIXTURE_ONLY
scope: BigPlayer 登录链路修复独立复测
date: 2026-09-24
---

# 独立 QA 结果

## 范围

- 表单选择器兼容：账号、用户名、password 字段及登录按钮。
- `startLogin -> getStatus` 轮询到 `active` -> `claimAuthResult`。
- 登录失败、验证码/二次验证、超时/未知状态的错误码与脱敏诊断。
- 账密存在时不回退旧 Token；无账密时保留配置 Token 兜底。
- 不启动真实 Run，不解除真实 gate，不修改业务代码。

## 原始验证结果

| 验证 | 命令 | 结果 |
|---|---|---|
| API 授权连接器 | `node --test server/test/bigplayerApiAuthorization.test.js` | 6/6 PASS |
| 登录服务 | `node --test login-session-service/test/service.test.js` | 19/19 PASS |
| 核心 Playwright 两例 | `node --test --test-name-pattern='BigPlayer automation opens\|fake Playwright browser completes' login-session-service/test/service.test.js` | 2/2 PASS |
| Playwright 适配器语法 | `node --check login-session-service/src/adapters/bigPlayerH5Playwright.js` | PASS |
| BigPlayer 连接器语法 | `node --check server/src/connectors/bigPlayerH5Connector.js` | PASS |

## 结论

候选通过独立 fixture/Playwright QA，结论为 `PASS_FIXTURE_READY_FOR_ONE_CONTROLLED_RUNTIME`。本轮没有真实运行证据，不能把 fixture PASS 等同于真实授权 PASS；真实 gate 保持关闭，后续如需运行只能由项目经理按流程申请一次受控真实 Run。
