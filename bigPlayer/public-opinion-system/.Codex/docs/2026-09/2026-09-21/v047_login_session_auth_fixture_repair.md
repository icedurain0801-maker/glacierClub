---
candidate: login-session-4311-20260920-2320h
status: PENDING_QA
---

# v047 BigPlayer 登录会话与本机验收修复

## 变更范围

- LocalService 运行的登录服务支持机器级 Chrome executablePath，并支持显式环境变量覆盖。
- 登录自动化或 credential resolver 异常会收敛为 `session_expired`，保留结构化 failureCode，避免卡在 `verifying`。
- 本机 3000 验收适配器补齐 `/contents/stats` fixture 路由。

## 验证证据

- 工作树登录服务测试：35/35 PASS。
- 候选目录定向测试：23/23 PASS。
- 系统 Chrome executablePath 启动：PASS。
- 候选 manifest：626 files，validate PASS，SHA-256 `2E9FA54E4BC7F2379B769DC45BD0A11EC2D07D574BF96A54C645FB07836254CE`。
- 本机 3000 内容页：统计接口 HTTP 200，四项统计正常显示。

## 门禁状态

- 新候选已封存，等待测试负责人独立 QA。
- QA PASS 前不安装候选、不重启 `PublicOpinionLoginSession`、不重试生产 sync、不回滚 v046、不触碰 TapTap。
