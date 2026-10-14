# v104 既有实现与独立证据映射

Status: EVIDENCE_MAPPING / PARTIAL_QA_COVERAGE / FULL_RUNTIME_NO_GO / CUTOVER_HOLD
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 范围与结论

按经理 v033「v104工程方案评阅与当前派单」核对既有隔离实现。v104 的旧 NOT_IMPLEMENTED 是历史设计状态，不能据此重建。当前核心四项均已有代码与独立局部证据，未发现可据此重新实现账本的确定缺口；当前代码不能自动继承旧版本全部负测 PASS，也未获得整批 runtime PASS。本次只读核代码、清单及报告，未运行测试、SQL、HTTP或服务操作；员工只读映射由负责人交叉核对，负责人唯一写本文。不修改经理待办、旧冻结或独立 QA 报告。

## 按项映射

| v104 项目 | 当前实现路径 | 独立已验 | 当前未验/限制 |
|---|---|---|---|
| po_overseas_stage_manifests / po_overseas_expected_tasks | server/src/db/overseasStageCoverageSchema.js、overseasStageCoverage.js | 候选17 v083：实际 manual 主链及 ledger SQL矩阵；v014：当前版本两站持久闭包 | schema 是隔离 installer 定义，不在普通 migrate.js；生产 DDL/readiness 未放行 |
| 同页 comments/replies 登记、任务集合封口 | worker/src/overseasStageCoverage.js、overseasStageTaskIdentity.js、overseasBigPlayerPageStore.js | v083 动态任务/中断/预算/schema矩阵；v014 两站各6完成任务，含历史root补漏，manifest sealed | SQL ledger/PageStore 后续已变，旧负例不能无条件转移；人工登记/seal竞争不等完整抓取页并发 |
| run/epoch/owner 精确 audit、原子 terminal | server/src/db/overseasBoundAudit.js；manual/scheduled candidate factories | v083 同事务终态/故障/ACK未知只读对账；v014 当前 scheduled epoch1 子/父闭包 | v014 不验证恢复epoch2；受限proof停止，不能补跑；旧无绑定audit不改写 |
| 唯一 links 分类计数及 Progress | overseasBoundAudit.js、worker/src/overseasManualProgressRecovery.js | v083 epoch1/epoch2 Progress局部矩阵；v014 各站4内容/links，父8 discovered/8 stored | 当前 terminal实际键 counterVersion=overseas-unique-links-v1，附 links/task/completion/schema hash；links合法归属不证明唯一逐页producer来源 |
| 精确消费者 | worker/src/overseasExactConsumer.js（以v025冻结清单为准） | 当日v025：16/16及独立负测，旧API旁路关闭 | 内存仓储，不是SQL预算/恢复/退款/provider/完整runtime |

## 冻结与独立 QA 锚

以下 .temp 路径均相对仓库根 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage`。

| 冻结清单 | SHA256 | 独立报告/结论 |
|---|---|---|
| .temp/overseas-qa-candidate17-manual-32AVIO/manual-freeze-manifest.json | F505D89350DD1AC4E69951BDFD2C8808D8A36DBE22434146B1A49085B3E1DB8F | .tests/2026-10/2026-10-09/v083_overseas_candidate17_safe_runner_independent_qa.md；878项、974/974安全子集、fresh SQL19主项及ledger矩阵；ISOLATED_MANUAL_PARTIAL_PASS，18排除NOT_TESTED |
| .temp/overseas-qa-scheduled-stage-9io1Ti/scheduled-freeze-manifest.json | 26BC8801A1123F839C43B00E5B0D4B833E4AA4CA096B3A515A3DCAA5ECBA1FAF | .tests/2026-10/2026-10-10/v014_real_next_slot_synthetic_execution_independent_qa.md；701项、真实DB下一槽、原firstClaim epoch1/两站合成执行；ISOLATED_REAL_NEXT_SLOT_SYNTHETIC_EXECUTION_PASS |
| .temp/overseas-exact-consumer-v025-fixed-20261010/manifest.json | 11BA10124AACED9BDE63E66865C7C8C78D19BAAAB09700208368BAE8AD648344（独立报告锚） | .tests/2026-10/2026-10-10/v025_exact_consumer_independent_qa.md；内存ISOLATED_PASS |

v083 SQL原件 `.temp/overseas-real-db-07t9Jn/result.json` SHA `381a13df5e14f5e72beec35f7523ceb45798bc69fa9051949236184c42aacfbc`；v014 SQL原件 `.temp/overseas-real-db-oLD6BB/result.json` SHA `620f7b8430f5723e711045261a2c986d3cdbea8101dcbb300c29618ceef64e55`。这些是独立报告中的原件锚，本次未重复执行。v014传输合成、AI未执行；真实时间边界不等真实HTTP。

## 当前代码 SHA256

下列当前文件实测hash与9io1Ti清单逐项相同；只核这些核心文件，不声称整个活动树与冻结包一致。

| 路径 | SHA256 |
|---|---|
| server/src/db/overseasStageCoverageSchema.js | 821A1D78BFF8B8741F0FAE48D6240894D87F25B6330272CF4CA1C3F60FA83258 |
| server/src/db/overseasStageCoverage.js | 91E42FA435AC38E7DDDDAAA8833B88747C587479EFC18ACE6E70D48F1A7BDBA2 |
| server/src/db/overseasBoundAudit.js | 035E916EC1F3B4DD1F49AAC087DCF3CD1D61DC687C555B5C8DF5599AC151065C |
| worker/src/overseasStageTaskIdentity.js | B8485F5584765528C3F7BD2EA2709885C8900EB87E29BD554612D5873F8899C7 |
| worker/src/overseasStageCoverage.js | 1E1F37D8417B14A398A18C76789C928DAE74B7402984766F962313C519602649 |
| worker/src/overseasBigPlayerPageStore.js | 501C626A45E646CCAA0E2BA49DA6DFA20F47C719AEA1777B797500C9E5668EFD |
| worker/src/overseasManualProgressRecovery.js | A1CA7245553DAF1A3AB82A8D11801D1087D9ACCB0FB661FD624C6C882AA85D1C |
| worker/src/overseasBigPlayerCandidateFactory.js | 0F62287CB2F19CC2D32245BB50B5828B510BEFD23CAB7169238873FCDA22342A |
| worker/src/overseasScheduledCandidateFactory.js | 9A6116A019BF9C0B0947300FF7CDBF86FD9810A47EF469DCFB62E5F70F31F87F |

schema/task identity/worker coverage/Progress还与32AVIO一致；SQL ledger、BoundAudit、PageStore包含后续scheduled变更。v110是历史增量实施记录，不能将其中阶段NOT_IMPLEMENTED或阶段PASS直接用作当前全链结论。

## 精确剩余项与下一小单

补核当日 `.tests/2026-10/2026-10-10/v009_terminal_translation_independent_qa.md`：s6iWAb manifest SHA `1c5e7eb7d4d7c7f05447c5ee9bb19c71b7dfd81efb43b1bf9928542ef41bacf7`，当前 ledger/BoundAudit/PageStore 三文件hash亦与该冻结一致。报告已独立验60终态字段负例与fresh manual首次完成/失败的24精确terminal keys、只读reconcile零写；这些不再列作缺口。它未运行recover/progress或全部原始DB列矩阵。

1. 当前四项没有已证实未实现缺口；先做当前hash与旧独立负例覆盖差集，特别是变更后的 ledger/audit/PageStore：同页rollback/commit中断、任务缺失/schema漂移/封口竞争、错run/owner/epoch、audit故障原子rollback、唯一links/context分类与计数hash。只列未覆盖断言，不重复旧PASS充进度。
2. 对32AVIO的18排除逐文件关联实际入口与安全可执行替代矩阵；保持原18项NOT_TESTED，app.routes真实DB路由不直接解禁，不重试旧事故或受限proof。
3. 发现具体代码缺陷后才形成最小修复单；scheduled恢复/生产schema/readiness/持久状态/共享现役/真实抓取另门禁，不混入本核心四项补验。

若差集需要新整批冻结，先交包含项与命令清单：两表schema定义、ledger/facade/task identity、PageStore、BoundAudit、Progress、manual/scheduled factories及依赖闭包、选定tests、offline guard、隔离SQL runner。冻结/校验使用 `node scripts/freeze-overseas-scheduled-candidate.js --freeze` 与 `--verify <snapshotRoot>`；实际offline/SQL mode必须从新manifest.commands精确列出后再执行，不默认跑全部旧测试。未生成新freeze，未承诺整批PASS。

端口owner：本轮不占13316。需要SQL时先由QA明确空闲/owner停止释放，再读监听与实例身份，开发仅创建自己的root.temp实例；不连接、接管或停止QA实例。QA不空闲时只做不占端口的映射/实现。受限恢复proof明确停止；生产NO_GO/HOLD、国内不动、不第二consumer、不push/发版。

## 变更记录

仅新增本映射文档；无业务修改，无测试重跑。独立证据保留其原结论与边界，不代签QA。后续精确差集小单交项目经理收口。
