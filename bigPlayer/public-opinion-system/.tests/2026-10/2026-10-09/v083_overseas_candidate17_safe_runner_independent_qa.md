# 候选17安全runner独立QA

Status: `ISOLATED_MANUAL_PARTIAL_PASS / 18_EXCLUDED_NOT_TESTED / SCHEDULED_NOT_IMPLEMENTED / RUNTIME_NO_GO`
Owner: 测试负责人
Date: 2026-10-09
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-candidate17-manual-32AVIO`

## 独立结论

新快照的安全离线集合和全新自有13316合成SQL均通过；这不是完整海外真实采集、生产迁移或发版GO。旧`u6AIuO`危险测试未重跑，3306任何库未由本轮QA写入。旧测试历史实际连接身份仍不能证明，维持事故调查与`RUNTIME_NO_GO`。

外部manifest SHA256 `f505d89350dd1ac4e69951bdfd2c8808d8a36dbe22434146b1a49085b3e1db8f`独立前后相同；`--verify`前后均为878项，包含仅指向快照内server/worker的两条workspace junction。guard/runner源码审查：环境白名单、先安装不可覆盖的mysql2/网络/子进程拒绝、26项自检（23次预期拒绝、3项不可覆盖）、逐文件退出/TAP/拒绝标记联合判定。该guard仅为可信测试事故防护，非恶意代码沙箱；18个排除文件不计入PASS。

独立`--test` exit 0：128/128文件、974/974用例PASS，集合内FAIL/SKIP/CANCEL/TODO均0，业务测试拒绝计数0。raw的128个FILE标记、129个退出拒绝汇总标记均存在；23个`OFFLINE_GUARD_DENIED`只属预检。原件`offline-safe-raw-1791544304363.txt` SHA256 `d2bb6ad73094f687d878d52992f7353c8ff2fb9b0d06e6095e5ca91c7b3b4bdf`；`offline-safe-result-1791544304363.json` SHA256 `02147f91cb6b91951b640a7b884a2dc7796d9d555050a6de75d5da18a3e82117`。

独立`--isolated` exit 0，fresh `127.0.0.1:13316`、server_id `20261036`、自有datadir/PID核对后才执行SQL；19项检查、ledger事务矩阵、非目标SQL路由检查通过。`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-07t9Jn/result.json` SHA256 `381a13df5e14f5e72beec35f7523ceb45798bc69fa9051949236184c42aacfbc`，`serverStopped=true`、`portReleased=true`。100/1000历史root封口，10000/10001受固定10s预算触发partial且任务回滚为0；这是合成规模行为，不代表生产吞吐。

## v081矩阵

| 验收项 | 本轮状态与边界 |
|---|---|
| 外部锚、878项冻结清单、两条限定junction、前后字节 | PASS |
| guard拒绝、吞错后仍可见、退出标记、环境/目标防护 | PASS（26项自检；可信代码事故防护） |
| 128文件离线集合 | PASS（974用例）；另18文件NOT_TESTED，包括真实DB路由、HTTP/环境及间接子进程合同 |
| manual入口、独立站点run、真实SQL事务回滚/并发/ACK未知对账 | PASS_ISOLATED（合成身份及数据） |
| 同事务账本、动态评论/回复任务、run/epoch/audit、持久links计数 | PASS_ISOLATED（实际mainchain与ledger检查） |
| page前后提交中断、新进程恢复、旧owner fence、exact intent | PASS_ISOLATED（自有client故障注入） |
| 历史预算、schema/任务完成矩阵与失败回滚 | PASS_ISOLATED（100/1000封口；10000/10001按时限partial） |
| 国内及Discord/TapTap/Facebook非目标路径 | PASS_ISOLATED_ROUTE_ONLY（四类合成输入、候选业务SQL 0、transport 0）；生产运行回归NOT_TESTED |
| scheduled伪装/运行中配置变化的真实持久入口 | NOT_TESTED；scheduled全父子/slot链NOT_IMPLEMENTED，不以纯合同测试替代 |
| 真实上游HTTP、授权账号新鲜度、异步AI/翻译消费 | NOT_TESTED；结果明确`syntheticTransport=true`、`realHttpExecuted=false`、`aiExecuted=false`、`translationExecuted=false` |
| 生产DDL、历史兼容、共享切换、旧测试实际连接归因 | NOT_TESTED/待确认，维持RUNTIME_NO_GO |
| 13316 owned shutdown、878后校验、生产进程连续性 | PASS（13316无监听；3306 PID5900、3001 PID19768、Worker PID19584及启动时间前后一致） |

## 待开发与经理收口

开发负责人补18项独立隔离或维持精确未测范围，补scheduled完整运行链和真实上游/异步消费证据；项目经理继续保持生产NO_GO，不把本轮局部隔离PASS当发版许可。旧危险包历史DB影响仍需独立只读归因，不能通过重跑或清理来补证。
