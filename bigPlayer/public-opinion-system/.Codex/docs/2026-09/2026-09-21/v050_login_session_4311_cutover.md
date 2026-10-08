---
status: QA_PASS
scope: local 4311 BigPlayer login session service
date: 2026-09-21
---

# 4311 登录会话服务候选切换

## 变更范围

- 将 `PublicOpinionLoginSession` 从旧候选切换到 `login-session-4311-20260921-2330h`。
- 新候选 SHA-256：`2E9FA54E4BC7F2379B769DC45BD0A11EC2D07D574BF96A54C645FB07836254CE`。
- 旧服务 XML 已备份到 `C:\ProgramData\PublicOpinion\login-session-service\audit\2026-09-21\PublicOpinionLoginSession.before-2330h.xml`。
- 旧候选目录保留，未覆盖、未删除，可作为回滚点。

## 验证结果

- `PublicOpinionLoginSession`：`Running`，启动类型 `Automatic`。
- `GET http://127.0.0.1:4311/health`：HTTP 200，`ready=true`、resolver configured、BigPlayer adapter available。
- 真实 `POST /api/public-opinion/sources/5c21f78d-5f67-4467-963d-dcdeb5e26cab/login/check`：HTTP 200，`status=active`、`failureCode=null`、非空 `sessionRef`。
- 登录服务仅在收到真实授权 Token 后才会进入 `active`；API 随后领取授权结果并加密保存 Token。
- 使用保存后的凭据执行 `POST .../check-auth`：HTTP 200，`authStatus=authorized`、`reason=null`。

## 边界

- 未修改或重启 4320/v046 API release。
- 未触发生产 sync，未操作 Worker、TapTap、3001。
- 未 push、合并、tag 或发版。
- 验证输出未包含账号、密码、Token 或其他敏感值。

## 测试流转结果

- 测试负责人已用真实 Chrome 强刷 3000 来源页独立回归。
- 账号密码模式仅有一个密码输入框；登录授权检测显示通过，接口 `status=active` 且存在非空 opaque `sessionRef`。
- 页面授权检测返回 `authStatus=authorized`、`reason=null`。
- Console error=0、warning=0、pageerror=0。
- QA 记录：`.tests/2026-09/2026-09-21/v276_v050_login_session_4311_browser_qa.md`。
