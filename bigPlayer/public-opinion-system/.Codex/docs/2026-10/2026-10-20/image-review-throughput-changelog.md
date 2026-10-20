# 图片审核吞吐优化（未发布）

## 状态

候选实现已完成专项测试，但未发布。真实冷启动验收未达标：30 条内容、30 张不同图片路径，第二轮耗时 69.3 秒，仅 11 条完整成功；其余为上游图片/复核超时或响应校验失败。按约束不得把失败或待复核算作完成。

## 已实现

- 图片下载独立限流，成功图片按实际字节 SHA-256 缓存，签名变化但字节不变可复用。
- 图片视觉识别按 4 张/批、请求体上限拆分，最多 6 路视觉请求并发。
- 批量响应强制 `imgN` 唯一 ID；缺失、重复、跨图证据会隔离为单图重试，仍失败则该图失败，不生成 complete 证据。
- 独立复核支持 10 条微批，逐条校验原文 quote、sourceHash、contextHash 和风险证据；不接受跨条引用。
- 图片 OCR revision 纳入分析缓存键，避免旧 OCR 结果跳过新识别。
- API 发布校验器补充正式依赖 `shared/singlePostOutput.js`，未删除该文件。

## 验证

- `node --test server/test/imageAnalysisThroughput.test.js server/test/facebookImages.test.js server/test/contextualSecondaryReview.test.js`：29/29 通过。
- 真实浏览器/只读 API 冷测产物：`.tests/2026-10/2026-10-20/image-throughput-live.json`、`image-throughput-provider.json`。
- 网关返回模型与请求模型不一致（视觉请求 `gpt-4.1-mini` 实际返回 `gpt-4.1-nano`；复核请求 `gpt-5.6-luna` 实际返回 `gpt-6-luna`），本机环境无路由配置，未修改外部服务。

## 后续

需要继续把初判完成后的复核输入先集中成明确的 10 条批次再发送，并对网关 429/5xx/超时做有界重试；完成率和完整链路耗时均达标后，才按最新现役包生成并发布后端候选。
