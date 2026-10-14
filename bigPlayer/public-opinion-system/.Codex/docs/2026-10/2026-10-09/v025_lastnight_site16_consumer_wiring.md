# Site16 consumer 接线增量

Status: IMPLEMENTATION_IN_PROGRESS / NOT_FROZEN / NOT_EXECUTED

新增 `lastNightSite16Consumer.js`：在已认证账号锁/同连接session内接23-feed plan、TaskCheckpointStore和真实Connector listFeedContents/listComments，绑定language16/原窗/feed/root/anchor/cursor，已有feed cursor保segmentId，不调用shared worker、refresh或自行抢连接。

新增 `lastNightCommentPageGraph.js`：展开嵌套replies/children，保raw与explicit parent，拓扑排序，拒cycle/duplicate/异root/回复根分支。TaskCheckpointStore逐拓扑节点调用实际Repository（同外围事务），由真实父深度推导子深度；fresh写后校验实际scope/root/parent/depth；本页复用posts按INSERT IGNORE实际affectedRows补计数，避免跨feed重复计数；窗外replyTargets仅核实已存在同root父，缺父失败关闭。写前task_page_intent journal、全部节点成功才cursor/子cp/AI和单COMMIT。

graph+store10项开发测试通过，包含新父z/子a的lexical倒序嵌套回复，验证root UUID/parent UUID/depth与单COMMIT。consumer当前只有语法检查，未生产冻结；HTTP完整白名单、独立segment生命周期结束/恢复、全23任务完成证明、日consumer与Windows02入口仍待接，不能把consumer模块视作可运行生产全链。

x5YQo8五文件及旧544保持不变；QA v030已条件GO给经理单页inspect/execute，等待真实结果。未生产DB/HTTP/DDL/push/重启。

追加：新增lastNightSegmentFinalizer，consumer正常预算退出后将独立run明确partial/finished_at/清run lease，cp保持持久idle cursor；任务全完成时completed_authorized_scope但仍不声称全链。finisher source/run owner/epoch/live fencing、prepared/commit/committed journal、未知COMMIT保持pending禁止二次执行。graph/store/finalizer共12项自测通过。尚未覆盖consumer异常后的run收口、session重入/HTTP全白名单、新完整CLI或02安装，继续实施。

单页forward因锁等待撤回x5YQo8执行，已另AtcaLQ目标锁新候选交QA；本consumer增量不在其544+7闭包，未改变新冻结文件。

追加consumer整段fixture1项通过：23个9站completed descriptor转换16plan，实际loadPage分发到Connector边界，空页cp事务完成后预算退出，独立run partial收口并清lease；此为接线fixture非真实HTTP。异常收口/完整入口/02仍待实现。最新单页诊断候选lYJYzP冻结不改。
