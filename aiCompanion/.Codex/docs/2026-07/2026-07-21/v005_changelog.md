# v005 变更记录

## 变更内容

- 取消社区爬取 `maxPages` 的 `500` 默认上限：
  - 服务端环境默认值改为 `0`，表示不限页数。
  - 后台社区同步页的默认值、表单回填和帮助文案统一为“不填或填 0 = 不限”。
  - 新增迁移 `012_community_sync_unlimited_max_pages.sql`，把数据库里旧的 `500` 默认值和历史配置一并改为 `0`。
- 修复“停止抓取”时删除运行记录容易超时的问题：
  - 删除运行中的 run 时，先发起 `abort`，只短等待 1.5 秒。
  - 如果 run 还在收尾，接口立即返回 `202 stopping`，不再卡到 30 秒超时。
  - run 真正结束后，后台自动清理该 run 关联的页面、分段和本次写入的知识库内容。
- 收敛社区同步后台前端状态逻辑，保留新的 `stopping/cancelled` 展示，避免重复函数定义互相覆盖。
- 新增回归测试，覆盖“运行中删除快速返回 stopping，随后自动 purge”的链路。

## 验证

- `node test/communitySyncWorker.test.js`
- `node test/communityCrawler.test.js`
- 直接执行 `server/migrations/012_community_sync_unlimited_max_pages.sql`
- `GET http://localhost:3100/api/ping` 返回 `{"ok":true,...}`

## 备注

- 全量执行 `node migrations/run.js` 时会在历史迁移 `011_community_sync_thread_segments.sql` 处因为旧外键重复而失败；本次已直接执行新增的 `012` 迁移，不影响当前需求交付。
