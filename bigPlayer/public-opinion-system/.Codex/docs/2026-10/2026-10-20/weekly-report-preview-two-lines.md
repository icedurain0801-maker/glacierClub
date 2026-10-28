# 周报收起摘要改为两行

用户要求周报收起摘要从三行改为两行。修改 `../admin/PublicOpinion/index.html` 中预览的两个 line-clamp 值为2，高度上限随1.9行高调整为3.8em；展开全文逻辑保持不变。

用户弹窗批准后已切换现役 `release-20261020-weekly-two-lines-r1`，基于原现役r2仅替换首页中标题和行数，不整包带入工作区改动。48文件manifest校验通过，前端服务Running，3001健康检查和4320 API健康检查200。

外网 `https://club-opinion.q1.com/admin/PublicOpinion/index.html` 实际返回200，包含“上周社区运营周报摘要”及两个2行clamp和3.8em高度限制，不再含旧标题。Chrome工具切换前后均返回 `Transport closed`，浏览器视觉验收尚未完成，不将HTTP校验当作浏览器通过。

回退XML：仓库根 `.temp/playwright-mcp-connect/PublicOpinionFrontend3001-before-weekly-two-lines.xml`。不推Git、不发布静态托管。
