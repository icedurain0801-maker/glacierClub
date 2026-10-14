# 权限管理页首屏空白修复

权限管理页缺少 `body` 的 flex 布局与默认边距清零，正常流中的侧栏高度为 100vh，导致正文位于侧栏下方。仅在 permissions.html 中补齐左右布局、main 弹性宽度、box-sizing 与窄屏规则，未修改公共页面样式。

已发布前端 release-20261013-permissions-layout-r2，运行包40个文件校验通过。浏览器读取已发布页面：body display=flex，main top=0，main left=232，标题 top=24。此次本地浏览器没有 q1.com 登录态，因此只验证布局坐标，不声称已验证角色保存功能。