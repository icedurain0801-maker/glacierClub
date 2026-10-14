# v276 v050 BigPlayer 4311 登录会话浏览器 QA

- 测试日期：2026-09-21
- 测试角色：测试负责人
- 验收地址：`http://127.0.0.1:3000/admin/PublicOpinion/sources.html`
- 验收范围：境内 / 超能世界国服版 / BigPlayer社区
- 目标 source：`5c21f78d-5f67-4467-963d-dcdeb5e26cab`
- 浏览器：机器级 Google Chrome，由 Playwright 真实加载页面并点击按钮

## 结论

**PASS**

## 浏览器验证结果

1. 强刷来源管理页后，目标来源管理抽屉正常打开。
2. 切换至“账号密码”模式后：
   - “登录账号”输入框：`1` 个；
   - “登录密码”输入框：`1` 个；
   - “确认密码”输入框及文案：`0` 个；
   - 账号与密码均显示已配置的脱敏提示，未读取或输出明文凭据。
3. 点击登录验证工作区的“检测授权”：
   - `POST /api/public-opinion/sources/5c21f78d-5f67-4467-963d-dcdeb5e26cab/login/check`
   - HTTP `200`
   - 返回状态 `active`
   - 返回非空 opaque `sessionRef`，页面提示“授权验证通过”。
4. 随后点击基础配置区的“检测授权”：
   - `POST /api/public-opinion/sources/5c21f78d-5f67-4467-963d-dcdeb5e26cab/check-auth`
   - HTTP `200`
   - 返回 `authStatus=authorized`、`reason=null`
   - 页面提示“授权检测完成”。
5. `active` 后紧接真实连接器授权检测为 `authorized`，证明登录结果中的一次性 Token 已被领取并写入后续授权链路；未输出 Token 内容。
6. 浏览器 Console：`error=0`、`warning=0`；页面运行异常：`0`。

## 服务证据

- `PublicOpinionLoginSession`：Running。
- `http://127.0.0.1:4311/health`：HTTP `200`，`ready=true`，BigPlayer adapter `available=true`。

## 边界核对

- 未点击或调用任何同步、采集、补跑接口。
- 未修改或重启 4320/v046、Worker、TapTap、3001。
- 未修改代码或服务配置。
- 未输出账号、密码、Token 或其他凭据明文。
