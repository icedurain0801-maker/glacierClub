# 口碑趋势隐藏零值暂未分析

Status: released

用户要求：暂未分析为 0 时不显示。

修改 ../admin/PublicOpinion/assets/app.js 的 renderTrend：暂未分析汇总大于 0 才渲染指标；每个日期的暂未分析柱组和悬浮文案也只在该日大于 0 时显示；图例在汇总或日期存在未分析内容时显示。空数据和后续切换重新计算显隐，避免残留。正向率、负面率、中性率、已分析数量及总量口径保持原有计算。

修改 ../admin/PublicOpinion/index.html：给暂未分析图例增加专用 ID，初始隐藏，并更新 app.js 静态资源版本。

前端包 release-20261012-hide-zero-unclassified-r1 基于发布前现役 release-20261012-kind-pagination-r3-urgent-module-r1-r2-r3，只修改 app.js、index.html 和 manifest，逐文件哈希比较确认差异范围；33 文件 manifest 校验通过。只切换并短暂重启前端3001，旧包及服务 XML 快照保留。不修改 API、Worker、数据库，不采集或重新分析。

Node 语法及 git diff --check 通过。Edge 对候选和发布后实际静态页面调用同一 renderTrend 验证：0 隐藏、3 显示、3→0 隐藏、两个日期仅非零日期显示柱组、空数据隐藏图例、正向率 55% 计算不变。边界数据仅在浏览器内渲染，不写入数据库；浏览器无脚本错误，无写请求。

证据：.tests/2026-10/2026-10-12/hide-zero-trend-candidate.json、hide-zero-trend-live.json、hide-zero-trend-browser.cjs。
