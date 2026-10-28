# 静态托管 CORS 修复

- 日期：2026-10-14
- 问题：`https://chat.q1.com/apps/public-opinion/` 调用正式 API 时被浏览器 CORS 拦截，页面提示无法连接电脑上的舆情服务。
- 原因：`PUBLIC_OPINION_CORS_ORIGIN` 仅包含本机开发来源，没有 `https://chat.q1.com`。
- 处理：备份并更新 `C:\ProgramData\PublicOpinion\config\public-opinion.env`，加入静态托管来源；重启 `PublicOpinionApi`。
- 验证：正式 API 对 `Origin: https://chat.q1.com` 的 GET 返回 200，预检 OPTIONS 返回 204 且允许该来源；静态托管页面浏览器验证通过，登录身份正常显示。
- Git：未提交、未推送。
