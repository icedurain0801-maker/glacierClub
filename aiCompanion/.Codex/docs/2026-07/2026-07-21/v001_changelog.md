# v001 变更记录

## 变更内容

- 调整社区同步的 `maxPages` 语义：`0` 或空值均表示“不限”。
- 后端配置保存改为保留 `0`，不再把它回退成默认的 `500`。
- 通用社区抓取器和 Q1 抓取器都支持“无限页”模式，不再因为 `maxPages <= 0` 提前停止。
- 后台 `admin.html` 的社区同步页面增加了明确交互提示：
  - `最多抓取页面数` 字段支持留空；
  - 占位文案改为 `0 或留空 = 不限`；
  - 新增说明文案，提示正整数才表示上限。
- 将当前版本 `灯塔·国内` 的社区同步配置从 `500` 调整为 `0`，使现网后台直接表现为“不限”。
- 社区同步写库阶段新增内容去重：
  - 同一页面 URL 且 `content_hash` 未变化时，直接跳过知识库重写；
  - 同一版本下不同 URL 但正文内容相同，会复用已有 `entry_id` / 向量，不再重复 embedding；
  - 页面内容变更时，仅在旧 `entry_id` 不再被其他页面引用时才删除旧知识条目，避免误删共享数据；
  - `kb_documents.row_count` 改为按唯一 `entry_id` 统计，和实际写入知识条目数保持一致。

## 验证

- `node test/communityCrawler.test.js`
- `node test/communityQ1Crawler.test.js`
- `node test/communitySyncWorker.test.js`
- `node -e "require('./src/services/communityQ1Crawler'); require('./src/services/communityCrawler'); require('./src/services/communitySyncSettings'); console.log('service-load-ok')"`
- 重启后端后检查 `http://127.0.0.1:3100/api/ping`
- 打开 `http://localhost:8080/admin.html`，登录后台，进入“社区同步”，展开“高级配置”并截图：
  - `.temp/admin-community-sync-unlimited.png`
  - `../.temp/admin-community-sync-dedupe-logged.png`

## 结果说明

- 当前后台页面中，`最多抓取页面数` 已显示为空值，placeholder 为 `0 或留空 = 不限`。
- 当前版本的实际配置值已更新为 `0`，后续手动抓取和定时抓取都将按“不限页数”执行。
- 当前版本下，相同抓取内容不会重复写知识库和向量；即使不同页面地址返回相同正文，也只会保留一份知识条目，减少 token 消耗。
