# 独立有界恢复候选

Status: QA_PENDING / NOT_EXECUTED

本项只交最小可执行阶段：当下父子终态 inspect/hash/CAS → 同连接同账号锁源lease接棒 → language2精确offset50下一页 → language16首次merged页。无shared Worker导入，无DDL，不改国内、共享Connector或算法；60JPM6旧证据保留，源码变更后旧包不再执行。

新模块：lastNightCatchupHandoff（父聚合/source owner epoch）、lastNightExactRecoveryPlan（当前窗口精确id、排除9月）、lastNightBoundedRecoveryPage（独立page事务）、lastNightIndependentContent（incoming integrity和request/provider board分离）、lastNightLegacyDailyContract（真实legacy列/固定上海日窗纯合同）。入口scripts/lastnight-catchup-handoff.js，完整inventory/build脚本增加新闭包。

inspect-handoff只读并ROLLBACK；apply-handoff独立执行被拒，必须与恢复consumer原子接棒。恢复stage为recover-catchup-bounded-pages；也有recover-site16-first-page限定子阶段。批准计划须完整manifest/Node/CLI hash/account/identity/env/output/evidence目录及恢复输入SHA；现场只由经理串行且独立QA GO后执行。

父允许未领取queued（含RECOVERED）或回收器failed/POISONED，拒running、新owner、状态hash漂移；按当下status/error/attempt/epoch/updated CAS聚合partial，child历史不写。累计计数不当唯一内容。schedule先锁，与现役scheduler同序；lease旧owner/epoch CAS后+1，300s仅临时互斥，120s全阶段deadline，同连接账号锁连续持有，页提交前复验source LIVE token，不以此称每日唯一owner。

language2精确检查点0205567a-70c3-4ca2-a416-456ef2f09a66、原ISO七天window、原taskKey，offset50下一页，不退0、不因旧页oldest跨窗口而跳请求。现役commit成功才更新stage.cursor，items3不是必漏存；本次按经理/QA更正移除误门槛。实际page结果决定partial/completed，checkpoint推进、内容和关联同事务；COMMIT未知不盲重试。

language16只首次merged页，20条预算；不抓language9。实际detail fallback拒；incoming provider board未知与request board100017分开，不伪补provider事实。既有type-only内容只精确关联及membership复用，正文/raw/fingerprint保持原样；新内容沿现有Repository pinned算法经legacy SQL适配入库，AES-GCM exclusive fsync journal在提交前后留证，新增内容入现有sentiment-v1 light消费者队列。既有AI不改算法，不冒称全集完成。

剩余明确未完成：language16其余22 feeds/comments/replies与持久续页、历史精准详情修复、AI全集完成观察、legacy日slot数据库执行和长期02目标源路由。纯日窗合同拒现役6h frequency，固定上海02前一自然日；当前未创建任务或改frequency/next，不能宣称周期唯一入口。阶段成功仍fullChainComplete=false。

开发受影响自测：handoff6、content/daily2、bounded page/selection3，共11项通过（fake DB/connector，不是现场PASS）。还需独立审查与QA；新包在确认审查修复后冻结并提供清单。原已过未变基线不重复全量。

## 首阶段正式冻结交接

中间iwZBaB撤回、禁止执行。正式阶段候选根 `.temp/bigplayer-recovery-20261009/lastnight-runtime-puy4g8`，完整manifest及各stage未批准模板。默认建议先 `inspect-handoff` → `recover-site2-page`，明确只恢复2失败task，不把首屏当16完成；其提交后journal供 `resume-recovery-page`。2 completed journal可在同一后续resume进入16首次merged；idle journal从保存cursor下一页，不要求旧父queued，不重抓completed。完整23feeds/comments/replies循环尚未落地，不能把本阶段放行扩大至全站或日入口。

新增lastNightRecoverySession：认证已提交page journal的source/account/config/version、保存cursor；同账号锁下只允许原source token仍匹配且无active run，CAS换新owner/epoch取得300s有界lease，原子进入下一page；source已换owner/epoch即拒，不绕过共享竞争。COMMIT未知或已提交journal失败区别报告，deadline race共享commitState避免误降成普通超时。旧source token到期不就地续租；仅认证恢复明确新epoch接棒。每次120s预算内完成一页，下一次调用需新的批准计划/唯一output。

已修本地审查发现：输入hash/精确cursor在任何handoff写前检查；明确foreign board/raw.board_id或membership冲突拒；unknown历史只复用不覆盖；外层不得对page commit unknown再ROLLBACK；共享deadline提交阶段保UNKNOWN；finishedNULL的真实16 poisoned终态不伪造旧历史。

最后受影响开发验证15/15：handoff7（含combined COMMIT timeout）、content/daily2、boundedpage/selection3、实际Repository legacySQL+AI方法1、恢复session2。实际Repository测试使用真实prototype方法和录制fake连接，验证board列SQL/params删减与pinned事务、sentiment-v1 light/current fingerprint，不是现场DB验收。语法检查及已修改构建/清单文件diff-check通过。独立QA仍待判定，经理GO前不执行。源码在该阶段交QA后冻结；余项另做新包，不悄改本包依赖。
