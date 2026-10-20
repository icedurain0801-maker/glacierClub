# 概览详情来源字段改为帖子 ID

Status: released

- 修改 ../admin/PublicOpinion/assets/app.js 的 renderOverviewContent：来源信息中“来源链接 / 打开来源”替换为“帖子 ID”。帖子和动态使用 external_id，评论使用 originalPost.external_id；缺失时显示“暂不可用”，不回退内部 UUID 或评论 ID。输出经 esc 转义。
- 使用当前已运行前端包，仅替换该字段并更新 index.html 的 app.js 缓存版本；46 文件运行包校验通过。切换 PublicOpinionFrontend3001 后 HTTP 200，原包和 XML 保留在仓库根 .temp/overview-post-id-20261014，可回滚。无 API 或数据库变更。
- 现有概览回归 5 项、node --check、限定路径 git diff --check 通过。
- 线上真实详情验收：帖子/动态显示帖子 ID 928248；评论显示所属原帖 ID 928213，与原帖 URL postId 一致。来源信息不再显示来源链接。
- 截图：.tests/2026-10/2026-10-14/overview-post-id-live.png。运行包信息：同目录 overview-post-id-release.json。
- 未逐一抽查所有社区；所有概览帖子及评论详情共用该渲染函数。
