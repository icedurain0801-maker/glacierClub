# 递进风险算法发布及历史范围预估

Status: 2026-10-12 已发布并通过真实外网浏览器验收；历史重判尚未执行。

## 授权与范围

用户在本会话明确选择“发布并预估历史重判范围”。只执行发布及只读预估，没有新增历史重判任务、改写历史等级或补发历史通知。

## 运行包

- API：`C:/ProgramData/PublicOpinion/releases/release-20261012-progressive-risk-v157-r2`
- Worker：`C:/ProgramData/PublicOpinion/releases/worker-release-20261012-progressive-risk-v157-r2`
- AnalysisWorker：`C:/ProgramData/PublicOpinion/releases/analysis-release-20261012-progressive-risk-v157-r2`
- Frontend：`C:/ProgramData/PublicOpinion/frontend3001/releases/release-20261012-progressive-risk-v157-r2`

各自从现役版本克隆，仅移植风险规则、提示词及解析、审计持久化、等级筛选和展示相关单元，不整体复制工作区。API 395 文件、两个 Worker 包各 408 文件、前端 33 文件的 manifest/依赖校验通过；三种后端候选均通过语义解析和审计持久化隔离验证。

执行 031 指定迁移，新增 po_analyses.risk_context 和 po_analysis_cache.risk_context nullable JSON，并核实两字段。迁移记录已写入 po_schema_migrations。原有历史记录保持原值。

四项服务实际进程路径已指向上述新包；API/frontend 健康检查通过。旧 AnalysisWorker 长时间 StopPending，经核实旧进程命令后结束旧子进程，再完成服务切换。恢复后 Worker/AnalysisWorker 均 Running。原始 XML 备份位于仓库根 `.temp/risk-ladder-release/xml-backups/`，旧运行包保留；回退可恢复各自 XML，新增 nullable 字段无需删除。

## 线上浏览器验收

实际启动可见 Chromium，无请求拦截或模拟响应。

- BigPlayer社区/超能世界国服版近7天：总内容4624，关注347、负面待处理8、紧急内容8，满足逐级包含。
- 关注列表347、负面待处理列表8，与卡片一致；当前告警事件3，与紧急内容数区别保留。
- 发布时间筛选、刷新、昨日/今日切换及1920/1280宽度通过，无pageerror。
- 证据：`.tests/2026-10/2026-10-12/risk-ladder-live-browser.json` 和 `risk-ladder-live-cards.png`。

以上历史等级未重新 AI 判断，仍是旧分析存量，新查询集合已生效。不能将历史显示8条紧急解释为已按新规则判定8条严重。

## 只读历史预估

详见 `v004_risk_history_estimate.json`。快照截止北京时间2026-10-12 00:00，筛选未删除、有发布时间、已分析且非v6策略的内容：

| 社区/平台 | 全部旧分析 | 近7天 |
|---|---:|---:|
| 超能世界国服版 / BigPlayer | 30069 | 5748 |
| 超能世界国服版 / TapTap | 2770 | 14 |
| 我要当老祖 / BigPlayer | 540 | 501 |
| Last Light / BigPlayer | 4295 | 259 |
| Last Light / Discord | 8289 | 53 |
| X-Clash / BigPlayer | 12318 | 0 |
| 合计 | 58281 | 6575 |

推荐第一批：超能世界国服版/BigPlayer，2026-10-05至2026-10-11，共5748条。当前light每批10条、deep每批20条，理想打满约575批light、最坏288批deep，不含重试；deep每日200次上限意味着最坏情况需跨天。金额依赖实际AI服务计费单价，待确认。

快照中既有队列light pending31020、retryable5、deep pending2，重判不能盲目追加重复任务或挤占现有队列。后续重判须明确隔离执行范围、预算和历史通知抑制，再获用户授权执行。此次未执行重判。
