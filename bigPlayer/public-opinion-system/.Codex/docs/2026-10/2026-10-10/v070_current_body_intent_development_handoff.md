---
last_updated: 2026-10-10
status: independent-isolated-partial-scope-pass
owner: 开发负责人
production: HOLD
---

# 当前正文持久补队：完整候选与开发交接

已把 F2 正文已存、F1 任务仍 running、延期入队意图丢失的缺口实现为**非历史精确范围隔离候选**。开发真实 SQL/API 30 个执行场景通过，只读代码审查完成；尚未独立 QA，也没有生产恢复。规则 v060、来源 v065 和消费者事务 v066-r3 保持冻结，不覆盖用户工作树，不切换生产。

## 候选身份与整合

正式索引：`v069_current_body_intent_candidate_manifest.json`。

- 完整候选：仓库根 `.temp/risk-normalization-20261010/candidate-current-intent-v069/`。
- manifest SHA256：`a581eb6bd19836f3e48e61476a7afba3d79b993c22b1a217cbc4ff4002ab5844`。
- 基底：完整 v066-r3，manifest SHA `18b8d560d48e85e4b05dcef24640da966d6566294ed267f758f0ce84d1a97234`。
- 员工输入：129 源码文件的部分树，manifest SHA `53bb915ee109169d4d4d8781c1cf5c287f03b5aba6dbfe28f9a5a68f423beb31`；**不是完整发布包**。
- 主代理逐文件核 SHA、串行合入 9 项变化，保留完整基底所有文件。结果为 API 399、analysis 411、collection 411，共 1221 文件。
- 9 项变化：三个 Repository、三个 `safeAnalysisEnqueue.js`、三个新增 `currentAnalysisIntent.js`。未改旧 Q1、风险规则、来源页面或消费者 6 个事务保护方法。
- 隔离 schema：`schema/001_current_analysis_intents.isolated.sql`，SHA `0475046d63a3f1f7ecf7f87541a72f0484f2373258ddb934eeb569114d99a1de`。仅新增 intent、audit、repair records 三表，无 ALTER 旧表、无生产 DDL。
- 主代理整合核验：`integration-verification.json`；1221 文件身份、变化文件语法、原 6 个保护方法一致性及定向方法测试 10/10 通过。未扩大为独立 SQL 结论。

## 实际代码逻辑

1. 三包正文 `insertContent` 与 page upsert 启用时在正文同连接事务中捕获 intent。F2 同代次去重，F3 推进 generation；没有正文 commit 后再靠内存补意图的窗口。
2. 默认关闭。启用必须精确六字段 scope、light/version、基底 SHA、证据引用与批上限 1..10。来参不得扩大 Repository 已加载配置。范围外及 community NULL 保持正文正常提交、不生成 intent；禁用保持原正文路径。
3. analysis claim 前用持有真实 `po-analysis-consumer` 的同一连接有界回放，不扫描全库。content→job→analysis→intent 固定锁顺序；未来租约保留，过期 stale 任务以完整身份 CAS 恢复，续租仅在旧 slot/指纹/历史身份一致的安全边界刷新。
4. 精确存量 repair 无需先有 intent；必须受控 reviewed plan SHA、最多 10 条、完整 content/job/analysis 与 old/new fingerprint。capture、repair、audit、幂等记录同事务提交，拒绝 snapshot records 绕开 plan。
5. F2 ACK 不误确认 F3；重复 plan/record 返回持久 already_applied。gate 断连、审计权限失败、锁超时/死锁均回滚。坏 scope/body/身份只隔离相应 generation，正常 claim 继续。
6. NULL running、旧 manual Q1、历史 slot、同指纹 failed budget 分别显式 blocked/deferred；不擅自解除保护或扩大重试预算。samefp 可领旧任务只报告 existing_claim_path，不冒称已分析。

## 开发真实 SQL/API 原件

目录均在仓库根 `.temp/risk-normalization-20261010/employee-intent-sql/`。

| 原件 | 判定 | 收尾 |
|---|---|---|
| `run-PPk3JI/result.json` | 27 个执行场景通过，PARTIAL_SCOPE | owned SQL SHUTDOWN；port 52101 释放 |
| `run-C8spOV/result.json` | 真实 MariaDB deadlock 1 项通过；actual replay 为受害者，完整回滚后精确 ID 有界重试 1 次 | port 53013 释放 |
| `run-auaU4k/result.json` | actual insert/page community NULL 2 项通过，正文提交、零 intent | port 53230 释放 |
| `run-EUXQgK/result.json` | 首次 deadlock barrier 测试设计失败，保留原件；不是候选代码缺陷证明 | port 52587 释放 |

开发报告 `report.md` 和 `evidence-manifest.json`；证据 manifest SHA `3793dbd1abad6d1dda77fabdff91b3fe7f82e72b2c1bfb8d7055817f1bee012b`。每轮 129 员工源码前后身份不变，未访问 production.env、外部 AI/采集/翻译/通知、生产计划任务。只读审查：`employee-intent-review/report.md`，结论 `PASS_READONLY_ISOLATED_AFFECTED_SCOPE_SQL_PARTIAL`。后补 deadlock 与 community NULL 证据补上其对应待验项，未改已冻源码。

## 原 21 项逐条证据与限制

下列 PASS 均是**开发范围**，不代签独立 QA。

| 项 | 结果与原件 |
|---|---|
| 1 | actual page F1 running→F2 正文+intent 同事务，owner 保留；PPk3JI #1 |
| 2 | 旧 success/fail 所有结果写入拒绝；PPk3JI #2 |
| 3 | future lease deferred 且意图保留；PPk3JI #3 |
| 4 | reviewed exact plan 指定旧 job→pending F2，新 claim/commit 一次；PPk3JI #4 |
| 5 | 同指纹 expired running 原 claim 路径；PPk3JI #5 |
| 6 | NULL running 无 orphan evidence blocked；PPk3JI #6 |
| 7 | 8 个完整旧身份冲突逐项拒绝；PPk3JI #7。锁内 actual affectedRows=0 未自然制造，未验 |
| 8 | F3/错误 scope plan 冲突、ordinary 精确 quarantine；PPk3JI #8 |
| 9 | pending/retryable future lease 保留；PPk3JI #9 |
| 10 | 真 gate busy/失去 ownership 零写；PPk3JI #10 |
| 11 | 审计后 commit 前 KILL 实际 gate connection，全回滚；PPk3JI #11 |
| 12 | 真 audit REVOKE、lock timeout 回滚；PPk3JI #12；真 deadlock C8spOV #12。affectedRows=0 未验 |
| 13 | 首次 commit 后丢弃返回，重复 reviewed plan 零二次准入；PPk3JI #13 |
| 14 | 新同 fp force HTTP202、active409、独立新请求202；PPk3JI #14。**同 requestId 持久幂等未实现/未验** |
| 15 | same/changed fp history 保留 marker、deferred_history；PPk3JI #15。**历史独立 lane 未实现，F2 不宣称最终可消费** |
| 16 | disabled/deleted/manual/account 阻断；PPk3JI #16。**自动日期窗未实现**；exact plan 比较 published_at 不能替代业务日期范围 |
| 17 | 正文 commit 后不执行 downstream，换新 Repository 回放持久意图；PPk3JI #17。模拟窗口，未做 OS 杀进程 |
| 18 | F2 锁阻塞真实 F3 producer，F3 generation=2，旧 ACK 不碰 F3；PPk3JI #18 与实际 InnoDB 等待原件 |
| 19 | historical light→deep parent running 同事务顺序保持；PPk3JI #19 |
| 20 | 空/超 batch/缺 version/SHA 错提前拒绝；PPk3JI #20 |
| 21 | **旧 Q1 split writer 未接新原子 fence，NO-GO**；未执行旧 writer 对抗或生产计划任务，不以其他通过覆盖 |

扩展 PPk3JI #22–28：scope 外正文、disabled 无新 SQL/锁、无 intent 存量、续租后恢复、failed budget/缺当前 analysis、坏 intent 正常 claim、account NULL。auaU4k #29–30 单独覆盖 community NULL。

## 未完成与生产边界

生产继续 HOLD：不重启 shared、不切包、不生产迁移/写库/回填/重析/入队/通知，不 push/合并/tag/发版，不启停 Q1 或改 ACL。配置的 writerCoverageEvidenceId/plan SHA 只是引用与约束，不能当真实 writer drain 或批准。

仍未完成：force requestId、历史独立 lane、自动日期窗口；旧 Q1、实际 loaded API/shared/translation 覆盖、实时通知窗口；旧更长正文与 raw fingerprint 的合并语义；生产 schema 门禁、真实精确名单和境内/境外定时抓取验收。关闭新开关或退旧包会保留意图账本，但旧包不会继续回放，已 repair job 不得交旧 Q1。无 DROP 脚本。

下一交接：独立测试对完整 v069 冻结包自行写断言、fresh loopback MariaDB/actual API 验收新增非历史 intent/repair 范围，核 schema 与逐文件 SHA、双连接原件、收尾身份；开发原件只作复现参考。不重 v060/v065/v066 已过矩阵。经理唯一维护正式待办与生产门禁。

## 独立 QA 最终收件

独立 `.tests/2026-10/2026-10-10/v059_current_intent_independent_qa.md` 已正式交回：`PASS_INDEPENDENT_ISOLATED_PARTIAL_SCOPE`，24 个唯一执行场景通过。1221 文件/9 变化/原基底无缺项、manifest与schema身份核实。原件索引在仓库根 `.temp/qa-v059-current-intent-summary.json`，三轮 `qa-v059-intent-I5ig4j`、`DD6jsI`、`STmG41`；末轮两个真实 InnoDB 锁等待文件保留。

独立覆盖三包正文/意图同事务、旧 F1 commit/fail 拒绝、active/续租/过期/NULL lease、无意图 reviewed plan、八旧身份冲突、audit/ACK/record后真实 gate KILL 全回滚、权限/timeout/真实deadlock精确一次重试、F2/F3旧ACK、新repo恢复、scope/disabled/community NULL/坏intent正常claim、历史保护和actualHTTP409/202。三轮自建 SQL/HTTP 全部核身份关闭与端口释放，无生产操作。

保留首轮 fixture 缺 API board 列、第二轮假定任务 fingerprint 可空的 QA 失败原件，只续验未过项；最终实际验证 NOT NULL 拒绝与计划 NULL 身份冲突，不假称 NULL 行 CAS。source deleted 标志本轮未独立单验，开发证据不代签；locked affectedRows=0 仍未验，原 requestId/historylane/datewindow/旧Q1等 NO-GO 全保留。海外专属 writer 必须独立 overlay/QA，本 PASS 不覆盖它；对应后续范围 `v071_overseas_current_body_writer_scope.md`。
