# v006 变更记录

## 变更内容

- 重建 `web/js/pages/communitySync.js`，修复社区同步后台页脚本损坏导致的页面异常。
- 明确“登录凭证”为二选一交互：`Cookie / Token` 与 `账号密码登录` 分开展示，并补充优先级与说明文案。
- 明确“起始路径”为可留空字段，并补充路径示例；留空时默认从 `/` 开始遍历整站。
- 运行记录列表支持删除运行中的任务：前端按钮文案为“停止并删除”，确认文案明确说明“先停止抓取，再删除记录，已入库内容保留”。
- 后端社区同步任务支持取消：删除当前运行中的任务时，会先中止抓取，再删除 `community_sync_runs` 记录；已入库知识库内容不会被删除。

## 验证

- `node --check web/js/pages/communitySync.js`
- `node --check server/src/services/communityCrawler.js`
- `node --check server/src/services/communitySyncWorker.js`
- `node --check server/src/routes/communitySync.js`
- `node server/test/communityCrawler.test.js`
- 连通性检查：
  - `http://localhost:3100/api/ping` 返回正常
  - `http://localhost:8080/admin.html` 返回 `200`
- 真实回归验证：
  - 使用本地登录夹具站点 `http://127.0.0.1:3211`
  - 先完整抓取 1 次，确认已入库页面数为 `7`
  - 再启动第 2 次抓取并在运行中删除任务，确认：
    - 运行记录已删除
    - 抓取任务已停止
    - 已入库页面数仍为 `7`
- 页面截图：
  - `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\aiCompanion\.temp\community-sync-running-delete.png`
