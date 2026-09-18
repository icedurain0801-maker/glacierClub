# v194 PublicOpinion 工作台侧栏修复

日期：2026-09-17

## 变更内容

- PublicOpinion 六个页面统一引用 `sidebar-data.js?v=6` 与 `sidebar.js?v=146`，使浏览器不再复用旧的共享侧栏脚本。
- 侧栏在 `scope.js` 尚未初始化时，从当前 URL 回退读取 `regionCode`、`communityId`、`platform`，确保工作台入口跳转保留完整作用域。
- PublicOpinion 页面使用独立的单层工作台导航；其他后台页面继续使用原全局侧栏。

## 验证

- `node --check ../shared/sidebar-data.js`
- `node --check ../shared/sidebar.js`
- `git diff --check`
- 本地 `http://127.0.0.1:8080`：六个入口可点击并保留三个作用域参数；控制台无 error/warn；普通后台页仍显示全局侧栏。

## 已知阻塞

本机未安装 `PublicOpinionFrontend3001` 服务，且没有 3001 监听或对应静态运行目录；未执行任何服务控制或发布操作。外网环境需要由具备发布权限的负责人重新构建并切换 3001 静态发布物后，再做外网验收。
