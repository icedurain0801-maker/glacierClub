# v001 Changelog · 2026-05-28

## bigPlayer/client/domestic/home/home.html

### 小程序版 topbar 还原
- 删除 `body[data-active-variant="miniprogram"] #topbar-avatar, #topbar-search { display: none !important; }` 隐藏规则，小程序版顶部右侧恢复显示搜索图标与头像。

### 右下角需求说明面板内容替换
- FAB 标题、面板标题、版本号统一为「国内小程序版 · 登录弹窗需求说明 v3.2.0」。
- 正文内容由原「国内版 UI 重设计规范」替换为本次小程序登录弹窗需求，含：
  - 一、本次需求概览
  - 二、登录方式总览（账密 / 微信 / 角色验证）
  - 三、入口与弹窗规范（正式触发：未登录用户点击主页以外的任意功能按钮 → 拦截并弹出；顶部登录按钮为调试入口）
  - 四、账密登录（一句话直跳既有账密登录页）
  - 五、微信授权登录
  - 六、角色验证登录（本次新增 ★）：gameVersion 由当前版块上下文自动读取、roleId 1–50 位纯数字、邮件验证码经游戏邮件系统下发到角色游戏内邮箱
  - 七、UI 视觉规范
  - 八、开发注意事项（无接口清单、无代码实现细节）

### 说明面板 Markdown 渲染修复
- `md2html` 表格触发正则由 `/^\| /` 改为 `/^\|/`，修复表格分隔行（`|---|---|`）被当成段落输出的 bug。
- `#spec-body ul/ol` 补 `list-style:disc / decimal`、`::marker { color:#0061a4 }`，无序/有序列表恢复项目符号显示。
