# v058 风险组合候选独立受影响范围验收

日期：2026-10-10。候选：candidate-implementation-v066-r3。

结论：PASS_INDEPENDENT_ISOLATED_AFFECTED_SCOPE。最终 fresh MariaDB + 实际 loopback API + 依赖受控 VM 共 37 个行为检查及 1 个实例身份检查通过；生产继续 HOLD。此结论不包含当前正文精确补队或生产恢复闭环。

## 冻结身份

manifest SHA256：`18b8d560d48e85e4b05dcef24640da966d6566294ed267f758f0ce84d1a97234`。三 runtime 共 1218 文件全部 SHA 匹配，执行前后不变；17 个改变文件包含在逐文件核对中。使用冻结实际 API/collection Repository.enqueueAnalysisJob、safeAnalysisEnqueue/historicalAnalysisAdmission 和 analysis Repository 消费者方法，无同名假方法替代。

脚本：`.tests/2026-10/2026-10-10/v058_risk_independent_sql.cjs`。复用已审阅员工 runner 的隔离初始化、fixture schema、HTTP 请求和锁观察工具，以及两项必要交错的暂停装置；新增 QA 断言、自建数据库和原件，不引用员工结果作为独立 PASS。没有复跑旧消费者16项全矩阵、v060规则矩阵或来源。

## 结果

| 独立范围 | 行为数 | 证据 |
|---|---:|---|
| API 与 shared 新安全 producer | 12 | 当前正文变更时普通入队保留活跃旧任务，force拒绝，旧观察指纹拒绝；pending有效租约和expired running不撤owner；同指纹历史marker保留、force拒绝；借连接insert/update随外层回滚 |
| 实际HTTP正常force | 1 | POST reanalyze 返回202，原任务pending、attempts重置、lease清空 |
| 消费者正文变化后commit/fail | 1 | 冻结后改正文fingerprint，结果提交与失败更新均拒绝，状态无变化 |
| 历史deep同连接回滚与成功继承 | 2 | 最终audit处注入故障后analysis/cache/quality/deep/job/audit均回滚；同快照重试成功，light完成、deep pending并继承batch与fingerprint，audit记录suppressed及parentJobId |
| 三runtime历史静默 | 12 | 实际AlertEngine process/processAiUrgent，content/analysis上malformed reserved camelCase marker均返回空；repo/notifier任一访问即失败，验证无副作用 |
| worker缺方法fail-closed | 7 | 实际冻结worker导出在VM中：processDownstream分别缺5方法，另两入口缺commit方法，报ANALYSIS_LEASE_FENCE_REQUIRED，无AI、旧writer、cache或alert回退 |
| 真实两连接锁交错 | 2 | consumer提交持content锁→实际HTTP force等待，未提交analysis对第三连接不可见，提交后202，后到force pending不被旧finish覆盖；shared持content/job锁→API force等待，后到reason/keywords获胜 |

HTTP共4份证据：活跃任务409/ANALYSIS_JOB_LEASE_ACTIVE、历史同指纹409/RISK_HISTORY_JOB_PROTECTED、正常force202、consumer交错后的force202。实际app.js handler在本地HTTP运行，未以VM替代路由。上述两个409后数据库状态保持不变。

worker VM仅替代外部依赖，正常化函数是隔离stub，不验证v060规则。缺方法时processAnalysisBacklog允许先调用configured()配置检查，随后必须报错；该检查不构成AI分析或旧writer回退。

## 原件、QA断言修正与收尾

最终：仓库根 `.temp/qa-v058-risk-IFSqfV/result.json`，exit0，38检查通过；SQL端口64119、HTTP64145，serverId20261059。两项锁证据在同目录：`consumer_then_actual_api_force.engine.txt`、`shared_then_actual_api_force.engine.txt`，记录实际waiter/blocker线程及po_contents记录锁。

首轮：仓库根 `.temp/qa-v058-risk-oRYDnI/result.json`，exit1保留。失败由QA要求backlog在缺方法时连configured()也不可调用的过严断言造成，未发现候选AI或旧写路径执行。调整为仅允许一次配置检查，禁止其余调用。首轮SQL63918、HTTP63956均已停止释放。

第二轮原计划只续验backlog与锁交错，但QA_V058_TAIL被runner清理环境变量移除，造成重复本轮先前通过项。已修正为清理前冻结tailOnly；不再运行测试。重复无真实AI、采集、认证、通知或生产操作。旧消费者全矩阵/v060/来源均未执行。该QA运行控制问题与候选缺陷区分，失败原件不改写。

每轮fresh datadir均为仓库根.temp独立目录，mysqld显式--no-defaults、event-scheduler=OFF，仅loopback，fixture账号仅此库CRUD。API只读新fixture.env，AI使用synthetic配置且fetch禁止，未运行分析器、采集器或调度器。实例身份以port/serverId/datadir/pid_file/version/PID/owner核对后SQL SHUTDOWN。两个原件均identityBeforeShutdown/serverStopped/portReleased/httpPortReleased为true；另只读确认四端口无监听。未删除产物。

QA脚本语法与空白检查通过。业务文件、生产库/配置、经理待办未修改，未部署/push。

## NO-GO保留

当前正文变化且旧活跃任务存在时，新producer保留旧任务，但本轮真实SQL也确认没有自动建立当前新指纹的补队：这是已知未实现能力的现状验证，不是该能力PASS。

以下仍不关闭：当前正文精确补队；loaded API/shared切换与覆盖；Q1潜在旧writer；translation现役ACL拒读；实时外发事务窗口；生产国内/海外恢复与实际数据纠偏。本候选独立受影响功能通过不得用于宣告生产闭环。历史静默证据验证保留marker输入，不证明所有现役writer已保留marker。
