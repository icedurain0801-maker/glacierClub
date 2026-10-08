---
status: PENDING_QA
scope: domestic BigPlayer account-password authorization
date: 2026-09-21
---

# BigPlayer 境内账号密码授权检测修复

## 变更范围

- 境内 BigPlayer H5 账密表单移除确认密码字段，保存请求只提交账号和一次密码。
- BigPlayer 能力检测保留真实 source id，并通过 account_id 关联默认账号，避免把账号 id 当作 source id。
- 授权刷新透传凭据解析、自动化未配置、账号绑定和会话相关稳定错误码，避免统一压成 `AUTH_REFRESH_FAILED`。
- 增加 API、协调器和前端表单定向回归测试。

## 验证

- `server/test/authRefreshCoordinator.test.js`：7/7 PASS。
- `server/test/app.routes.test.js` 定向授权/能力/凭据用例：4/4 PASS。
- `admin/PublicOpinion/assets/source-status.test.js` 定向 H5 账密用例：2/2 PASS。
- `git diff --check`：PASS。
- 浏览器隔离验收：确认境内 BigPlayer 账密表单无确认密码字段；授权检测已进入真实登录链路。

## 待 QA / 阻塞

- 当前本机 4311 登录会话服务对已有脱敏账号返回 `INTERNAL_ERROR`，且工作区未提供有效密码，无法完成成功授权和能力检测路径验收。
- 未重启现有候选/生产服务，未执行生产 sync、push、合并或 tag。
