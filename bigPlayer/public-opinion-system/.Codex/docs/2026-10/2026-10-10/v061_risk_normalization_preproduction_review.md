# 风险规则修复与生产实施准备交接

- Status：三项实施准备工件已收齐，v060 风险规则隔离独立 QA PASS；生产闭环仍待核收，生产 HOLD。本文不是执行授权。
- 日期：2026-10-10。
- 当前风险规则候选：v060 / `candidate-xeQZCM`；独立 QA 最终受影响复验 48/48 PASS。
- 未实施：服务停启、生产回填、历史重析/入队、通知、push、发版。
- 不替代经理唯一待办，不改写 v058/v059 的失败与历史记录。

## 已确认根因及修复边界

1. 现役 AnalysisWorker 仍直接持久化旧模型/缓存等级，缺少统一风险归一化。positive 被写成 attention、negative 高分仍 attention，均有实际记录支持。负面样本 926869 的分数 .86/confidence .96，926910 为 .80/.60，不能归因为旧 confidence 门槛。
2. 正文变化后旧入队实现更新 job 指纹但保留 completed/running，旧写入未核对当前正文版本，造成分析卡在旧版本或旧结果覆盖。v060 已补正文指纹 CAS 和工作树 producer 入队修复，但生产 shared/API 仍使用旧包。
3. 同正文 API force 可把 running 置 pending 而保留旧 lease。仅正文指纹 CAS 不能阻止旧 owner 提交；消费者结果应同事务校验 job 状态、owner、lease、profile/version 及 job/content 双指纹，并原子提交分析、缓存、质量、审计、任务完成。此增强目前只有准备方案，未合入 v060。
4. 历史标记在 light→deep 或普通重新入队时可能丢失。只禁钉钉仍可能生成历史告警；历史任务必须在 worker 与告警入口均阻断，并保护标记和初始精确范围。该工件独立准备，未合入 v060。
5. 仅验证工作树或进程存活不能证明生产采用了修复；切换前必须核真实入口、基底/候选 SHA、实际所有分析 writer 和消费者。

## 已确认规则及候选身份

positive 固定 normal，质量推荐独立。negative 明确游戏机制、玩法、匹配公平性、奖励概率、bug 或服务投诉直接 urgent；其他 negativeScore≥.50 为 urgent，confidence 不阻断；低分无明确问题为 attention。已有 negative urgent 不降级，neutral 保持。咨询和裸关键词不能机械升级。模型提供投诉语义与本条原文证据；旧结果缺语义字段时只依据原文明确故障表达兜底。

冻结文件：`v060_risk_normalization_candidate_manifest.json`。

- runtime manifest：仓库根 `.temp/risk-normalization-20261010/candidate-xeQZCM/runtime-overlay-manifest.json`
- SHA256：`ad9cde6bd40a73a88acadb1b35ff3722dbc242d494a6bbd9c41b49f79cbb43af`
- v058、v059 因旧结果咨询误升被退回，均不可部署。
- 开发验证：原 309 项通过；首次修复受影响 103 项通过；v060 再修复 normalizer 10 项通过。独立隔离 SQL/API 曾通过，最新仅 normalizer 表达式变化，遵照经理要求不重复完整矩阵。
- v060 不包含本轮新增消费者事务栅栏或历史抑制方案；不得把规则 QA 通过扩大为生产实施闭环通过。
- 独立 QA 正式回执：`.tests/2026-10/2026-10-10/v055_risk_candidate_final_qa.md`；原件仓库根 `.temp/qa-v055-risk-recheck-1791615824655.json`，48/48 PASS/exit0；v053/v054 FAIL 原件保留。候选身份与三包 SHA 一致，除 normalizer 外 runtime 与已验 SQL/API 候选同 SHA；生产真实目标未签。

## 真实消费者核查

| 入口 | 已证事实 | 尚未解决 |
|---|---|---|
|独立 AnalysisWorker|现役 v055，实际分析 writer；优先最小切换目标|旧规则、同指纹 force 竞态；需独立受影响验收|
|shared Worker|现役海外排除包；主循环 enqueueOnly，未发现 processDownstream 调用|旧 producer 的指纹/状态/标记行为仍需收口；本轮禁止重启|
|API|现役 v019；reanalyze 只 force 入队|同指纹 force 撤销状态但旧 lease 仍有效|
|独立海外 daily|实际只原子入分析/翻译队列|保持现状，不借本轮改采集或调度|
|旧 BigPlayer Q1 Daily 02|Enabled=true；action 可进入 Q1AnalysisRunner，最近结果失败|潜在 writer，不能伪称已禁用/排除，不擅自启停|
|translation Worker|现役包 ACL 拒读；工作树只翻译|现役是否存在分析写入尚待确认，不能根据路径推定|

消费者准备工件：仓库根 `.temp/risk-normalization-20261010/employee-consumers/` 的 `plan.md`、`sql-contract.sql.txt`、`consumer-fence.patch.txt`、`mock-contract.test.cjs`。patch 是流程提案，不是可直接 git apply 的实现。mock 9/9 仅证明状态合同，真实 SQL 并发验收未做。

## 确定性回填 schemaVersion 2

正式脚本：`scripts/risk-normalization-backfill.js`。仅生产 READ ONLY 预演已运行，apply 未运行。

- 清单：仓库根 `.temp/risk-normalization-20261010/backfill-v2-dry-run-20261010.json`
- SHA256：`25ea8a5b1621dfb6ee6689a0ae0b54149e8fd3b3fb02535aae387c874e248050`
- 确定性分析 7787：positive 1602，negative 6185；每批 100，共 78 批。
- 独立缓存阶段 10168 项：每批 100，共 102 批。与分析阶段分开，避免分析已完成阻止缓存恢复。
- 正文过期 246、低分需语义判断 1149，均不在确定性改等级范围；孤立记录 8829 保留。
- 审计 JSON 估算约 22.44 MiB；含缓存重复引用时偏保守，不等于最终数据库磁盘占用或预留容量。
- 清单是时间点快照，生产仍在运行。执行必须逐条锁定、CAS，已变化项跳过并计数，不能保证最终更新数等于预演数。
- 缓存仅覆盖本计划相关指纹中存在冲突的缓存，不能称全库缓存全部纠偏；消费归一化和新 cache key 另提供保护。
- analysis/cache 分别保留原行审计，审计失败同事务回滚；positive 混合告警保留含负面关联的整条告警。历史批次不调用 AI、AlertEngine 或 notifier。
- approval JSON 的 `writerCutoverVerified` / `sharedWorkerEnqueueRaceResolved` 是防误操作断言，不能当成这些事实已经成立的证据；本次没有生成批准文件。

故障恢复测试已由主代理审查集成到 `server/test/riskNormalizationBackfillRecovery.test.js`，连同原测试共 8/8 通过：100 条成功后下一批审计失败回滚并重跑、分析已完成而缓存独立恢复、同秒缓存 score/model 改变跳过、commit 前失锁回滚、混合告警保留。该测试真实调用 apply，仅数据库 peer 为有事务状态的 mock；不证明 MariaDB 行锁、真实并发或 COMMIT ACK 行为。

## 历史重析容量与边界

当前只读核实配置：`AI_ANALYSIS_JOB_BATCH_SIZE=10`、light batch=10、light/deep version=`sentiment-v1`；deep batch 未显式配置，现役代码默认 20，但本消费者每次仅 claim 10，不能据 20 估算实际每次模型调用条数。

246+1149=1395 是待评估记录数，不等于批准的重析任务数。保守假设全部先 light 再 deep、每次有效 10 条且不重试：最多约 140+140 次批请求、2790 次内容级分析；实际依赖去重、缓存、已有 profile、深析比例、分批尾数、重试和返回 token。该场景不是费用或时长承诺。正式预算需精确 scope 与模型单价、token 上限后另核收。

历史标记工件已交付在仓库根 `.temp/risk-normalization-20261010/employee-suppression/`，包含 README、三包 patch、manifest、verify 和结果；37/37 纯 mock 通过。基底仍为 v059 的 `candidate-nc7FdP`，未改 normalizer，但也不能直接冒充 v060 最终组合候选。必须先集成消费者原子提交，再将历史 deep 准入借用同一事务连接、放在 parent finish 前。旧 producer 会擦标记的问题未解决前不得执行历史入队。

## 单分析服务切换和回退准备

工件在仓库根 `.temp/risk-normalization-20261010/employee-control/`，默认已绑定 v060；语法与只读 validate 通过。已补锁 ownership 逐段复核、API/shared wrapper 与 Node PID/创建时间/命令 hash 保护，回退 state/已切换 XML/配对原备份防漂移。仅 validate 可只读运行；未演练真实服务切换。

计划持真实 `po-analysis-consumer` 锁，等待当前迭代排空后只切 AnalysisWorker 一次；核候选完整 runtime 树、原 XML、保护 API/shared PID 与进程身份，新 release 不覆盖旧目录。锁不成功则不操作服务。回退停止分析服务，恢复已核实原 XML 后保持 Stopped，避免启动不符合用户规则的旧版；不逆向回滚已成功审计的数据批次。

当前 writer gate 未满足（旧定时任务、translation 现役未排除），不能执行 apply。DB 断连或控制进程崩溃会释放 advisory lock，不能把持锁方案描述为持久熔断。

## 收口顺序与未完成工作

2026-10-10 后续实施准备更新：消费者已从流程提案推进至实际事务实现，员工真实隔离MariaDB16项通过；API/shared安全入队与历史静默已串行形成独立v066-r3候选。下表保留本文件最初核收时点，不代表后续候选已独立QA通过。最新身份、证据和尚未完成项见 `v066_risk_implementation_candidate_manifest.json` 与 `v067_source_save_closure_and_implementation_handoff.md`。生产HOLD；当前正文精确补队与现役writer覆盖仍未解决。

| 顺序 | 负责人 | 具体交付 | 状态 |
|---|---|---|---|
|1|独立 QA|v060 身份与受影响咨询/故障规则复验|48/48 PASS，仅隔离范围|
|2|开发员工/主代理|控制脚本 v060 绑定、锁/PID/XML 防漂移检查|已准备，仅语法/只读 validate|
|3|开发员工/主代理|schema2 恢复、缓存同秒变化、失锁、混合告警验证|已集成，8/8 mock；真实 SQL 并发未验|
|4|开发员工/主代理|历史标记/接线 patch 及受影响 mock|已准备，37/37 mock，未合并|
|5|开发负责人→经理|核收三项实施工件与真实 writer 阻断|本文件已交准备结果，待核收|
|6|后续明确任务|消费者事务栅栏与抑制串行集成，新候选及真实并发 QA|未执行，不能沿用 v060 PASS|
|7|经理/用户|生产影响、预算与精确范围核收后实施|HOLD；本文件不是授权|
|8|独立 QA|真实样本、列表/概览、国内与海外采集回归|生产实施后进行，当前未执行|

不重启 shared 的精确范围消费者修复只能覆盖获准列表，不能称未来所有 producer 正文变化永久闭环；永久闭环仍需有界增量发现或 shared/API producer 修复及相应批准。
