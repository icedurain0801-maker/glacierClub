# 概览风险卡片排序与底色

Status: 已发布，外网浏览器验收通过

按用户要求，概览总量卡片之后的三张卡片由“负面内容、关注级内容、当前告警”改为“关注级、负面待处理、紧急告警”。底色依次为浅橙 `#fff4e5`、深橙 `#ffe0bd`、红色 `#ffd6d6`；标题、数字、说明和图标采用对应的深色文字。

修改 `../admin/PublicOpinion/assets/app.js` 的卡片顺序、标题和样式类；修改 `../admin/PublicOpinion/index.html` 的局部样式及app.js缓存版本155。沿用原卡片数据字段attention、negativeCount/negative、activeAlertCount，仅调整展示，未修改统计口径或业务数据。

运行包基于当时现役前端release，仅提取上述renderMetrics函数、局部CSS与资源版本，未将工作区其他改动带入。前端3001已切换至 `C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261010-overview-risk-order-v155`，旧包及XML备份保留。API、登录服务和Worker未重启。

验证：JS语法、git diff --check及33文件运行包manifest通过；发布前与发布后Edge浏览器均确认三张卡片顺序、标题和实际计算底色符合要求，无页面JS异常、无业务写请求。外网截图完成视觉检查。证据位于仓库根 `.temp/sync-auth-persistence-fix-20261010/overview-published.png`；检查脚本为同目录 `check-overview.cjs`。

依据用户本会话授权，类似界面修改完成自测后直接发布，未重复请求发版确认。
