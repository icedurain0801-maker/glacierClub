# v004 变更记录

## 变更内容

- 修复后台管理「社区同步」页面在控件节点缺失时触发 `addEventListener` 空引用，导致模块白屏的问题。
- 为社区同步页面事件绑定增加空节点防御，避免单个按钮异常影响整页渲染。
- 将社区同步页面入口改为同步渲染入口，异步数据加载在页面内部完成，避免页面返回值被异常渲染为 `NaN`。
- 增加社区同步加载失败面板，接口或登录异常时显示可读错误，不再裸露 `NaN`。
- 修复社区同步渲染模板中裸反引号导致模板字符串被提前截断，页面内容被浏览器计算为 `NaN` 的问题。
- 优化社区同步表单交互，将登录凭据拆成「方案 A：Cookie / Token」和「方案 B：账号密码登录」，明确二选一关系。
- 为起始路径增加解释和示例，说明 `/`、`/posts`、`/forum/123` 分别代表首页、帖子列表页和指定版块页。
- 更新 `admin.html` 静态资源版本号至 `20260720-community-sync-fix4`，强制浏览器加载修复后的 `communitySync.js` 和样式资源。

## 验证

- `node --check web\js\pages\communitySync.js`
- `node --check web\js\app.js`
- `http://localhost:8080/admin.html` 返回 200
- `http://localhost:8080/js/pages/communitySync.js?v=20260720-community-sync-fix4` 返回 200
- 本地 API `/api/community-sync/status` 使用默认超管账号和当前版本请求成功，返回配置对象。
- 浏览器截图确认后台「社区同步」页面展示「抓取配置」、登录凭据二选一方案和起始路径说明，不再显示 `NaN`。
