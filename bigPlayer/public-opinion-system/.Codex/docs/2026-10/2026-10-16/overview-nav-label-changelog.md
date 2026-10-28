# 数据概览导航名称

Status: 已发布并完成浏览器验收
日期：2026-10-16

按截图仅去掉左侧导航“舆情数据概览”的“舆情”两字，名称改为“数据概览”。页面主标题、链接、图标及权限保持原逻辑。

修改共享`../shared/sidebar-data.js`中两处菜单名称，并更新8个舆情页面的导航脚本缓存版本。现役包增量更新，运行包`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261016-overview-label-r1`。47文件manifest及语法校验通过，实际浏览器刷新后导航显示“数据概览”。仅重启前端3001，原包和XML保留；未另行更新BaaS托管版本。
