# v005 Changelog

- `bigPlayer/client/overseas/home/home-en.html` 新增「小程序版」切换 tab（样式与 APP 版基本一致），小程序版点击「Log in」浮层弹出登录弹窗（Hero 横条按钮卡片，含微信 / 账密 / 角色验证三种入口）；小程序版隐藏顶部角色绑定条（YaoShen · Lv.85 / Switch / Play）。
- 同文件新增「角色验证登录」全屏页：在登录弹窗点「Verify by game role」进入；角色ID 输入框 blur 时自动校验，校验通过在输入框下方以蓝字单行显示「角色ID - 角色名称 - 区服」，校验失败显示红色错误；「获取验证码」按钮默认灰色禁用，校验成功后才高亮可点击；左上角返回按钮回到首页。
- 登录弹窗点击「Continue with WeChat」拉起底部微信授权弹层（仿微信原生：申请头像/昵称/地区/性别，含「使用其他头像和昵称」「拒绝/允许」按钮）。
- `bigPlayer/client/domestic/home/home.html` 国内端首页对齐 home-en：顶部 Hero 背景图（覆盖 status bar + 顶栏 + Tab，文字图标反白）在网页版和小程序版均显示；新增右上角「网页版/小程序版」切换 tab（默认网页版），小程序版顶部隐藏头像和搜索按钮、显示「登录」CTA；登录弹窗、微信授权底部弹层、角色验证登录全屏页样式与跳转完全照搬 home-en 实现（文案中文化）。
