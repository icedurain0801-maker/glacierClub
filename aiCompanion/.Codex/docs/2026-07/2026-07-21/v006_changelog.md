# v006 变更记录

## 变更内容

- 调整社区同步后台详情页的图片片段展示方式：
  - `image_fact` 片段不再只显示图片地址文本。
  - 后台现在会从片段内容中解析图片 URL，并直接渲染图片预览。
  - 同时保留原图链接，支持在新窗口打开查看。
- 普通文本片段、摘要片段、忽略片段的原有展示逻辑保持不变。

## 验证

- `node --check web/js/pages/communitySync.js`
- `node --check server/src/services/communityThreadSegments.js`
