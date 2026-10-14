# 终态与翻译预算增量最终冻结 QA 交接

Status: ISOLATED_TERMINAL_TRANSLATION_INCREMENT_PASS_FULL_RUNTIME_HOLD

一句话需求：独立验收已先复现再修复的terminal字段/actor/sourceEffect/分析告警计数、translation数值预算，以及全失败父策略和非scheduled审计兼容。

已拍板：只当前模型；仅自有13316/serverId20261036/po_overseas_fixture，每连接核PID/datadir/schema，串行实例。开发实例已停止释放，QA可独占。生产DDL/3306写/HTTP/AI/通知/刷新/服务切换/第二消费者/恢复progress入口均禁止；FULL_RUNTIME_NO_GO/CUTOVER_HOLD。未commit/push/发版。

## 冻结

仓库根 `.temp/overseas-qa-scheduled-stage-s6iWAb`，697 files，manifest SHA256 `1c5e7eb7d4d7c7f05447c5ee9bb19c71b7dfd81efb43b1bf9928542ef41bacf7`。验前后运行 `node scripts/freeze-overseas-scheduled-candidate.js --verify <该SHA>`。开发后verify原件 `.temp/s6iWAb-dev-postverify.raw.txt` SHA `ccc848bacac9d7fa4b113c51b25c7c45809dea8efafd57fd28134312c0a089d1`。

必要独立命令（在最终冻结根串行运行）：

1. `node scripts/overseas-isolated-mariadb.js --isolated-parent-terminal-fields`
2. `node scripts/overseas-isolated-mariadb.js --isolated-parent-all-failed`
3. `node scripts/overseas-isolated-mariadb.js --isolated-translation-call-budget`
4. `node scripts/overseas-isolated-mariadb.js --isolated-manual-audit-regression`
5. `node scripts/overseas-isolated-mariadb.js --isolated-certified-cursor`
6. `node --require ./scripts/offline-test-guard.cjs --experimental-test-isolation=none --test worker/test/overseasStageCoverage.test.js worker/test/overseasParentEvidencePolicy.test.js worker/test/overseasControlledManifest.test.js`

请QA自建报告与原件、核验释放和范围。不要运行baseline diagnostic求修复PASS，不调用通用`--isolated`（含已停止恢复入口），不重跑原一小时真实下一槽。

## 开发原件 SHA256（均仓库根.temp）

| 原件 | SHA256 |
|---|---|
| overseas-real-db-fSUk7A/result.json | 4146dfdc1673343d7ba9a85d3dc805d1cdb51e853562b00dbd2da57d8b91f67c |
| lQOOB9-dev-terminal-fields.raw.txt | 41019656cbf6fe7a32c671c80a9f60bca543d7f77f834c122d68289368a1ee00 |
| overseas-real-db-vfDK6R/result.json | 9a831be85f5ccea5c7a4f88edc5f0eee225cf1097ea8ec5c8f7fd5bc9c505aa4 |
| lQOOB9-dev-all-failed.raw.txt | fdbb8d9d3ed2731b50c96b255d3bde332033b2206472bd4413a39587a5a27e66 |
| overseas-real-db-a4dsSM/result.json | 53504039c121f05f0e23da6ecddc88bcd872063d88a2fbc87887033a4f70702c |
| lQOOB9-dev-translation-budget.raw.txt | 61be1e1aaf0a73629bda73f446c9381cb97a09ee039f4b34a186cb081be8bf7b |
| overseas-real-db-1OruoD/result.json | 6e6a4b6a0ea959963a12e66ed5e702c29bdc4eb0be4485480faa8861cdc1b3b8 |
| s6iWAb-dev-manual-audit.raw.txt | 2750bfbd29b1698a0943b1230c3d048afeaf663558f1280d1656d6e2e4362194 |
| overseas-real-db-rhQU9N/result.json | 8b0fb11f30294b70da23dabe010a3fb1a8763cab013875e18c5df1e5ea36abf1 |
| s6iWAb-dev-certified-cursor.raw.txt | 914bb7b1f3f53702956d20940d587a2d4dbe18cfeae48047e00af6d0cede19dd |
| s6iWAb-dev-offline.raw.txt | 498d79ffb5ec71831809079d17af2f0637b3cec1291156b75ec6335c7d0ebaef |

三新增SQL先在lQOOB9/696 files/manifest `29fa2d26eb82a2566c95f1bcbd68fb77303dce88debec2ff20a4dbd2a9286702`开发通过；最终冻结仅增加兼容helper/runner/freeze接线，未冒称它们在最终包开发重跑。已核五文件字节相同：BoundAudit `035e916ec1f3b4dd1f49aac087dcf3cd1d61dc687c555b5c8df5599ac151065c`；CallBudget `b6cb37f8033a1de92f546f3124e8294a8f08910f86d6c7574e86a45f3ab23328`；terminal helper `1ae4154292f0bf4be4c8c3a427f280a0f521a4341ebf42d4791d7e127bb21782`；translation helper `47cdd1c1ff8be809bbf388f341217735a1bebf709f0266130b7caa8bd4844af4`；parent helper `6dd43131f544e11df53536680fcee4e547d68a86f8e1ef6b0191ebd8ef5c5a4e`。

旧漏洞baseline vvQdVU/manifest `8428901b2634c605121fc6b21c6dc5ac064490aed079c4c5281e62d58cd0c347`：terminal八项真实readonly audit接受，result5Z14Nz SHA `f0e147d13b9ea9b62506327c305a41072170d8584dc041747bc0b4f57b07ccf6`；translation global used=-1仍实际fake消费，result4yp3ye SHA `0a99d8ef304f14eac51390c176a953f5ceaf9987db9d81da5d58b3faf690ade1`。预算损坏fixture未恢复，仅自有实例停止。两diagnostic修复后应失败，不是验收命令。

fresh manual准备包qjREVI失败ER_WRONG_TYPE_FOR_VAR，JbHtOJ停止释放；raw SHA `b75c21bc2a4214c6d897fb31b68a7ac4a9df584e0ec01035c922a5fea47a63eb`，保留失败，不报PASS。补齐夹具构造参数后最终新实例成功；未改业务来绕过。

## 结果与未验

terminal60负例/12表零写恢复，正常父2/2及两cursor；不是所有原始DB列矩阵。全失败两子failed，现有父partial/零成功cursor策略保留，历史非NULL成功时间不变。translation46负例/九表零写恢复、reserve至cap4后原预付合法consume、1disabled outbox/job仍pending；不是实际翻译。

fresh manual两站首次claim，无recover/progress；真实成功source时间非NULL/errorNULL，失败保留该时间并精确写错误；24键/原binding format/system actor/分析告警0/null失败progress、76取连接核验、十表readonly reconcile accepted。短certified cursor PASS不代表实际第二槽执行。

范围内used1→0、预算删行/scope/day重标和call账日对账未实现；历史ancestor UPDATE竞争、持久目录/真实排空/共享单消费者切换/完整runtime仍未完成。原xTmhjI真实下一槽仅准入QA报告v007保留，第二批claim/采集/终态均未执行。本批独立QA未完成前不可报放行。

证据纠偏：经理核表发现terminal-fields raw SHA漏写`c122`之后的`d`，原表值仅63字符。当前重算64字符为`41019656cbf6fe7a32c671c80a9f60bca543d7f77f834c122d68289368a1ee00`，与开发原工具输出及此前记录一致；此为文档转录笔误，不是原件变化。仅更正本表，未覆盖raw/冻结、未重跑旧PASS。QA必须使用自己新raw/result及前后verify，本修订不替代独立通过证据。

## 独立QA核收

测试负责人报告 `.tests/2026-10/2026-10-10/v009_terminal_translation_independent_qa.md` 已完成五fresh SQL和19离线，697文件前后verify通过。本负责人完整读报告并重算其13份独立原件SHA，13/13一致；五result均productionTouched=false/serverStopped=true/portReleased=true，冻结额外只读verify=true/697。证据包含terminal60负例、translation46负例、全失败父partial/无成功cursor、manual76连接及十表readonly、短cursor初始链。无旧PASS重跑，未覆盖旧raw或冻结。

本批局部隔离PASS可收口；本文件前文待独立QA的表述属于交接时历史状态，现以本节为准。未验/未实现清单和FULL_RUNTIME_NO_GO/CUTOVER_HOLD不变，不授权生产激活或发版。
