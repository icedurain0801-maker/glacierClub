# v002 变更记录

## 变更内容

- 新增 `community_sync_image_analysis` 缓存表，按 `version_id + image_hash` 复用图片分析结果，避免同图重复调用多模态模型。
- 新增 `server/src/services/communityImageAnalysis.js`，负责图片下载结果归一化、hash 去重、缓存读写和“有用文本”提取。
- 通用 HTML 抓取新增页面图片提取能力，支持从 `<img>` / `<source>` 收集图片地址，并允许同主域 CDN 图片参与分析。
- Q1 社区抓取新增富文本图片提取能力，帖子正文、评论、回复中的图片会做分析，并把有价值文本追加到页面内容后再入知识库。
- 图片分析失败会降级为跳过单张图片，不会让整次社区抓取直接失败。

## 验证

- `node test/htmlText.test.js`
- `node test/communityImageAnalysis.test.js`
- `node test/communityCrawler.test.js`
- `node test/communityQ1Crawler.test.js`
- `node test/communitySyncWorker.test.js`
