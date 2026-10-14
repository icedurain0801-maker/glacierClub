# v050 境内 BigPlayer 账号密码授权浏览器 QA

- 测试日期：2026-09-21
- 测试角色：测试负责人
- 新建验收标签：Codex In-app Browser tab `59`
- 验收地址：`http://127.0.0.1:3000/admin/PublicOpinion/sources.html`
- 筛选：境内 / 超能世界国服版 / BigPlayer社区
- 环境：v050 API 隔离运行 `4321`，3000 临时代理转发 v050；4320/v046、3001 未改动。
- 候选：`.temp/candidates/v050-bigplayer-login-check-error-normalization-20260921-qa`
- manifest：406 files
- SHA-256：`8B0F03CE41CBBFCF05BF9CDFE67755A36057F697E2FBE242157A289E34A32DEA`
- 凭据：一次性合成 QA 凭据，仅用于表单保存与失败收敛验证。

## 结论

**PASS**

## 验证结果

- 3000 新标签页面正常加载，境内、超能世界国服版、BigPlayer社区筛选正常。
- 账号密码模式仅显示“登录账号”“登录密码”，无“确认密码”。
- 输入一次性 QA 账号密码并保存成功；重新打开配置仍显示已配置的脱敏账号密码模式。
- 登录会话检测按钮点击后页面显示：`授权检测失败：账号授权检测失败，请检查账号密码或登录会话服务`。
- `POST /api/public-opinion/sources/{id}/login/check` 返回 HTTP `503`，错误码 `AUTH_REFRESH_FAILED`，不再返回 `500 INTERNAL_ERROR`。
- `POST /api/public-opinion/sources/{id}/check-auth` 返回 HTTP `200`，`authStatus=unauthorized`、`reason=AUTH_REFRESH_FAILED`。
- `POST /api/public-opinion/sources/{id}/check-capabilities` 返回 HTTP `200`，`authorized=false`、`reason=AUTH_REFRESH_FAILED`，帖子/评论均为 `unauthorized`。

## 边界核对

- 仅启动并使用本机 `3000` 免登录验收代理和隔离 API `4321`。
- 未占用、未重启 `3001`；未修改 `4320/v046`；未执行生产 sync。

## 交接

v050 登录会话检测错误归一化通过浏览器复测，可进入项目经理发版评审流程；本报告作为验收凭据。
