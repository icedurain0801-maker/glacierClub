# 未完成辅助改动及独立剩余范围只读核查

Status: READONLY_REVIEW / AUXILIARY_CHANGES_NOT_RELEASED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Owner: 开发负责人

本轮不重试已停止的恢复 proof，不修改业务代码、不运行数据库/HTTP/AI、不操作现役服务。文档记录不修改经理 v033 待办。

## 四项辅助改动证据

1. `server/src/db/overseasScheduledExecutionGate.js:43`：verify 无论失败原因均 destroy；close 在53行先撤销 alive，故执行回调尚未结束时再次 verifyExecution 会在25/43行销毁持锁连接，绕过56行等待 drained。竞争路径是 close→alive=false→在途verify→destroy→连接锁释放→work尚未结束。尚未集成，不能声称当前 factory 已发生双执行；这是确定的工具生命周期缺口。
2. 同文件44-56行：若 work 内 await gate.close()，close 等 drained，而 drained 仅 work 退出的 finally 解析，形成等待环；若 work 永不返回，close 也无总等待期限。3000ms查询超时不涵盖任意 work。
3. `server/src/db/overseasScheduledIsolatedTarget.js:19`：`targets.get(target)?.repo!==repo` 在未登记target且repo为undefined时，两边均undefined而不拒。本轮无DB纯诊断确认 `assertScheduledIsolatedTarget(undefined,undefined)` 与 `assertScheduledIsolatedTarget({},undefined)` 均ACCEPTED。现有store先检查repo，gate后续访问repo.pool可能TypeError；未发现因此实际可访问数据库，但品牌检查本身确实退化，不可放行。
4. `worker/src/overseasScheduledRequestJournal.js:84`、`worker/src/overseasBigPlayerRunContractJournal.js:95`、target位置访问器仅定义/导出，没有现有调用方。返回冻结位置副本不等于完成跨目录组合核验；现有journal文件格式和读写逻辑未改。共享run-contract模块仍须回归。

调用链搜索范围为server/worker/scripts：gate仅在`scripts/overseas-isolated-scheduled-checks.js:101`的inspection原语分支被调用；factory、dispatch、PageStore、audit均未接入gate，run/verifyExecution暂无外部调用。旧冻结包不受活动树改动影响，不将旧PASS扩展到新生命周期。

## 独立范围初步判断

异常覆盖现有mainchain使用原first-claim proof，不依赖已停止的新execution proof；pageSize20第二页失败可通过合成transport按feed路径/offset注入，不能以全局请求序号代替。正常pageSize20默认connector预算约500页，已有feedMaxPages构造参数但factory未暴露；可评估测试专属有界预算注入或真实默认预算夹具，须明确不冒充生产预算。员工只读评阅进行中。

AI精确allowlist/持久预算/通知与parent/cursor锁序独立评阅进行中；尚未得出执行许可或完成结论。恢复proof中断不是这些项的笼统账号权限门禁。任何后续实现仍沿已批准隔离范围，生产/国内不扩大。

## 三员工只读评阅接收（未实现、未 QA）

### 异常覆盖：可以独立继续

现预算脚本40行用pageSize10000，connector899行默认预算为ceil(10000/pageSize)；pageSize20为500。建议新隔离场景显式feedMaxPages=2、pageSize20、每feed两页各20项、nextOffset20/40；核provider_pagination_budget_exhausted、第二页已提交、CP安全offset40/segmentPagesFetched2，明确不是默认500页穷尽实测。现factory93行adapter未显式接env，须限定单一合成候选实例参数，不改现役配置。

首提交后第二页transport异常：按完整feed身份/offset20定位请求；抛错前读取并核本feed已持久CP offset20和首页内容，详情响应须按postId匹配、commentCount0/评论空，避免旧固定2300详情干扰。失败后CP failed仍保留首安全cursor/items/last_item、lease释放；首页内容/run links/pending jobs保留；child/audit partial且parent/state/source全行不变。worker551/558/571为先提交再处理预算边界，685/696为失败保留stage.cursor。两个新场景都不需要新恢复proof、真实HTTP或AI。未执行，不报PASS。

### AI精确消费、预算、通知：可以先独立设计/纯测

| 证据 | 缺口与独立范围 |
|---|---|
| overseasBigPlayerPageJobs14/20/34 | 入队校fingerprint/版本并锁jobs，不构成冻结消费授权集合。 |
| worker231/265/280、264/304 | 分析contentIds二次范围校验已有，但无jobId/fingerprint/profile/version精确tuple；仍遍历light/deep并可能升级，不能声称仅批准light。 |
| repository731、worker288/292 | 分析claim未核job/current fingerprint相等，当前正文可能带旧job fingerprint记结果。 |
| repository662/756 | 分析结果写与job finish分离，finish缺running/live lease/current fingerprint全tuple fence；不能宣称原子可信完成。 |
| translationWorker31/55/62/86、repository904/841 | 翻译受控入口可筛job/content，但contentIds会补队列、claim前缺fingerprint核验；完成事务可拒旧结果但可能已花调用预算，priority完成后会回全局循环。 |
| aiAnalyzer101/199、repository824 | 分析预算进程内、重启重置且重试循环前仅计一次；usage统计不等价持久准入。 |
| repository831、aiTranslator48/53/80 | 翻译全局UTC每日reserve已有，不是本批cap；独立构造可能内存fallback，受控设计必须强制持久reserve、逐网络尝试计数、不退款。 |
| worker312、alertEngine124/126、dingTalkNotifier8 | 可能真实通知，冷却不是本批精确渠道许可；隔离默认disabled，只用合成outbox。 |

下一安全范围：纯manifest精确tuples/source/account/game/community/window校验、fake repo/AI/notifier负测、持久预算合成设计、独立结果集合hash核验；不调用现役buildDeps，不真实消费或通知，不把pending当完成。

### parent/cursor：可以先独立政策/证据纯测

boundAudit119明确scheduled child无sourceEffect且parent aggregate未实现，138/142只结束child/audit；factory66屏蔽旧parent/source结束，admission100设置parent/state lease但无terminal释放接口。timeAnchor29及admission95以completed CP MAX(last_item_at)作cursor，未绑定成功child terminal/sealed manifest/audit/完整batch，值相等不能证明成功来源。

新freshFence(admission117-128)锁parent/child id→source/game/community→state→account/credential/sites→manifest；firstClaim222-236锁全集。旧schedulerRepositoryAdapter130→154→158-164为state→source→run反序；旧repository1497-1520 child→无序siblings→parent不能直接复用。这是静态风险，未复现死锁或cursor丢失。PageStore105已先scheduled fence，manual106-116 run→site→source仍须共享竞争验证。

下一独立范围：完整child集合与状态政策纯测（旧bigplayerMultiSiteRuns1-11缺awaiting_manual_verification且全partial归failed）；成功cursor证据筛选反例（缺child/partial/错batch/epoch/缺terminal event/CP hash漂移不推进）；fake连接锁序投影。epoch1专属parent收尾可另做隔离方案，须全batch/child/audit/tasks/CP及fresh parent/state原子提交，不能据此宣称恢复链完成。

本轮结论：四辅助改动只读核查已完成，三个独立剩余范围均可继续，不存在证据支持“全部被账号权限阻塞”。尚未新建合格冻结、运行新异常SQL或真实消费；受限proof仍停止，生产HOLD、国内现役不动。
