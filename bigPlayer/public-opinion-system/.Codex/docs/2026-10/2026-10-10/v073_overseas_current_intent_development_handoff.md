---
last_updated: 2026-10-10
status: independent-isolated-overseas-partial-scope-pass
owner: 开发负责人
production: HOLD
---

# 海外页事务持久分析意图：完整候选交接

已按 v071 的经理派单实现独立海外 overlay，并合入**完整实际安装基底**，不是三包 v069 整体替换。开发 actual daily.commitPage 合成 MariaDB 19 个执行场景通过部分范围，只读审查完成，已交独立测试。翻译旧 F1 active 仍明确拒绝、整页回滚，不称海外全量同步或翻译已恢复。

## 精确身份与文件

正式索引 `v072_overseas_current_intent_candidate_manifest.json`。完整候选在仓库根 `.temp/risk-normalization-20261010/candidate-overseas-current-intent-v072/`。

| 身份 | SHA256 |
|---|---|
| 完整新 manifest | `da01a9d8779ac8f3d9999a977c295cd6a976d55e40c1083286fa040768121c19` |
| 实际安装基底 package manifest | `02996c9d1522a849266822314d57e9b9d38d6eaf5bfbcb9ad56125202331035e` |
| 员工最小 overlay manifest | `63c34564b206098c47528531c4e6f467a5e9df0bf0596b68d6a4d63b2ccf1356` |
| 复用 v069 manifest | `a581eb6bd19836f3e48e61476a7afba3d79b993c22b1a217cbc4ff4002ab5844` |
| 三表 schema001 | `0475046d63a3f1f7ecf7f87541a72f0484f2373258ddb934eeb569114d99a1de` |
| 第四表 schema002 | `4d93e759fb949003788ca1250aecd2badb731a47aa7f098960123f3ea8109953` |

基底 `C:/ProgramData/PublicOpinion/overseas-daily/releases/overseas-daily-release-handoff-1791605997752` 的404文件逐SHA一致，仅复制其精确manifest列出的代码/依赖，不复制env/状态/任意安装文件。3个原文件改变+5新增依赖，得到完整409文件；全SHA、8文件语法、原基底/员工冻结身份通过。构建脚本在仓库根 `.temp/risk-normalization-20261010/build-overseas-current-intent-v072.cjs`，实际结果 `integration-verification.json`。只在新隔离目录写入，没有改安装release、业务工作树或v069。

3改文件：`server/src/db/repository.js`、`worker/src/overseasProductionDaily.js`、`worker/src/overseasBigPlayerPageJobs.js`。5新增依赖：`currentAnalysisIntent.js`、`safeAnalysisEnqueue.js`、`historicalAnalysisAdmission.js`、`overseasCurrentIntentProof.js` 和 `shared/riskPolicyHistory.js`。board/source/祖先/窗口/strip兼容保持原包，不整段复制通用Repository。

## 最终逻辑

daily仍唯一真实外层事务。pinned内容SELECT已有锁suffix不重复追加，原逐行scope/board核对保留。Repository在stored row处同pinned连接capture持久意图，PageJobs显式借pinned给安全入队helper，不另取真实pool连接提交。

普通分析 F2/F1running 仅在本页WeakMap绑定真实facade/pinned/conn、实际@@in_transaction、精确scope/profile/version、正文F2/intent generation/state、完整旧job、board/site/language/siteURLSHA/窗口和membership全部匹配时defer，旧owner/lease/F1保持。缺proof、scope外、history/manual/NULLlease/force等仍拒绝。六字段意图不能替代后续consumer的海外板块/日期身份。

重复F2保留原previousF1与generation。只有同owner/status/attempts/profile/version/fingerprint/trigger/keywords/retry/completed等完整身份一致时允许lease_until/updated_at刷新，在同外层page事务写proof审计与expected snapshot，不ACK分析结果。换owner/marker等不被当续租。审计/队列/receipt失败整页回滚。

翻译旧指纹active报 `OVERSEAS_TRANSLATION_ACTIVE_VERSION_CONFLICT` 并回滚正文、分析intent、队列、membership/关联和receipt。这个拒绝行为已实际验证，但属于尚未实现翻译延期的边界，不能当同步全量恢复。

## Schema、默认开关与回退

复用v069三个additive InnoDB表，新增 `po_overseas_current_intent_proof_audit`：UUID主键，intent/gen/content/site、before/after job JSON、DATETIME(3)，索引(intent_id,generation)，无最终ACK唯一键、无外键、无正文/凭据。第四表已由经理核收**隔离设计**；生产DDL未执行。schema无ALTER旧表/历史lane/升version、无DROP。

默认disabled关闭capture/defer，但新safe enqueue为无条件替换，仍新增事务/历史保护/CAS，**不能称关闭开关恢复全部原行为**。退旧代码停止捕获/回放，须保留所有ledger/audit，已repair不能交旧Q1；schemaDDL通常不被业务事务回滚。回退/生产门禁由经理控制。

## 开发实际SQL与原件

根 `.temp/risk-normalization-20261010/employee-overseas-intent-sql/`。

| 原件 | 实际范围 | 结果 |
|---|---|---|
| `run-I7vlji/result.json` | legacy/modern actual commitPage、唯一conn begin1/commit1与suffix、F2/F1durableproof、无proof拒、翻译/历史整页回滚、board/window/site/scope/祖先、queue/receipt失败、真实KILL/锁、F2/F3 ACK、重复F2与同owner续租审计、changedowner/marker拒、proofaudit权限失败 | 17执行case PASS_DEVELOPMENT_ISOLATED_PARTIAL_SCOPE；port58753核身份shutdown释放 |
| `run-L5i3Go/result.json` | actual collectSite同已fetch页面，真实SQL锁timeout回滚后有界重试；actual commit成功后模拟ACK返回错误 | 2执行case PASS_PARTIAL_SCOPE；port59369核身份shutdown释放 |

补验从冻结daily源码在VM按CommonJS加载并附加词法retry helper导出，未改源码/执行main。fake connector只合成页面无HTTP；实际SQL锁失败后fetchedPages=1、同页transactionAttempts=2。unknownCOMMIT场景真实DBcommit成功后wrapper模拟传输返回异常，不是实网络丢包；实际transaction销毁连接、retry不重复、memory receipt不进、DBreceipt/queue已1，旧receipt再跑fence拒绝。原17未重跑、所有8overlaySHA前后不变。

员工方法10项SQL-peer mock通过，非实库。主代理最初在项目cwd调用第10项遇测试固定仓库根相对路径ENOENT，后按仓库根正确命令通过10/10；不是源码缺陷。只读审查 `employee-intent-review/overseas-overlay-review.md`，`PASS_READONLY_ISOLATED_ANALYSIS_PRODUCER_OVERLAY_PARTIAL_SQL`。独立QA使用自己的断言和fresh实例，不把开发19项算作独立PASS。

最终开发索引：`employee-overseas-intent-sql/report.md`、`evidence-manifest.json`，SHA `de9d287b25be3a8aa7bbfe36ac7f1cb04aeb8308a6cb63d1ae6cd22c3d2a12cf`。postrun-identity核两份schema、8overlay与两轮合成runtime逐SHA不变。第11项receipt失败由真实SQL写id=NULL触NOT NULL约束，非伪造SQL返回。第19项是commit真实成功后模拟ACK传输返回异常，保留实库已提交与内存未推进的双证据。

## 尚未完成

海外overlay没有consumer replay接线；sameFcompleted缺analysis沿旧PageJobs skip，不称当前分析已存在；failed预算、force requestId/historylane/自动日期窗仍分别未闭环。翻译旧active保护、translationconsumer/ACL、loaded API/shared/consumer、Enabled旧Q1与通知窗口、生产schema/精确名单、真实境内境外定时采集继续HOLD/NO-GO。

v069独立24PASS与旧三站采集验收不自动覆盖本新海外writer。已向测试负责人发送完整v072身份和19开发原件，等待独立新增范围报告；项目经理唯一维护正式待办和生产切换。

经理已转达用户禁止过度开发/测试：本候选仅完成已批准producer延期改动直接所需验证，不并入翻译consumer、Q1、historylane、requestId等新开发，不重既有已过矩阵、不补无关兼容或抽象。HOLD是生产边界，不作为继续扩项理由；独立QA返回后仅修其具体缺陷并收口。

## 独立 QA 最终收件：本候选收口

独立 `.tests/2026-10/2026-10-10/v060_overseas_intent_independent_qa.md` 已交回 `PASS_INDEPENDENT_ISOLATED_OVERSEAS_PARTIAL_SCOPE`，16/16 直接受影响场景通过，不追加测试。完整409文件及两schema前后SHA不变、实际3改基底+5依赖身份核实。

原件仓库根 `.temp/qa-v060-overseas-WHny4J/result.json`、`qa_daily_retry_source_lock.engine.txt`；startup失败 `qa-v060-overseas-v2QtHu/result.json` 保留，初次QA遗漏fixture初始化、0场景执行，纠正后唯一完整run16PASS。SQL61685/61354均核identity shutdown/端口释放，无生产HTTP/AI/DB/服务/计划任务或三站重复采集。

独立覆盖modern/legacy、锁suffix一次、唯一outerconn、F2/F1active持久capture保owner、重复F2/仅lease-updated刷新proof、六稳定身份变化拒绝、缺proof/force/manual/NULLowner、翻译/history整页rollback、scope/window/summary/recovery、proof/queue/receipt实际SQL错误与KILL全回滚。actualcollectSite真实锁timeout同页attempt2/fetch1；actualCOMMIT成功后wrapper模拟ACK返回异常不retry，memoryreceipt不进、DB已commit，明确非实网络丢包。

本producer部分范围已收口。翻译active整页rollback/no consumer接线/生产loadedQ1等本文件未完成项继续单列，不冒称海外同步全恢复，不扩项。经理控制后续生产门禁。
