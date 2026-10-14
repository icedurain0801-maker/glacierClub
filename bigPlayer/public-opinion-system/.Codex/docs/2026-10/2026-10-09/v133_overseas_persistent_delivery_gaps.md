# v133 海外持久目录与独立交付路径缺口

Status: BOUNDARY_CONFLICT_HOLD

本轮员工只读核查，无生产写入、服务操作或部署。海外专属持久路径建议仍为 `C:/ProgramData/PublicOpinion/data/overseas-bigplayer/v1/{receipts,journals,intents}`，备份建议 `C:/ProgramData/PublicOpinion/backups/overseas-bigplayer`；员工核查对应父目录不存在。不是已部署路径。

员工核查现役 Worker XML SHA256 `82cb2aa0b974c0df980405f3eef379f88c8c59d12d3ef06ab9ad7dc8111acbee`，入口仍为 `C:/ProgramData/PublicOpinion/releases/worker-release-taptap-20260921-v055-formal1/worker/src/worker.js`，`UNIFIED_SOURCE_SCHEDULER_MODE=enabled`，WORKER_STATE_ROOT仍指向该版本candidate-staging的data/state。此处为员工报告，后续交付验收仍须独立核原件；不是热接线授权。

`overseasStateDirectoryPolicy.js` 生产策略未实现，request/run-contract journal仍强制仓库根.temp；环境变量不能代替目录策略和真实LocalService写入/祖先路径不可替换验证。建议目录不能作为恢复proof的替代入口，本轮不修改被停止proof。

真实交付必须补齐：生产专属路径与ACL/持久恢复能力、海外consumer排他协议、现役入口实际接线及国内回归证据；当前无“不停/不重启国内共享Worker同时热接新海外代码且不新增第二消费者”的可执行证据。不能默认启动新海外服务解决此冲突。生产继续FULL_RUNTIME_NO_GO/CUTOVER_HOLD，需项目经理收口实际交付路径；隔离预算/父矩阵不能替代真实HTTP/AI/恢复完成。

历史祖先技术方案：父聚合终态核验需current读取及完整历史祖先闭包，先有界发现再排序锁并重核引用；现普通RR快照与只锁本轮links不足。动态barrier验证writer先提交时拒绝、锁后writer超时和释放后写入；membership同理。仅方案未落地，不宣称并发通过。

## 开发负责人只读复核与最小边界

已直接读取现役 `C:/ProgramData/PublicOpinion/services/PublicOpinionWorker.xml`，入口确为旧v055，stoptimeout=60 sec、interval=60000、scheduler enabled。直接检索旧release worker：sharedDeps在首轮build后常驻复用；未发现watch/require.cache重载入口。存在commitLane drain不代表外部热加载或整个扫描可安全排空协议。

在禁止第二消费者前提下，新代码最小实际加载动作是：经QA的不可变新release、海外专属持久目录/ACL与备份策略、替换单一Worker入口，再停止旧进程/启动新进程；这会短暂中断同进程国内采集，当前“国内不动”边界禁止本轮执行。若坚持零中断，须先开发并验收独立热接/排他协议，现役无可用入口证据，不能假定存在。

具体影响时间尚待隔离演练：现配置停止等待上限60秒不是停机总时长或安全排空保证；另有启动/DB连接/首轮扫描耗时，不能承诺固定分钟。动作期间国内不会新claim，已有任务可能等待lease到期/按现役规则处理；未演练不得承诺零重复或零丢失。

回退建议（仅交经理评审，不执行）：保存原XML/hash、旧release和完整持久备份；新进程在开放扫描前preflight失败则停止新进程、确认无第二owner，恢复原入口再启动旧进程；新海外已产生持久任务后不得让旧版盲目接管，必须保持海外隔离HOLD并有新旧schema兼容与精确任务处置方案。恢复原XML不等于回滚DB。生产DDL/服务切换/账户或目录ACL变更需另行实际审批。

## 可评审切换依赖与判定（未实施）

1. 完整生产state策略、账户ACL/防替换验证、凭据与审计保存/备份恢复演练；三站registry/board与真实请求区分合同确认；持久预算/精确job消费者/禁发通知真实边界；certified cursor下一槽闭环；当前被停止proof不可用，恢复能力未交付必须维持HOLD。
2. 排空机制须先开发并隔离验证：停止新scan/claim、等在途HTTP/事务/AI调用有界退出或精确标未知，确认scan owner、run lease与事务无未决；只看服务Stopped/进程退出不能证明任务排空。当前shutdown直接pool.end且未确认scanPromise整体等待，不能作为安全排空完成证据。
3. 单消费者切换判定：旧owner停止且没有live claim/未知ACK未处置、端口/进程排他、schema兼容与新入口preflight完整通过，才可开放新扫描。未知状态或second owner一律HOLD，不自动回收/重放。此判定未在生产执行。
4. 回退判定：开放扫描前失败可按原XML/旧release恢复；开放后出现数据或任务状态变化时先停止新增并取精确证据，禁止把新schema/新任务交旧版盲接。只恢复入口、不删除/倒退生产数据；DB回退须另计划/审批。
5. 必要隔离演练：模拟长事务/HTTP超时/commit未知、服务停止有界退出、单owner新旧交接、首轮扫描与启动时长、回退前后国内基线、三站真实源合同mock入库→analysis/translation job→下一槽闭环。当前仅fixture预算/父/祖先锁原语，不覆盖此演练，更不覆盖三站真实HTTP/AI翻译与下个真实定时槽。

国内影响需改变边界：共享Worker重启暂停同进程国内新claim并可能延后运行中的采集；时长必须以上述演练测量+生产窗口确认，不提供未经验证的分钟数。若经理不允许此边界变化，就只能继续HOLD，不能偷偷切服务或新增第二消费者。

## 隔离演练待实施清单

| 依赖 | 演练入口/证据要求 | 当前状态 |
|---|---|---|
| 全局排空 | 自有fake runtime停止新scan/claim、长事务/超时/UNKNOWN；记录promise/owner/lease清空或HOLD | 未实现 |
| 单consumer新旧交接 | 两隔离进程竞争owner，旧排空后新唯一，失败无重放 | 未实现 |
| 持久目录 | 正式策略接口、拒绝路径替换、独立服务账户写入、备份读取及中断恢复 | 未实现，temp journal不代替 |
| 入口切换/回退 | 合成XML与隔离worker重启测量停止/启动/首scan、开放前后失败分界 | 未实现，生产XML只读 |
| 三站下一槽 | 三站合同区分、入库及job精确scope、持久cursor准入后一槽不重复 | 未实现，现两站合成闭包不代替 |

实际生产依赖均待完成，不使用已有fixture通过来填这些演练状态；新建评论链与FK竞争只计对应隔离模块进度。
