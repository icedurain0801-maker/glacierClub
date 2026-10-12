# v049 境内 BigPlayer 账号密码授权浏览器 QA

- 测试日期：2026-09-21
- 测试角色：测试负责人
- 验收地址：`http://127.0.0.1:3000/admin/PublicOpinion/sources.html`
- 筛选：境内 / 超能世界国服版 / BigPlayer社区
- 环境：v049 API 隔离运行 `4321`，3000 代理提供工作区页面并覆盖 v049 前端资产；4320/v046、3001 未改动。
- 凭据：一次性合成 QA 凭据，仅用于验证表单保存和错误收敛，不是真实账号。

## 结论

**FAIL（唯一可复现阻断）**

## 通过项

- v049 `/health`：HTTP 200，database `status=ok`。
- 账号密码模式只显示“登录账号”和“登录密码”，无“确认密码”。
- 输入一次账号密码后点击“保存配置”，抽屉关闭并返回列表，保存成功；重新打开仍为账号密码模式。
- 页面“检测能力”按钮可执行；`POST /api/public-opinion/sources/{id}/check-capabilities` 返回 HTTP 200，结果为 `authorized=false`、`reason=AUTH_REFRESH_FAILED`，帖子/评论均为 `unauthorized`。
- 页面“检测授权”（接口授权检测）可执行；`POST /api/public-opinion/sources/{id}/check-auth` 返回 HTTP 200，`authStatus=unauthorized`、`reason=AUTH_REFRESH_FAILED`。

## 唯一失败

账号密码模式右侧“检测授权”登录会话检查按钮（`btnCheckLogin`）点击后页面显示：

`授权检测失败：internal server error`

同一请求：

`POST /api/public-opinion/sources/5c21f78d-5f67-4467-963d-dcdeb5e26cab/login/check`

返回 HTTP `500`：

```json
{"error":{"code":"INTERNAL_ERROR","message":"internal server error","details":{}}}
```

该路径未将账号密码失效收敛为可见的 `session_expired` / `AUTH_REFRESH_FAILED` 稳定状态；因此本次账号密码授权检测门禁不通过。检测能力和接口授权检测的 `AUTH_REFRESH_FAILED` 结果已记录，不将合成 QA 凭据误判为授权成功。

## 退回开发负责人

请修复 `login/check` 账号密码检测路径，使登录/凭据失效返回稳定的会话失效状态和错误码，并在页面可见；修复后重新提交 3000 浏览器复测。
