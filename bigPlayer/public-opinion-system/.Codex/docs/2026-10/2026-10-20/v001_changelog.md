# 关键词展示门槛修复

日期：2026-10-20

## 变更

- 概览讨论关键词仅展示被至少 2 条不同内容提及的词。
- 规则兜底统计使用同样的最小数量门槛。
- AI 关键词部分完成时不再因为过滤结果为空而回退到单条原文泛词。
- 未修改 AI 提词缓存版本，不触发重新提词；未切换采集、分析、登录或前端服务。

## 验证

- `server/test/feedbackTopics.test.js` 与 `server/test/feedbackTopicsThroughput.test.js`：17 项通过。
- 候选 API `release-20261020-keyword-min2-api-r1`：语法检查通过。
- 现役 `PublicOpinionApi`：切换后 `/health` 返回数据库 `ok`。
- 真实 Edge 页面概览验收：关键词云显示 1 个词，页面文本显示 `2 条反馈`，未出现单条反馈词；页面正常加载并生成截图：`.tests/2026-10/2026-10-20/overview-keywords-min2-browser.png`。

## 发布记录

- 切换前现役：`release-20261020-facebook-ecosystem-l3-api-r5`
- 切换后现役：`release-20261020-keyword-min2-api-r1`
- XML 备份：`E:/CodexData/projects/.temp/PublicOpinionApi-20261020-before-keyword-min2.xml`
