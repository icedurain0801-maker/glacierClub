# 告警帖子与评论独立展示和生成

Status: verified

## 行为

- 告警详情仅平铺 related_contents 中的命中记录，以“帖子”“评论”类型区分；按 ID 去重。不展开原帖、同帖其他评论、回复树。
- getAlert 停止查询原帖及整个评论树，related_threads 保留兼容空数组。
- AI 紧急告警冷却期去重增加 contentId；不同内容分别建告警，同一内容重复分析复用自身告警。混合多个内容的历史告警不能作为新命中的复用目标。
- 历史告警和关系表未删除、未回填、未拆分记录；历史命中内容在详情平铺展示。后续新告警按单条内容生成，因此告警与通知条数可能增加。

## 验证

- .tests/2026-10/2026-10-12/independent_alert_contents.test.js 4 项与 server/test/alertEngine.test.js 11 项通过。
- 覆盖：无原帖/其他评论扩展、帖子评论标签、转义、重复 ID 去重、空数据、接口停止树查询、同内容复用与不同内容单独建告警、拒绝混合历史告警复用。
- API、前端、采集 Worker、分析 Worker 均基于各自现役运行包生成 independent-alerts-r2，最小修改 repository.js、alertEngine.js、alert-detail.js。服务重启后 Running。
- 前端 release 校验 33 文件通过。API/Worker 候选包语法及 manifest 哈希核对通过；API 原 manifest 的 shared/riskModes.js、分析 Worker 原 manifest 的 aiAnalyzer.js 哈希过期，已核对复制文件与现役文件完全一致，再更新候选 manifest。未替换其代码。
- 正式接口真实告警 80fab51c-1153-4ca1-a551-31d5a1e02e14 返回 HTTP 200、related_threads=[]、2 条帖子命中；Edge 有界面浏览器打开告警管理详情，显示数量与接口一致，无评论树。
- 历史混合数据隔离回放在真实浏览器分别显示 1 条帖子、1 条评论，无原帖和其他评论；1440px、375px 无抽屉溢出，无 pageerror。该回放是隔离测试，不作为真实数据当前风险状态证明。
- 原截图告警 dac6f810-62fe-444b-a29e-fd858412605e 当前命中内容已被现役风险口径排除，接口返回空命中集合，此变化不是本任务进行风险重新分析产生的。
- 验证期间 API/前端现役被更新至 kind-pagination-r3；已核对新包保留本次详情改动，未覆盖其后续变更。两个 Worker 使用 independent-alerts-r2。
- 提交仅提取本任务代码片段、独立测试和本文档，不纳入共享工作区其他变更。未执行真实内容创建、告警处置或数据库迁移，自测未发送钉钉通知。
