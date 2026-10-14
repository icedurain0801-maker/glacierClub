# v059 当前正文持久 intent / 精确 repair 独立验收

日期：2026-10-10。候选：完整 candidate-current-intent-v069。

结论：PASS_INDEPENDENT_ISOLATED_PARTIAL_SCOPE。24 个独立新增执行场景通过；生产 HOLD。本结论仅覆盖已实现的非历史精确 scope intent/repair，不等于原21项全通过、所有 writer 覆盖或生产恢复。

## 身份与执行

完整 manifest SHA256：`a581eb6bd19836f3e48e61476a7afba3d79b993c22b1a217cbc4ff4002ab5844`。独立校验1221文件，实际与v066-r3清单比较为9项改变、无基底文件缺失；三个Repository、三个safeAnalysisEnqueue、三个新增currentAnalysisIntent。末轮执行前后1221文件SHA不变。未拿129文件员工partial包替代完整候选。

schema SHA256：`0475046d63a3f1f7ecf7f87541a72f0484f2373258ddb934eeb569114d99a1de`。只在fresh库执行冻结三张新增表。旧通用fixture缺API已有board_id/board_name，依据项目boardMigrationContract在QA库另加VARCHAR(32)/VARCHAR(255)可空列；未改冻结schema、业务代码或生产DDL。

正式QA脚本：`.tests/2026-10/2026-10-10/v059_current_intent_independent_sql.cjs`；复用并审阅员工初始化/fixture/HTTP/锁观察工具，QA副本在仓库根`.temp/qa-v059-harness/`。断言自行编写；载入完整冻结实际三包Repository/helper和actual app.js loopback handler。未调用员工run.cjs或将员工30项算为QA。

命令需显式 `--isolated --candidate <完整manifest> <SHA>`。定向续跑用CLI `--only <case IDs>`，在清理环境前冻结选择，已通过case不重跑；本轮没有因环境变量清理重复已过矩阵。

## 独立场景

| QA case | 实际验证 | 结果 |
|---|---|---|
| 1、2、3 | collection/analysis/api实际page正文+intent同事务；intent INSERT完成后注入故障正文与intent整体回滚；正常F2保持F1owner，重复同F去重generation；actual insertContent显式account NULL范围capture | PASS |
| 4 | F2已存且F1活跃，正常claim不误接管，旧F1commit/fail无结果、缓存、quality、audit/job写入；intent未丢失 | PASS |
| 5 | running/pending/retryable未来lease不撤owner，deferred_active意图保留 | PASS |
| 6 | F1续租后先deferred，到期后完整身份刷新、精确F2重排，同job ID新claim/commit成功，重复ACK无变化 | PASS |
| 7 | 同F expired running走既有reclaim、attempts+1，不冒称额外repair | PASS |
| 8 | NULL lease且有owner为blocked_orphan；DB真实拒绝任务NULL fingerprint；reviewed计划NULL oldFingerprint与实存身份不一致时拒绝且零写 | PASS，未验NULL任务行CAS |
| 9 | 无intent存量，经reviewed full snapshot plan创建持久intent并精确repair；重复plan/record持久already_applied、audit一次 | PASS |
| 10 | 真第二连接改owner/lease/attempts/profile/version/fingerprint/trigger/updated_at八种身份，冻结plan逐项拒绝且完整状态不变 | PASS，未制造锁内affectedRows0 |
| 11 | F2 plan后F3正文或account范围变化，exact plan拒绝；ordinary replay精确blocked_scope，不越界写job | PASS |
| 12 | 真gate被其他连接占用或失去ownership，repair拒绝、零写 | PASS |
| 13 | actual gate同连接audit、ACK、repair record SQL已完成但未commit时SQL KILL；job/intent/audit/幂等record全回滚 | PASS |
| 14 | 真audit INSERT权限REVOKE与真实content锁timeout，回滚所有变化 | PASS |
| 15 | 真deadlock：gate持content并等待intent，peer持intent再取content；实际replay受害ER_LOCK_DEADLOCK，回滚后同精确ID有界重试一次成功 | PASS |
| 16 | F2 exact repair事务至ACK/record时暂停，真实F3 page writer等待content锁；F2提交后F3 generation=2 pending，旧plan ACK不碰F3；再精确回放F3，audit两代各一次 | PASS |
| 17 | 正文已commit且不执行downstream，换新Repository对象仍能读取持久intent并repair | PASS，未做OS杀进程 |
| 18 | disabled与白名单外scope正文仍正常提交、零intent；per-call config不得扩大loaded配置 | PASS |
| 19 | source/account community真正NULL，actual insert和page正文提交、零intent | PASS |
| 20 | 实际enabled claim遇最前坏scope intent，隔离该generation，仍领取正常job | PASS |
| 21 | F1历史slot遇F2正文，普通producer、intent及真实API force均保留历史marker，deferred_history/409 | PASS保护边界，非历史F2最终可消费证明 |
| 22 | 新F2 intent遇active force真实HTTP409，到期repair并commit后独立新force HTTP202 | PASS，非requestId幂等 |
| 23 | disabled source/deleted content/manual Q1 owner/sameF failed budget精确阻断，不扩重试预算 | PASS，source deleted标志本轮未单独验证 |
| 24 | 空/超batch、缺version/错误SHA/空scope、records绕reviewed plan、未reviewed及缺完整身份计划提前拒绝且零写 | PASS |

没有重跑v060规则、v065来源或v066旧消费者/producer矩阵。未重复历史light→deep既有通过项；本轮仅验新的历史slot保护改动。

## 原件与QA测试修正

聚合索引：仓库根`.temp/qa-v059-current-intent-summary.json`，24个唯一case均有实际PASS原件，不把各轮run整体状态拼成单轮PASS。

| 自建run目录 | 原件结果 | 保留/续验 |
|---|---|---|
| `.temp/qa-v059-intent-I5ig4j/` | case1、2通过；case3因QA旧schema缺board列失败 | 原件FAIL保留，只续3以后 |
| `.temp/qa-v059-intent-DD6jsI/` | case3至7通过；case8试造NOT NULL任务fingerprint失败 | 原件FAIL保留，只续8以后 |
| `.temp/qa-v059-intent-STmG41/` | case8至24通过，exit0、PARTIAL_SCOPE | final原件、两个engine锁文件保留 |

首轮错误为旧fixture结构不完整，第二轮错误为QA假定任务fingerprint可空；均无候选业务缺陷证明。修正后的case8验证真实NOT NULL约束和plan NULL冲突，不伪造NULL任务行或触发器。原件不改写。两个锁等待文件：STmG41/qa_deadlock_gate_waits_intent.engine.txt与qa_F3_writer_waits_F2_ACK_commit.engine.txt。

每轮fresh独立datadir在仓库根.temp，serverId20261071，SQL端口分别56152/56541/56767。显式--no-defaults、loopback、event-scheduler=OFF，仅fixture表CRUD账号，API只读自建fixture.env；external fetch禁止、synthetic AI配置未发送，无真实采集/认证/AI/通知/计划任务。

三轮原件均identityBeforeShutdown/serverStopped/portReleased/httpPortReleased=true，核port/serverId/datadir/pid_file/version/PID/owner后SQL SHUTDOWN，HTTP关闭并端口可重新绑定；另核三SQL端口无监听。未删证据或数据目录。语法与空白检查通过，生产及业务文件未修改。

## 必须保留的部分范围和NO-GO

真实八字段冲突不等于锁内actual affectedRows=0；后者仍未验。force requestId持久幂等、历史独立lane/历史F2 eventual、自动业务/发布日期窗未实现。合成reviewedPlan与writerCoverageEvidenceId仅用于隔离约束测试，不能证明真实writer drain或生产批准。

旧Q1 split writer、现役loaded API/shared覆盖、translation ACL、实时通知事务窗口、旧更长正文/raw fingerprint语义、生产schema门禁与精确名单、真实国内/海外恢复均NO-GO或待确认。关闭默认开关或旧包不会继续回放账本，本轮不批准回退或切换。

海外daily特有writer不由v069三包覆盖。待新overlay；正确安装helper依据为`C:/ProgramData/PublicOpinion/overseas-daily/releases/overseas-daily-release-handoff-1791605997752/worker/src/overseasBigPlayerPageJobs.js`，不存在的server/services路径不作验收依据。本轮未读生产环境、未真实抓三站，静态身份不等于loaded证明。
