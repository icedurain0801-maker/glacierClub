# 单帖抓取分析进度条

日期：2026-10-20

## 变更

- 单帖抓取分析任务新增抓取进度条和 AI 分析进度条。
- 抓取阶段显示动态进度状态和已抓取数量；由于平台没有稳定的总量，避免伪造百分比。
- 分析阶段显示已分析/已抓取数量和准确百分比；完成、部分完成、失败分别使用不同颜色。
- 保留原有页数、抓取数、分析数和阶段文字。

## 验证

- `node --check ../admin/PublicOpinion/assets/single-post-analysis.js` 通过。
- `server/test/singlePostAnalysis.test.js server/test/singlePostHttp.test.js`：18 项通过。
- `git diff --check` 通过。
- Edge 浏览器模拟排队/抓取/分析进度：确认显示两条 progressbar，`160 / 207` 显示为 `77.3%`，页面无脚本错误。
- 浏览器验收截图：`.tests/2026-10-20/single-post-progress-browser.png`。

## 发布状态

本次已完成代码和浏览器自测，尚未发布到现役前端服务。
