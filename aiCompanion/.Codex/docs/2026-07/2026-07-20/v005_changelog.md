# v005 变更记录

## 变更内容

- 为社区同步后台的“最近运行”列表增加删除操作列，支持直接删除已结束或失败的运行记录。
- 新增后端接口 `DELETE /api/community-sync/runs/:id`，按当前版本删除指定运行记录。
- 删除运行记录前，先将关联 `community_sync_pages.run_id` 置空，避免历史页面记录和已入库知识内容被误删。
- 对 `running` 状态的任务增加保护，运行中的任务不允许删除。
- 为删除按钮补充禁用态样式和文案，避免误操作。

## 验证

- `node --check server/src/services/communitySyncWorker.js`
- `node --check server/src/routes/communitySync.js`
- `node --check web/js/pages/communitySync.js`
- `node server/test/communityCrawler.test.js`
- `http://localhost:8080/admin.html` 返回 `200`
- `http://localhost:3100/api/ping` 返回正常
- 使用后台登录态实测 `/api/community-sync/runs/:id` 删除成功，运行记录数量由 `2` 变为 `1`
- 使用后台页面实际点击删除按钮并确认弹窗，列表刷新后运行记录数量由 `1` 变为 `0`
- 本地截图确认后台“社区同步”页面正常渲染，删除前后截图分别为：
  - `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\aiCompanion\.temp\community-sync-delete-run.png`
  - `C:\Users\Administrator\AppData\Roaming\Code\User\project manage\aiCompanion\.temp\community-sync-delete-run-after.png`
