# scheduled ledger/审计增量独立QA

Status: `KNOWN_DEFECT_P1 / STAGE_NO_GO / RUNTIME_NO_GO`
Owner: 测试负责人
Date: 2026-10-09
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-grKQ7Y`

## 结论与证据

本轮70/70纯测及9组隔离SQL确实通过，但后续独立静态复核发现P1漏proof路径，故冻结增量阶段不得放行，整体`STAGE_NO_GO`。不继承旧`AnUw8s`、manual32AVIO或a1hWmo的未列集成结果，不运行活动工作树。外部manifest SHA256前后均为`7607fa19f727f7be59bfb9c4fbca00e1ed1e1efc64a897c72a74ea3c0ada2dce`；`--verify`前后675项闭包一致，11个测试文件由manifest限定。guard自检26项通过（23次预期拒绝、3项不可覆盖），不是恶意代码沙箱。

11文件离线70/70 PASS，FAIL/CANCEL/SKIP/TODO=0，业务测试`OFFLINE_GUARD_DENIALS:{}`，exit 0。原始TAP：[v085_scheduled_ledger_stage_independent_tap.txt](v085_scheduled_ledger_stage_independent_tap.txt)，SHA256 `cf5e4345704345ad3534af7713caf32ec446bc20ecc643de00aad2877d3c8504`。

fresh `--scheduled-isolated`合成SQL exit 0，`PASS_ISOLATED_SCHEDULED_ADMISSION_PARTIAL`，结果内9组scheduled检查通过，`ledgerExecuted=true`、`recoveryExecuted=false`、`realHttpExecuted=false`、`aiExecuted=false`。原始结果：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-Jdwh7A/result.json`，SHA256 `436cdd3641e48cf794878897078f820e3ffac2411615ef4b1eec8d90fed51747`。仅自有`127.0.0.1:13316`/server_id `20261036`/datadir/PID身份核实后写入；`serverStopped=true`、`portReleased=true`，13316前后无监听。3306 PID5900、3001 PID19768、Worker PID19584及启动时间前后一致；不以结果中的`productionTouched=false`自述证明历史库未变。

## 增量矩阵

| 验收项 | 本轮状态 |
|---|---|
| 外部锚/675闭包前后完整性、11文件guard纯测 | PASS |
| weak CHECK、恒真OR、反NULL、前缀unique、DATETIME精度错误 | PASS（自有SQL负测后恢复严格schema） |
| schema未就绪零写、第二child与manifest故障全回滚 | PASS（自有SQL） |
| parent+两child原子admission/CAS replay、epoch1双连接单赢家、ACK未知destroy无proof | PASS（自有SQL） |
| scheduled Journal、父子fresh fence、schema第二任务注错全回滚与重放幂等 | PASS（自有SQL；仅本阶段） |
| 审计父漂移零写、pending任务partial原子终态、只读reconcile accepted且不自动补写 | PASS（自有SQL） |
| scheduled ledger/coverage漏传`scheduledProof`写前拒绝 | FAIL（P1静态可达，既有SQL只测传proof路径） |
| optional PageStore/DispatchGuard proof | 仅纯测试；真实scheduled page/HTTP链NOT_TESTED |
| factory/runSource、restart epoch2及ACK未知claim恢复、parent聚合/成功cursor推进 | NOT_IMPLEMENTED/NOT_TESTED |
| cursor并发锁/跨路径锁序、scan失效在途fence、shared完整due/parent/queue permit/lifecycle | NOT_TESTED；活动树permit/marker修正不属于本冻结 |
| AI持久预算、通知、完整allowlist/翻译受控消费 | NOT_TESTED；仅纯测试中contentIds light/deep及越界拒绝 |
| 生产持久根/ACL/HTTP授权、共享Worker切换、真实采集 | NOT_AUTHORIZED/NOT_TESTED；现役国内不得暂停或另起消费者，`RUNTIME_NO_GO` |

## 退回

开发负责人后续以新冻结包修复下述P1并补齐实际scheduled page/factory/restart/parent/cursor/shared/AI证据，不把本轮既有通过项或活动树改动合并为已测结果。项目经理维持本冻结包阶段NO_GO、最终范围与生产NO_GO，禁止共享切换影响国内；本轮未写3306、未切服务、未发真实HTTP/AI。

## 后续独立缺陷复核（保留原测试原件）

P1：`grKQ7Y/server/src/db/overseasBoundAudit.js`第21-24行只在传入`scheduledProof`时创建scheduled上下文并检查ledger绑定；`overseasStageCoverage.js`第38-41行产出的scheduled ledger在不传proof时仍符合通用ledger品牌。于是`createOverseasBoundAudit({repo,journal,ledger})`可构造，`live()`第39-45行不执行父fence，`finish()`第120行会进入非scheduled source success/failed effect路径。它仍检查child租约与持久contract，并非无条件写入；但父漂移拒绝和scheduled child禁止直接改source的门禁被错误绕开。

同一省略参数模式存在于`grKQ7Y/worker/src/overseasBigPlayerPageStore.js`第85-87行：传scheduled coverage hook却不传`scheduledProof`仍能构造，页面事务第104、206行的父fence均仅由proof存在触发。`overseasStageCoverage.js`的hook构造只检查ledger品牌，不能在PageStore构造点强制proof。是否形成具体持久页面写入尚未以SQL复现，但写前拒绝条件已经缺失。既有SQL明确传proof，不能覆盖这条反例。

此项为冻结字节只读静态确证，没有重跑13316，也没有将活动工作树的私有scheduledLedger修复计作本包PASS。新冻结包须独立验证漏proof写前零写、父漂移、audit create尾部及dispatch前fence，另验真实scheduled page/HTTP链；在此之前`KNOWN_DEFECT_P1 / STAGE_NO_GO`。
