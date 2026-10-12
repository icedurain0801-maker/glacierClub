# 候选16：海外派发与恢复整批隔离 QA 交接

Status: frozen-awaiting-independent-QA / RUNTIME_NO_GO
Date: 2026-10-09

一句话需求：独立验证海外候选的逐请求派发fence、epoch恢复、真实自有client中断、持久游标/队列与终态ACKunknown，非生产放行。

已拍板决策：仅当前模型；员工只读审核、开发负责人唯一落地；独立合成MariaDB127.0.0.1:13316/serverId20261036/根.temp新datadir，只owned control SHUTDOWN。生产3306/PID5900、Worker19584、3001/PID19768及启动时间不动；无真实HTTP/凭据刷新/AI或翻译消费/第二生产消费者/迁移/push/发版。候选15和全部失败证据保留。

## 冻结与文件路径

- 新快照：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate16-20261009-01`
- 清单：同目录本项目文档 `v102_overseas_candidate16_recovery_frozen_manifest.json`；658个文件。按 `inventoryExtraFiles` 核哈希，只向verifyInventory传 `{nodeVersion,policy,files}`。
- 变更与失败记录：`v101_overseas_progress_epoch_recovery_design.md`。
- 核心新增：`worker/src/overseasBigPlayerDispatchGuard.js`、`overseasManualProgressRecovery.js`、`overseasRecoveryIntent.js`、`overseasRecoveryLineage.js`、`overseasRecoveryJournalRepair.js`、`overseasRecoveryCandidateFactory.js`、`server/src/db/overseasRecoveryClaim.js`。
- 正式验证：`scripts/overseas-isolated-mariadb.js`、`overseas-isolated-mainchain.js`、`overseas-isolated-reclaim-checks.js`、`overseas-isolated-claim-client.js`、`overseas-isolated-page-crash-checks.js`。
- 快照17文件离线144/144 PASS、exit0；原始 `snapshot-raw.txt`。工作树最后真实SQL根.temp `overseas-real-db-1StTEe/result.json`，11主检查及子矩阵PASS，owned DB已停13316释放。冻结SQL复跑结果随后补充。

冻结快照真实SQL复跑：根.temp `overseas-real-db-lasBdq/result.json`，11主项及全部本交接已测子矩阵PASS、exit0，serverStopped/portReleased=true；无真实HTTP/AI/翻译消费。后哈希仍须独立复核。

开发复跑后658/658哈希一致。已真实消息发送测试负责人 `01a08404-2cd0-73c2-8511-e2f3f4885bf1` 与项目经理 `01a083d6-a4ad-7543-9050-783a06307f66`，当前待独立QA结果，非QA放行。

## 已测/未测矩阵与证据边界

| 场景 | 开发证据 | 限制 |
|---|---|---|
| 两站actual runSource、第二站重启、全部completed零写 | 真实SQL、首站完整记录/Journal字节不变 | 每站独立run、parent_run_id NULL，不伪称父run |
| 逐token/detail/comments/重试标志入口派发 | 真adapter模拟12测试；SQL旧owner异步准备后零transport | 重试标志入口不等于真实auth-refresh重试；transport调用即派发的可信合成合同 |
| 已发延迟response后epoch变化 | 实际PageStore事务fence拒写 | 不撤回已发请求，不证明socket发送时点 |
| 同精确intent并发CAS、新Nodeepoch4 | 双SQL调用一胜者、exact recoveryClaim=1 | 不是两个新client进程同时竞争 |
| claimcommit后Journal前中断自有client | 真实spawn handle中断、过期显式intent补Journal3、新Nodeclaim4 | live owner不接管；epoch1无durable intent缝隙仍拒 |
| 页commit前/后自有client中断 | 实际外层连接commit断点、回滚/已提交内容队列游标证据 | 不是DB断电；原audit留running明确遗留 |
| 两页游标续跑 | 第一页真connector cursor offset1，恢复仅offset1，累计2/jobs各2 | 合成provider两页，不含真实上游 |
| 三feed同post/评论/回复 | 实际SQL祖先、唯一关联累计3、membership3；恢复增量2 | 新版内容改变重观察未测；当前schema站点共享历史冲突不自动改规则 |
| completed证据篡改 | lineage缺一跳、评论祖先、member board、task键拒绝；修复幂等 | 更广receipt/config/Journal异常只既有离线覆盖，非全部新SQL组合 |
| terminal commit ACKloss | 实际commit、destroy、只读accepted；audit/source/checkpoint不变 | 零内容SQL fixture，accepted不能独立证明业务完成，仍需Progress完整证据 |
| 全board/stage/全部入口独占 | 未测 | 无持久完整预期task集合，已登记任务完成不等于全board无漏 |
| AI/翻译结果/下一调度槽/跨平台真实回归/第二源精确修复 | 未测 | pending不等于消费完成，生产仍NO_GO |

隔离脚本为未用站点设置failed/零内容terminal只作SQLfixture收尾，result已标注，不计作真实采集完成。生产权限、安全配置不因文件哈希或完整性证据授予。epoch1含评论completed检查仍保守可能拒绝；此候选未声称全初次评论终态恢复支持。

## 请测试负责人执行

先审核所有新脚本身份与cleanup，独立只读记录生产PID/starttime/端口；按manifest前哈希→17文件离线→冻结CWD `node scripts/overseas-isolated-mariadb.js --isolated`→658后哈希→owned DB退出/13316释放/生产连续性复核。每个子矩阵单列PASS/FAIL及fixture边界，不把11主项等同全部故障组合。不得修改快照/业务代码、迁移、读取生产凭据或真实HTTP。保存独立QA报告，真实消息回开发负责人和项目经理；如失败退回开发，不直接生产启用。
