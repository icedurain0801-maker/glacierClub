# 下一阶段独立任务流与日路由

Status: IMPLEMENTATION_IN_PROGRESS / NOT_FROZEN / NOT_EXECUTED

## 方案 A 批准后增量

用户批准：独立执行器模块、仅隔离可运行入口，生产继续失败关闭；生产只读规模评估交项目经理串行执行。

新增 `lastNightTaskCheckpointStore.js` 及测试：使用实际 Repository 方法的 SQL fixture，检查占位符数量、legacy列转换、source/run fencing、精确根帖UUID/父评论UUID/层级、时间窗、membership板冲突，复用历史只新增本请求关联不改正文，空页保存cursor不视为首次；COMMIT未知保持pending，禁止下一次写入覆盖未知状态。7项测试通过。此验证不连接真实数据库，不代表生产store已放行。

新增 `lastNightSite16IsolatedExecutor.js`：仅显式注册的进程内fixture可执行，生产mode拒绝；`scripts/lastnight-site16-isolated.js --isolated` 是离线验证入口，不是生产采集入口。连同taskflow/store共12项通过，productionExecuted=false/fullChainComplete=false。现有puy4g8 inventory仍544/544。

新增 `lastNightRecoveryFailureContract.js`：详情诊断仅输出hash ID/类型/完整性status/固定code白名单，不输出正文、URL或Token；原page journal与已提交resume journal通过两份明确批准SHA绑定同account/parent及epoch+1，保原cursor。2项纯合同测试通过。该合同尚未接认证读入、锁内checkpoint复核、inspect hash、新恢复CLI，不能用于生产恢复。

现场由经理/QA报告：site2补页PASS；site16 page1 PASS，cp37e7513d保持idle/offset20/page2；page2返回LAST_NIGHT_DETAIL_EVIDENCE_REQUIRED，未产生新page run/journal，owner接棒已提交epoch1537。旧journal token1536不能重放。现有结果无item诊断，具体是类型、ID还是fallback原因仍待确认；不再HTTP盲探、不降低详情门槛。后续必须新候选独立QA。

只读模块审查发现待补：嵌套comments/replies flatten及同页父子拓扑写入、fresh写后精确身份校验、reply分支归属、复用计数去重、窗外已存在父节点的replyTargets合同，以及认证接棒后失败的完整恢复入口。未完成16全feeds/comments、02consumer/安装/崩溃恢复；生产执行保持NO_GO。未push、未DDL、未改现役与冻结544闭包。

本项在puy4g8独立QA期间仅新增文件，不修改该544闭包。已用verifyInventory核544全部匹配。

新增lastNightSite16TaskFlow：严格从9已完成23个feed descriptor绑定account/原窗口，转换16任务，不采9；按持久store接口读取未完成任务、保存cursor和页面提交、同事务发现comments/replies任务；预算返回PARTIAL_RESUMABLE，completed不重抓。当前store/page消费者接线未完成，不能把注入fake测试当实际全站入口。

新增lastNightLegacySlotWinner：同账号锁→schedule/source/account/registry→source+scheduled唯一键，旧slot存在返回明确OTHER_OWNER而不是日成功；独立先赢则legacy真实列parent+三子在同事务born running、owner/epoch/LIVE lease，精确前一上海自然日窗口及next+24h，不依赖缺失board/snapshot列。认证journal绑定原URL/config。consume必须连续接棒，完整消费尚未接线。

新增lastNightDailyRoute：采用现役实际识别的目标源active_window空时间段 `{start:'00:00',end:'00:00'}`，关闭共享周期eligible，不填无效scheduleOwner。这是目标源路由配置变更，只限海外source；应用前需完整独立consumer已安装、旧shared任务终态且无active owner/checkpoint，经理串行执行新冻结QA后的inspect/hash/CAS。只改target active_window、frequency86400、source/state version及epoch，保config/history/last-next，不调用通用disabled API。独立consumer必须校验该路由合同才能运行每日slot；当前不应用。

真实release sourceScheduler直接导入纯模块做离线验证：1440分钟activeWindowAllows均false，国内null窗口不变；路由已生效后Windows先/sharedscan先两序均shared零claim/零enqueue。此测试不代表已安装Windows入口或完成日采。路由切换前shared先赢的旧slot必须先处理，不能把独立零HTTP退出当成功。

版本陷阱：真实release schedulerRepositoryAdapter只blockqueued/running，工作树新版才识paused。因此长期paused协调行不构成现役永久路由，已否决；sourceEligibility不识外部config owner。有限lease/改next不能宣称长期唯一owner。进程崩溃恢复也须route与每页run/source fencing，不能仅假账号锁永久有效。

目前新增flow/route5项开发自测通过，legacy slot仅语法通过，实际SQLfixture及消费者接线、日入口安装/恢复/QA均未完成。未DB/外部请求、未更改现役、未注册任务；继续原单，后续合并时另新freeze，不提前改变puy4g8源码。

追加：legacy slot新增事务SQLfixture3项，自建父三子都running且严格日窗后才consume、shared先赢不调用consume、COMMIT未知不启动采集且不重试；本阶段总8项自测。slot入口已强制source.active_window等于已转移路由合同，频率86400不单独放行。现有same-slot OTHER_OWNER返回仍仅拒重复，不记日成功；路由生效前旧shared任务必须先收口。生产store/consumer及Windows安装接线仍未完成，route不得先行应用。
