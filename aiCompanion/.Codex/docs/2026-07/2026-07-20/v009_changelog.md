# v009 变更记录

## 变更内容

- 重写 `server/src/services/communityQ1Crawler.js`，修复乱码导致的语法损坏和错误文案异常。
- 保留 Q1 社区抓取主流程：优先复用本地浏览器已登录 profile，失效后再回退账号密码登录。
- 统一帖子、评论、板块、错误信息的中文格式化输出，避免写入知识库时出现乱码。
- 修复 `server/test/communityQ1Crawler.test.js`，恢复对富文本归一化和自动标题逻辑的单测覆盖。

## 验证

- `node -e "require('./src/services/communityQ1Crawler'); console.log('communityQ1Crawler ok')"`
- `node test/communityQ1Crawler.test.js`
- `node test/communityCrawler.test.js`
- `http://127.0.0.1:3100/api/ping` 返回 `{\"ok\":true,...}`
- 登录 `http://localhost:8080/admin.html` 后截图检查社区同步页面，截图文件：
  - `.temp/admin-community-sync-after-q1-fix.png`

## 结果说明

- 当前后台运行记录中的最新失败原因已变为 `Q1 登录需要验证码...`，说明后端已进入 Q1 专用登录分支，不再停留在旧的 `HTTP 405` 页面访问失败逻辑。
