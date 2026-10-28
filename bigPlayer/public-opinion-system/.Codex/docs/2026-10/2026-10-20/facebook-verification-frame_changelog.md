# Facebook 人工验证画面空白修复

日期：2026-10-20

## 问题与原因

用户看到的 Meta 空白画面来自真实验证页，截图接口本身正常。上一轮只验证进入二次验证地址，未验证验证码实际出现，验收不完整。

1. 系统 DNS 将 www.fbsbx.com 解析到访问超时的地址，Facebook 主站正常并不代表其验证码子页面正常。系统解析下真实 Edge 访问验证组件超过 15 秒超时，使用独立 DNS 解析结果后同一 HTTPS 页面约 2 秒返回。
2. 验证子页面使用 Google reCAPTCHA Enterprise，原网络规则没有准入其脚本及嵌套 iframe。

## 修改

- `login-session-service/src/adapters/facebookBrowser.js`：可选的专用 DNS 配置仅解析固定的 www.fbsbx.com，在启动 Facebook 专用浏览器时应用；保留 TLS 校验，不把手工 IP 固定写入代码。仅放行三个确切 Google/reCAPTCHA 主机的 `/recaptcha/` 路径，禁止这些地址成为顶层导航目标。新增验证画面加载检测，支持重新加载当前验证页。
- `login-session-service/src/index.js`：读取 Facebook 专用 DNS 配置，不影响大玩家登录浏览器或电脑全局 DNS。
- `../admin/PublicOpinion/assets/facebook-browser.js`：验证页无内容时显示加载说明，隐藏白图；提供“重新加载验证页”。
- `.env.example`：说明可选配置，默认仍为空。
- `server/test/facebookBrowser.test.js` 与日期目录浏览器自测：覆盖 DNS 作用域、网络资源准入、禁止顶层跳转、空白提示、重新加载和渲染后的验证控件。

## 验证

- Facebook 后端核心与路由测试 16/16 通过。
- 真实 Edge 隔离页面自测 17/17 通过；发布后加载实际外网静态文件再次通过 17/17。该套用例的业务 API 与 Facebook 页面均为隔离夹具。
- 独立真实 Facebook 浏览器与发布后的现役登录服务均实际显示 reCAPTCHA “I'm not a robot”复选框，并人工检查截图；没有点击或代解验证码。
- 发布后登录服务约 6 秒返回待人工验证，无失败码；后续截图确认验证码可见。验证码初次加载需要额外时间，可刷新画面。
- 登录服务健康检查 HTTP 200；语法与空白检查通过。

## 发布与边界

沿用本会话批准的 Facebook 发布及真实验收范围。取得调度租约、确认无正在运行/暂停中/取消中的采集任务和无正在执行的 Facebook 登录后，切换登录服务及前端。

- 登录服务：`login-session-20261020-facebook-verification-frame-r1`，只变更适配器、入口及 manifest。
- 前端：`release-20261020-facebook-verification-frame-r1`，以当时现役 `release-20261020-human-correction-frontend-r2` 为基线，只修改 Facebook 表单文件及 manifest，保留并行变更。
- 登录服务 XML 增加 `LOGIN_SESSION_FACEBOOK_VERIFICATION_DNS_SERVERS=1.1.1.1,1.0.0.1`；公共 DNS 仅查询固定验证域名，不发送账号、密码或页面内容。解析在 Facebook 浏览器启动时进行，不修改系统 DNS，不关闭证书验证。
- 来源保持停用；未执行真实采集、补抓、AI、钉钉发送或 Git 提交推送。真实验证码必须由用户完成；采集验收尚未完成。
- 切换计划、差异检查及 XML 回滚备份见仓库根 `.temp/facebook-verification-frame-20261020/` 与服务 XML 的 backups 目录。
