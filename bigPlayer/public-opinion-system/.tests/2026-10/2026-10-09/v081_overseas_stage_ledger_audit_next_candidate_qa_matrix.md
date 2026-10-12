# 海外任务账本/绑定审计下一候选独立 QA 矩阵

Status: `CANDIDATE17_OFFLINE_RUNNER_UNSAFE / SCHEDULED_NOT_IMPLEMENTED / RUNTIME_NO_GO`
Owner: 测试负责人
Input: `.Codex/docs/2026-10/2026-10-09/v104_overseas_final_engineering_and_delivery_plan.md`
Implementation log: `.Codex/docs/2026-10/2026-10-09/v105_overseas_approved_isolated_implementation.md`
Prior result: `.tests/2026-10/2026-10-09/v080_overseas_candidate16_recovery_independent_qa.md`

## 结论

v104 对候选专属账本、同事务派生任务、run/epoch/audit 绑定及持久计数给出了可测的主路径；开发中的局部实现尚未冻结，以下全部为独立 QA 待测，候选16的通过项不转移。经理允许 manual 账本/audit/recovery 完整闭包单独冻结、独立提测并给出精确绑定该阶段的局部结论；scheduled 全链另批，当前强制关闭且 `NOT_IMPLEMENTED`。manual 阶段通过既不代表 v104 全需求完成，也不代表生产 GO。两张候选表只允许在全新自有合成13316实例建表；即使隔离 SQL 全过，也不证明生产迁移或真实采集可放行。

当前开发失败原件 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-rZn0Hb/result.json` 为 `NO_GO`，历史规模 fixture 报 `ER_TRUNCATED_WRONG_VALUE`。结果列出前16项检查及局部人工CP事务矩阵，但整轮失败、尚未冻结，不能将前16项写为整批PASS。开发修复后须新运行并冻结；保留本失败原件。

后续开发原件 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-ywLzb4/result.json` 报局部17主项 `PASS_ISOLATED_REAL_SQL_PARTIAL`：合成历史100/1000 roots sealed，10000/10001 roots触固定10000ms预算，history任务回滚为0并标partial；其`historyScales.actualRunSourceExecuted=false`，不能当实际manual主链规模通过。另一次 `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-cVjlol/result.json` 为`NO_GO / NEW_PROCESS_MAINCHAIN_FAILED`，开发称已修合成owner观测，修后新运行尚待核。这些均属未冻结开发证据，不转移为独立QA PASS；两份结果均报告自有实例停止/13316释放、`productionTouched=false`。

## 阶段边界

| 阶段 | 可独立验收的完整范围 | 不可据此宣称 |
|---|---|---|
| manual 候选 | 实际 manual 入口与可信身份、schema/历史同快照预算和任务全集封口、同页动态任务登记、pending恢复与故障断点、run/epoch绑定audit与source原子终态、持久links计数/Progress、ACKunknown只读对账、非目标回归、scheduled强制关闭 | scheduled真实父子/slot全链、生产迁移、真实provider/AI/翻译、共享切换或全需求GO |
| scheduled 后续候选 | 独立admission、slot/parent-child持久合同、首次claim/恢复、全请求及page/terminal父子fence、父聚合终态、readiness与下一真实调度槽 | 不以manual parent=NULL或scheduled纯身份测试代替 |

## 已覆盖

- 站点各自独立run及scope，schema先登记；历史root在同连接REPEATABLE READ事务扫描并封口，页面派生comment/reply任务在page commit前登记，seal后不可追加。
- page和terminal共锁run；成功前核schema/history/扩展封口、全expected任务与精确checkpoint、lane排空；失败、超预算、漂移、unsupported只得partial。
- audit在真实Journal准备后按run/epoch绑定，run/audit/source终态同事务；ACK未知只读reconcile；旧无绑定audit保留`manual_review`。
- 用持久唯一run-content links计算discovered/stored且排除context；posts、comments、replies分类保留，CP聚合不直接等同唯一内容。

## 待确认

| 项 | 当前状态与 QA 所需口径 |
|---|---|
| 历史同快照预算 | 数量/耗时/内存上限须在合成规模测量后固定到代码、manifest及原始结果；超限必须rollback+partial，不能在测试中临时调高。 |
| 当前规模测量边界 | 开发局部100/1000封口、10000/10001触时限partial；内存上限仍待固定，需补实际manual入口的预算行为、并发seal与运行后生产连续性独立证据。 |
| canonical task identity | `task_kind/task_key/root` 的序列化、排序、hash、重复feed/site与schema版本规则须冻结；同一逻辑任务重复发现应幂等，descriptor不同应冲突而非覆盖。 |
| 完成证明 | 每个expected任务的完成条件需绑定本run精确CP、cursor/页证据和terminal版本；空页、未支持类型、错误`hasMore`不能靠状态字段伪造完成。 |
| 计数口径 | 同一个内容跨feed、重复页、历史context祖先、已存未变、新评论/回复及内容变化的link集合/hash如何分类，需固定版本和样例。 |
| scheduled合同 | 后续独立批次冻结parent/child、slot CAS、窗口及恢复规则；manual阶段只验强制关闭、caller伪装/可变配置均不得激活，不能以manual测试替代scheduled。 |

## 缺失/风险

- 两表DDL的隔离通过不涵盖生产历史数据、索引规模、旧版本读写兼容、回滚及生产迁移审批。
- 当前receipt/Journal/intent在根`.temp`仅属测试可信存储；真实持久根、服务账户ACL、备份恢复尚未形成生产验收证据。
- 同事务设计若只测最终状态，可能漏掉page内容已写而expected任务未登记、audit成功而sync失败等中间故障。需注入提交前、提交后ACK未知和并发seal竞争。
- 旧无版本、旧无绑定证据不得根据source/时间邻近回填；若旧消费者能读取新任务，回退或共享切换仍不可执行。
- 国内/Discord/TapTap/Facebook的普通路径必须证明未触发候选表、未改checkpoint/audit身份或调度行为；静态代码未改不等于运行回归通过。

## 建议补充的验收用例

| 前置条件 -> 操作 -> 预期结果 | 最低证据 |
|---|---|
| schema尚未完整登记 -> 尝试feed/comments/replies派发 -> 零transport、无成功封口 | 请求计数、账本/Journal读回 |
| 同一RR历史快照含分页root且预算刚好命中/超出 -> 扫描并seal -> 命中完整封口，超出全事务rollback且partial；跨事务MAX UUID不得替代 | 事务隔离、root集合与gap/budget记录 |
| 重复feed/页给同一task和冲突descriptor -> 并发登记 -> 同descriptor一次、冲突拒绝且不覆盖 | unique键、descriptor hash、行数 |
| 页面含新post和动态reply -> 在page commit前/后中断自有client -> 内容、CP、cursor、expected任务和links同生同灭；恢复不漏reply | 真SQL事务、故障断点、新进程读回 |
| page登记与terminal并发 -> 一方先获run锁 -> terminal不得漏任务成功，seal后page不得追加 | 两连接竞争日志、最终账本 |
| 缺一个expected任务或错run CP -> 请求success -> 被拒为partial，原任务仍pending | 精确run/task/CP SQL读回 |
| schema漂移、history gap、unsupported、stall -> 恢复并请求封口 -> 不删旧pending、不记成功 | 漂移前后hash及状态 |
| audit创建、sync/audit/source终态各注入故障 -> 提交 -> 全回滚；同run不同epoch/同source两run不串绑定 | audit/run/source版本及事务读回 |
| terminal commit ACK丢失 -> 只读reconcile -> 全字段相符才accepted，否则UNKNOWN/拒绝，且无补写 | 新连接读回、写计数0 |
| epoch1含评论/回复，重复feed并含context祖先 -> 计算links与CP -> 唯一业务计数正确、context排除、版本/hash稳定；CP聚合可不同 | link集合、分类计数、CP原值 |
| 旧无版本终态或无绑定running -> 恢复/统计 -> `COUNTER_CONTRACT_UNPROVEN`或`manual_review`，无伪造归属及旧行改写 | 前后旧行hash |
| 普通国内及Discord/TapTap/Facebook输入 -> 运行原有最小回归 -> 无候选表SQL、身份/调度/结果不变 | 非目标用例和SQL调用记录 |
| manual 候选收到真实persisted scheduled trigger、伪manual caller或运行中更改scheduler mode -> 尝试派发 -> 在adapter/claim/HTTP前拒绝，且普通国内/其他平台路径不变 | trigger/parent读回、零transport/claim、新旧配置快照；manual阶段必测 |
| 后续scheduled候选同窗口与manual竞争 -> 合成slot调度及恢复 -> 独立parent/child合同、单次admission，不借manual parent=NULL充当scheduled | slot/parent/child/claim原始行；不作为manual阶段放行前置，但全需求仍NOT_IMPLEMENTED |

## 冻结交接门禁

冻结前门禁原定：开发补齐reply自身页before/after中断、固定内存预算、并发seal、非目标真实SQL以及新CAS失败修复复跑后，交付manual阶段新候选manifest、全依赖SHA、Node/MariaDB版本、精确离线与隔离SQL命令、原始PASS/FAIL及故障注入结果。QA先审脚本身份和owned SHUTDOWN，记录13316与生产只读基线，再执行前hash、离线、全新自有13316 SQL、后hash和生产连续性复核。manual阶段每行按实际证据标PASS/FAIL/NOT_TESTED；若scheduled强制关闭或非目标回归失败，则manual阶段亦不通过。scheduled全链另列`NOT_IMPLEMENTED/NO_GO`，不以其未实现阻止manual局部报告，也不以总测试数替代矩阵。QA不改业务代码；真实provider、费用、生产DDL与共享暂停另行审批。

候选17已冻结，但全量离线入口含会默认连3306并对`public_opinion_test`建表/删除的`server/test/app.routes.test.js`。QA仅完成外部锚、875前后hash和单独startup 1/1；未运行危险全量命令或fresh SQL。详见`v082_overseas_candidate17_unsafe_offline_runner_qa.md`。开发需提交实际自测DB目标脱敏证据和新的硬隔离测试入口/冻结包，或明确排除该集成用例并标未测；当前候选17不能据开发1161/1161宣称独立PASS。
