# 风险告警管理统一紧急内容列表

日期：2026-10-12
Status: released

## 原因与修复
风险页原读取 /alerts 告警事件，历史紧急内容没有对应事件而漏显示。改为与内容管理一致的 /contents?riskMode=urgent&severity=urgent，统一合并 negative 和 urgent 内容；不创建历史通知或改动通知策略。

修改 ../admin/PublicOpinion/assets/alerts.js 与 ../admin/PublicOpinion/alerts.html。默认北京时间近7天，支持今日、昨日、近30天、全部历史及日期筛选；处理状态使用 handlingStatus；20条分页并使用 meta.total；详情链接携带社区、时间与内容ID进入内容管理处理入口。优质内容审核保留。

## 验证
- 8项独立审核回归通过；语法及 diff 空白检查通过。
- Edge 候选浏览器验证：同社区近7天8条，与内容统计及逐条ID一致；全部历史35条；真实详情、质量模块、历史范围刷新恢复通过。模拟25条分页、翻页刷新恢复、状态筛选重置页码、HTML转义、非法日期检查通过。
- 发布后外网Edge只读验收：近7天8条、全部历史35条，详情与质量模块通过，无浏览器脚本错误。
- 外网两个资产 HTTP200，SHA256与发布包一致；3001实际进程49184指向新包。

## 发布
前端服务短暂重启，API/Worker及数据库不变。发布前发现现役包有更新，重新从最新包定点覆盖两个文件，保留其他变更。
现役：C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261012-risk-list-1791794697454
回滚基线：C:\ProgramData\PublicOpinion\frontend3001\releases\release-20261012-happy-three-kingdoms\

证据：.tests/2026-10/2026-10-12/risk-list-candidate.json、risk-list-live.json、risk-list-assets.json及对应截图。数量是验收时快照，后续采集分析会变动。
