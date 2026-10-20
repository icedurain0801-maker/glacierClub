# Facebook 登录超时修复

日期：2026-10-20

## 原因

Facebook 新版登录控件为 div[role=button]，旧选择器仅支持 button，等待 30 秒后报 LOGIN_FAILED。页面只等待 DOMContentLoaded，表单可见时交互脚本尚未初始化，早期填写和点击没有提交登录。

## 修改

- login-session-service/src/adapters/facebookBrowser.js：登录入口等待 load；识别新版无障碍登录按钮并兼容旧按钮；空错误框不再视为账密错误；控件不可用、页面加载超时和登录响应超时分别返回明确错误，原有账号锁、域名准入、验证和 Cookie 检查保留。
- ../admin/PublicOpinion/assets/facebook-browser.js：刷新状态显示登录失败的中文原因。
- .tests/2026-10/2026-10-20/facebook-browser-ui.cjs：新增真实 Edge 的延迟脚本、新版按钮、响应停滞、控件缺失回归场景。

## 验证

- 后端 Facebook 核心与路由测试 14/14 通过。
- Edge 本地及实际外网静态页面回归各 15/15 通过；业务 API 和采集网页在该套回归中隔离模拟。
- 独立真实 Facebook 浏览器排查保留域名限制后可进入安全验证。
- 发布后调用现役登录服务，实际保存的 Last Light 账号在 5340 ms 返回 manual_verification，failureCode 为空；人工验证尚未完成，不代表采集验收通过。
- 登录服务健康检查 HTTP 200。
- 语法与 git diff --check 通过。

## 发布及边界

沿用本会话已批准的 Facebook 配置入口发布及真实验收范围，取得调度租约并确认零 running/pausing/cancelling 任务、没有 Facebook 登录正在执行后切换登录服务及前端；未重启 API/Worker。

- 登录服务：E:/CodexData/public-opinion/login-session-service/candidate-staging/login-session-20261020-facebook-login-timeout-r1
- 前端：E:/CodexData/public-opinion/frontend3001/releases/release-20261020-facebook-login-timeout-r1
- 均复制切换前现役基线，每个候选只改变本任务一个业务文件及其 manifest，保留并行变更。
- 来源保持停用；未运行采集、历史补抓、AI 或钉钉推送；未提交或推送 Git。
- 后续由管理员刷新登录状态并完成人工安全验证，再继续真实抓取验收。
