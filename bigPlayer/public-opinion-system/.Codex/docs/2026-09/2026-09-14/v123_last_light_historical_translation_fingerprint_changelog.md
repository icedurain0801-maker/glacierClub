# v123 Last Light 历史译文指纹回填

## 根因

- 帖子 external ID `1460016` 的原文与历史译文正文均为 `8`，但 `po_content_translations.content_fingerprint` 和对应 `po_translation_jobs.content_fingerprint` 仍为旧值。
- 内容详情 SQL 按当前内容指纹连接译文，因此历史译文被过滤，页面显示“暂无中文翻译”。

## 修复

- 仅针对 content ID `5d7d3671-4881-48b3-bcc3-898a3356f2cf`，在单事务中将译文记录和 `completed` job 的 fingerprint 同步为当前 `po_contents.fingerprint`。
- 受影响译文记录 1 条、任务记录 1 条；未调用模型、未重译、未修改其他内容或抓取/调度/分析逻辑。

## 验证

- 定向只读查询断言通过：返回 `status=completed`，译文与内容 fingerprint 一致，`translated_body=8`。
- 待测试负责人在详情页复测：`https://lfy3001.dev.q1op.com/admin/PublicOpinion/content.html?regionCode=overseas&communityId=00000000-0000-0000-0000-000000000102&platform=bigplayer_h5&postId=1460016&publishedFrom=2026-09-07&publishedTo=2026-09-14&contentType=post&contentMode=post&contentId=5d7d3671-4881-48b3-bcc3-898a3356f2cf`。
