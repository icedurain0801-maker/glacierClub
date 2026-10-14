# 全失败、terminal 全字段与 translation 隔离预算增量

Status: ISOLATED_TERMINAL_TRANSLATION_INCREMENT_PASS_FULL_RUNTIME_HOLD

项目经理 01:30 派单；QA 独占 13316 等待 xTmhjI 的真实下一槽，开发不连接或停止该实例、不修改旧冻结。员工只读设计并给 patch，开发负责人审核后唯一落盘；未 commit/push/发版。

新增 `scripts/overseas-isolated-translation-budget-checks.js` 与专属 `--isolated-translation-call-budget`，加入下一冻结命令。现有隔离预算 SQL 夹具仅 analysis，本增量使用 fresh translation manifest/job，逐项覆盖 reserve/consume 的 version、target_language、job/content 指纹、job 状态、删除、半开窗口、manifest body、配置及持久 cap 漂移，并比较漂移后的九表零写与完整恢复。最终只有合成禁发 outbox，translation job 仍 pending；不调用 AI/HTTP/通知，不代表真实翻译交付。共享 translationWorker/repository 和现役服务未修改。

terminal 复审发现 scheduled sourceEffect 非 null 精准伪造、event actor、分析/告警计数、detail 额外字段校验缺口；真实业务复现和修复待 QA 释放后串行执行，当前不报修复通过。全失败与完整 terminal 字段矩阵正在实现，SQL 尚 NOT_VERIFIED。历史 UPDATE 竞争、真实排空/持久目录/单消费者切换仍未完成，FULL_RUNTIME_NO_GO/CUTOVER_HOLD。

新增 `scripts/overseas-isolated-terminal-checks.js`：diagnostic reproduction 使用真实品牌 ledger/proof/journal 重建 audit，只读 reconcile 观察旧实现对八项精准漂移的接受并完整恢复；不提交父。修复验收场景从实际 terminal detail 枚举全部顶层键漂移、缺失和所有 nested counts，另含 sourceEffect、actor 与分析/告警 NULL/非零；每项 parent.finalize 须精确拒绝、12 表准入零写、恢复后原 audit accepted。正常非空收尾另核父计数2/2、两 cursor 与 lease 释放。范围仅完整 saved detail/必要审计字段，`rawDatabaseEveryColumnVerified=false`，不冒称每个原始 DB 列均校验。

`--isolated-parent-all-failed` 两个合成已封账空 feed child 均标 failed；保留现有 ParentStore 所有非成功聚合为 partial/no-success-cursor 策略，校 source 不推进成功时间、state 释放、父 event 一致。纯投影 all-failed 返回 failed 与真实父 partial 的策略差异只记录，不在本单改变需求。专属 runner 与下一 freeze 命令已接线；旧 xTmhjI 不变。新增脚本语法检查、diff --check 与必要 19 项离线合同/品牌/投影回归 PASS；新增 SQL 与旧实现漏洞真实复现仍 NOT_VERIFIED，业务修复尚未落盘。

第二轮预算只读复审另发现 `used` 负数或大于 cap 时旧 consumeFake 仍可消费。新增 `--isolated-translation-budget-reproduction` 独立 diagnostic：真实 reserve 后把 global used 置 -1，观察旧真实消费提交合成禁发 outbox；该实例不恢复损坏夹具，不作发布验收。修复后的预算模式增 global/scope 的 -1/cap+1、reserve/consume 共八负测，再真实 reserve 至 cap 后校新 reserve 拒绝、原预付 receipt 合法消费，预计46项负测，以原件为准。

范围内 used 从1变0、预算行删除/scope/day重标和 call账日对账仍未实现，本轮数值完整性检查不能证明这些语义账本完整性。不能用 fixture cap PASS 替代全预算或真实AI完成。

待复现 baseline 冻结为仓库根 `.temp/overseas-qa-scheduled-stage-vvQdVU`，696 files，manifest SHA `8428901b2634c605121fc6b21c6dc5ac064490aed079c4c5281e62d58cd0c347`，包含未修的原业务实现及新 diagnostic 接线。此前仅准备的 MsgOWS/nrjurO 包未执行新增 SQL，不计完成。QA当前 xTmhjI 真实下一槽仍独占13316，开发继续避让。

补强 all-failed 当前工作树夹具：预置非 null 历史 source.last_success_at，两个 child/audit 均带明确合成失败码和消息；父 partial 后要求成功时间完全保留、错误更新且恰好一条 terminal event。该夹具将在修复后新冻结运行，不用于改变 vvQdVU diagnostic 原件。员工两模块只读复审无阻断；额外数值预算与全失败补强尚待 SQL，不扩大离线19项结论。

QA 已完成旧 xTmhjI 并释放13316，root核原端口无监听后串行执行 vvQdVU 两个旧实现 diagnostic，均exit0、owner停止释放/productionTouched=false。terminal 实例 `.temp/overseas-real-db-5Z14Nz` 实际八项全部 accepted，调用真实只读 audit，未 finalize，12表恢复一致。预算实例 `.temp/overseas-real-db-4yp3ye` 实际 global used=-1 仍 fake_consumed 并提交 disabled outbox，确认漏洞；不恢复该损坏夹具，只停止自有实例。baseline前后verify=true/696，原件待在新交接列完整SHA。

先复现后最小修复已落盘：`server/src/db/overseasBoundAudit.js` 两类event核system actor、terminal detail exact keys、分析/告警计数必须非NULL且为0，scheduled sourceEffect强制null；保留现有format协议与非scheduled sourceEffect行为。`server/src/db/overseasIsolatedCallBudget.js` 持久used必须非NULL安全整数且0<=used<=cap，损坏返回ISOLATED_CALL_BUDGET_CORRUPT，合法预付used==cap仍允许消费。修复 SQL 与新独立QA尚未运行，不报修复PASS。

修复包 lQOOB9 / 696 files / manifest `29fa2d26eb82a2566c95f1bcbd68fb77303dce88debec2ff20a4dbd2a9286702` 开发新增 SQL 已实际执行：fSUk7A terminal60项精确拒绝/12表零写恢复、正常2/2父成功与两cursor；vfDK6R all-failed两子失败/父partial、历史非NULL成功时间保留、0cursor与state释放；a4dsSM translation46负例/nine表零写恢复、真实reserve至cap4后合法receipt消费、1disabled outbox/job仍pending。三个mode均exit0、serverStopped/portReleased=true、productionTouched=false，前后verify=true/696；修复后必要19离线回归PASS。员工最终业务复审无阻断。

尚待独立QA与必要非scheduled BoundAudit实际finish/reconcile兼容回归；不能用离线brand测试代替，不调用已停止的恢复/progress proof入口。将在安全同进程first-claim专属回归完成后单独新冻结交QA，不重复原xTmhjI真实等待矩阵。

新增专属fresh manual audit helper及runner/freeze接线：新receipt prepare/handoff接受后原queued0首次claim两站，实际空feed成功和无manifest失败finish/reconcile，核原source写端语义、保留绑定format、system actor/exact keys/分析告警0、十表只读零写。员工补强意见已纳入；局部repo池每次取连接先核自有PID/datadir/schema，finally恢复原池；不调用recover/progress或网络。此项尚待SQL，业务修复字节未再修改。

fresh manual首次qjREVI/JbHtOJ失败ER_WRONG_TYPE_FOR_VAR，实例停止/释放，productionTouched=false，不计PASS。夹具Object.create(Repository.prototype)缺少构造器syncUpsertLockWaitSeconds，正式upsert设置SESSION参数收到undefined。仅helper补设3并finally恢复，与原manual夹具初始化一致，不改业务或SQL。原raw误落仓库根后已移动至根.temp/qjREVI-dev-manual-audit.raw.txt，未删除证据。

最终s6iWAb/697 files/manifest 1c5e7eb7d4d7c7f05447c5ee9bb19c71b7dfd81efb43b1bf9928542ef41bacf7：fresh manual实际PASS，两站成功/失败sourceEffect、24键原format、null失败progress、76次取连接身份校验、十表只读零写；短certified cursor实际PASS，19离线PASS，后verify=true/697。两实例1OruoD/rhQU9N均停止/释放，无生产触碰。两业务修复与三新增SQL helper五文件SHA逐一与lQOOB9匹配，三SQL沿用旧开发原件，最终包由QA独立fresh重跑；不重复真实下一槽等待。正式交接见v010。

独立QA已完成：`.tests/2026-10/2026-10-10/v009_terminal_translation_independent_qa.md`。负责人完整核收报告，重算13份QA新原件SHA全部匹配，五result停止/释放/productionTouched=false均成立；冻结再verify=true/697。五fresh SQL及19离线独立PASS，本批局部隔离放行；整体FULL_RUNTIME_NO_GO/CUTOVER_HOLD及全部未验项保留。无生产激活/commit/push/发版。
