# scheduled 子主链独立QA

Status: `ISOLATED_CHILD_MAINCHAIN_PARTIAL_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-09
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-00gmkU`

## 独立结论

冻结副本的实际scheduled factory→Worker `runSource`→connector归一化→PageStore/账本/子审计合成链局部通过。真实HTTP/AI、完整scheduled父子运行、共享切换和生产未验收；旧包不重跑也不改写。外部manifest SHA256前后均为`31f1af6e9d180f59578c39ad5c5374a98b82134535a8e2e2fb46c58e88cf0dea`，`--verify`前后679项闭包一致。

仅manifest所列12文件，guard自检26项通过（23次预期拒绝、3项不可覆盖）；离线76/76 PASS，fail/cancel/skip/todo=0、业务`OFFLINE_GUARD_DENIALS:{}`、exit 0。原始TAP：[v087_scheduled_mainchain_independent_tap.txt](v087_scheduled_mainchain_independent_tap.txt)，SHA256 `3a6d6b0dee17a45be979061f863ae3460a386007a327fe5041ba48c3a3362a96`。

fresh自有`127.0.0.1:13316`、server_id `20261036`、datadir/PID核验后显式`--scheduled-mainchain` exit 0；顶层`PASS_ISOLATED_SCHEDULED_ADMISSION_PARTIAL`，子结果`PASS_ISOLATED_SCHEDULED_CHILD_MAINCHAIN_PARTIAL`，10组检查。原始`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-Je4LGV/result.json` SHA256 `0606f23548f93a1ef48f50ea873345644ba76d46a6ed802b62908053d9a8574f`；`serverStopped=true`、`portReleased=true`。13316前后无监听，3306 PID5900、3001 PID19768、Worker PID19584及启动时间前后一致。`productionTouched=false`仅为本runner自述，不能证明历史数据库未变。

## 增量矩阵

| 验收项 | 状态及边界 |
|---|---|
| 冻结锚、679字节闭包、12文件纯测 | PASS |
| 实际factory/Worker runSource及connector页面归一化 | PASS_ISOLATED；11次合成transport，`realHttpExecuted=false` |
| post、顶层comment、inline reply、动态reply | PASS_ISOLATED；4条持久内容及父子图、4/4唯一计数 |
| 任务/CP、analysis/translation待处理 | PASS_ISOLATED；5个expected任务及对应CP完成，两类各4个pending job；未消费AI/翻译 |
| child审计/终态，parent run、source-state、source全行 | PASS_ISOLATED；child授权范围完成，父与source未变，不代表父聚合 |
| 无run、parent/manual、owner/epoch/window与snake/camel伪造 | PASS_ISOLATED；写前/合成发送前拒绝 |
| claim重放、普通create/finish/source写与错CP账号 | PASS_ISOLATED；拒绝不越权 |
| Asia/Shanghai SQL DATETIME checkpoint release | PASS_ISOLATED；专属repo路径保留安全cursor，不代表页预算/异常收尾 |
| 页预算耗尽、transport异常、restart/epoch2 | NOT_TESTED |
| parent聚合及成功cursor推进、cursor并发、shared due/scan permit、AI持久预算/通知 | NOT_IMPLEMENTED/NOT_TESTED |
| 真实上游、生产DDL/持久根/ACL、国内共享切换 | NOT_AUTHORIZED/NOT_TESTED；`FULL_RUNTIME_NO_GO / CUTOVER_HOLD` |

## 后续

开发下一冻结包须补页预算/transport异常、重启恢复、父聚合与cursor锁、shared完整入口及AI持久边界；经理维持国内现役不动与生产NO_GO。本轮只写QA报告和TAP，未写3306、未发真实HTTP或消费AI。
