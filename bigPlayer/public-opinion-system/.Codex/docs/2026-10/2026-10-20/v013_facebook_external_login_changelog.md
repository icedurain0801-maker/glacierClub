# Facebook 真实浏览器登录

Status: 用户已批准发布，API、登录服务及本机前端已切换，三项 HTTP 健康检查均为 200；桌面浏览器助手已启动，仅监听 127.0.0.1:4312。Last Light 已通过真实入口打开采集服务持有的 Facebook 窗口，当前等待用户人工登录验证，尚未提交同步。

用户直接在桌面真实 Facebook 页面完成登录、验证码和二次验证。系统打开绑定来源与账号的独立浏览器资料目录，通过回环 CDP 连接使用同一浏览器会话；登录成功由真实 Cookie 和 Facebook 页面状态确认，继续使用原有授权持久化、会话引用及采集入口。

新增本机浏览器启动器及鉴权客户端；账号管理增加真实浏览器入口并轮询结果。启动器必须在已登录用户桌面运行，仅监听 127.0.0.1，使用既有内部鉴权；账密不经过启动器及前端。保留内嵌验证，修复其验证码后返回登录表单时不能继续的问题。真实浏览器中用户亲自提交登录，系统不代做验证码。

相关文件：login-session-service/src/externalBrowserBroker.js、externalBrowserClient.js、index.js、loginSessionService.js、adapters/facebookBrowser.js；server/src/services/facebookBrowserAccount.js；相邻前端 assets/facebook-browser.js；scripts/windows-services/start-external-browser-broker.ps1。

验证：账号隔离、内部鉴权、地址限制等 19 项测试通过；真实桌面 Chrome + 隔离页面 7 项通过，覆盖人工登录、同一会话接管、跨社区拒绝及正常采集链路。实际 Facebook 和 Last Light 同步尚未验证，不宣称已完成。

现役按各自基线精确合入：API specific-keywords-api-r9、前端 specific-keywords-front-r1、登录服务 facebook-images-r1，保留其他已发布变更。采集与分析 Worker 未切换；发布后全部五项服务处于 Running，浏览器实际内容页能正常加载图文版资源。

限制：桌面退出、浏览器关窗或配置变化会导致需要重新登录。桌面资料目录含平台会话，应由当前用户保护；调试连接仅限本机。配置 LOGIN_SESSION_EXTERNAL_BROWSER_URL=http://127.0.0.1:4312，启动器使用现役 XML 指定的环境文件。不开启远程调试地址，不将回调当成授权证明。
