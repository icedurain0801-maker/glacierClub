# scheduled admission/firstClaim 阶段独立QA

Status: `STAGE_PARTIAL_PASS / FINAL_SCHEDULED_NOT_TESTED / RUNTIME_NO_GO`
Owner: 测试负责人
Date: 2026-10-09
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-a1hWmo`

## 结论

仅冻结的scheduled准入和首次领取阶段独立通过。不是完整scheduled/shared链、真实海外采集或生产放行；未运行活动工作树、旧`AnUw8s`缺陷包、旧manual包、`app.routes`及任何未列集成测试。3306任何库未由本次QA写入。

外部manifest SHA256前后均为`6dbe6e85afc3ff3b5637e7a05a98573d47a5845789284fa1016a852b2337458d`。冻结`--verify`前后均通过668项闭包；所列测试仅6文件，不能把未列测试算PASS。源码审查确认SQL入口显式`--scheduled-isolated`，自有`127.0.0.1:13316`/server_id `20261036`/datadir/PID身份检查后写入，关闭时只对身份仍匹配的自有实例`SHUTDOWN`。离线guard自检26项通过，其中23次预期拒绝、3项不可覆盖；该guard不是恶意代码沙箱。

离线6文件23/23 PASS，FAIL/CANCEL/SKIP/TODO=0，业务测试`OFFLINE_GUARD_DENIALS:{}`，exit 0。原始TAP：[v084_scheduled_stage_independent_tap.txt](v084_scheduled_stage_independent_tap.txt)，SHA256 `fe755a28649adfe344354b2db93e807c50122ce2261630c3e556beb05eff2c13`。

fresh合成SQL exit 0，`PASS_ISOLATED_SCHEDULED_ADMISSION_PARTIAL`。原始结果：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-CD9CFy/result.json`，SHA256 `f5b86491e31d3f373889c99c1b58a7d78cad30aa5a6cde49c7401e3e3fe76f76`。结果有6组scheduled检查，`serverStopped=true`、`portReleased=true`；13316前后无监听。3306 PID5900、3001 PID19768、Worker PID19584及启动时间前后相同。`productionTouched=false`仅是脚本自述，不用它证明历史生产库未变。

## 阶段矩阵

| 验收项 | 结果 |
|---|---|
| 外部锚、668项冻结闭包与前后校验 | PASS |
| 固定DB时钟、上海调度槽、七日父窗口、站点完成cursor只缩窄 | PASS（纯测试及合成SQL锚） |
| 错3306/server/schema/datadir/PID写前拒绝、schema未就绪零run写入 | PASS（错误身份纯测试；schema零写实际SQL） |
| 第二child插入故障、manifest打开故障父子全回滚 | PASS（自有SQL） |
| 原子parent+两child准入、CAS重放、首次claim manifest admitted0→open1/epoch1 | PASS（自有SQL） |
| 同child双连接竞争仅一赢家、重复claim拒绝 | PASS（自有SQL） |
| COMMIT后ACK未知destroy且无proof；可信context不可替换、复制proof拒绝 | PASS（自有SQL） |
| 生命周期pause/排空/rollback与原非目标scheduler引用 | PASS（仅纯测试）；实际shared入口NOT_TESTED |
| ledger/bootstrap/fresh fence/Journal接线，restart恢复/epoch2、ACK未知claim恢复 | NOT_IMPLEMENTED/NOT_TESTED |
| parent聚合/原子终态、成功cursor推进、cursor并发锁及跨路径锁序 | NOT_IMPLEMENTED/NOT_TESTED |
| shared真实queue/manual/due/poll与唯一消费者、完整schema负测 | NOT_TESTED |
| 真实HTTP、账号刷新、AI、生产DDL/服务切换 | NOT_AUTHORIZED/NOT_TESTED；生产`RUNTIME_NO_GO` |

## 退回与下一批

开发负责人继续补完整scheduled ledger/fence/恢复/parent终态和shared实际接线，冻结新包再提独立QA；经理保持最终范围不缩和生产NO_GO。本阶段没有将旧manual局部PASS或开发自测结果移作scheduled独立结果。
