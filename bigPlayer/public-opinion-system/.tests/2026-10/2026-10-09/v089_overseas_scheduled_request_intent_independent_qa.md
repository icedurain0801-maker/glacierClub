# scheduled request/intent inspection 独立QA

Status: `ISOLATED_INSPECTION_ONLY_PASS / EXECUTION_RECOVERY_NOT_TESTED / FULL_RUNTIME_NO_GO / CUTOVER_HOLD`
Owner: 测试负责人
Date: 2026-10-09
Snapshot: `C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-YQr5UJ`

## 独立结论

冻结副本的request/intent持久化及只读重启inspection局部通过；不代表epoch2领取、执行恢复或自动重放。外部manifest SHA256前后均为`0fcfdc232718520775b3911c40b63f2b3cfbe890ce980b5c6501ab3dc5a65d27`，前后`--verify`均通过681项闭包。只运行manifest的`--scheduled-inspection`；旧成功链、异常链及纯测未重跑，不转移为本轮独立PASS。

开发原始`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-PEfVM8/result.json` SHA256独立核为`c980e494f4b86fc96ccd5593a10e20c6ff51233ca186093e76e4429e23c0550e`，仅作交接参照。QA另建fresh自有`127.0.0.1:13316`/server_id `20261036`实例，显式`--scheduled-inspection` exit 0，子结果`PASS_ISOLATED_SCHEDULED_INSPECTION_ONLY`。独立原始`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-real-db-Pgi3op/result.json` SHA256 `e2d35d9071dd4d4789267e78e8a8f03dd415a2cfd3e76b0ee9ace04e1c3da0ba`。

自有实例`serverStopped=true`、`portReleased=true`；13316前后无监听，3306 PID5900、3001 PID19768、Worker PID19584及启动时间前后一致。脚本先核端口、server_id、datadir、PID后写合成实例；只对身份仍匹配的实例SHUTDOWN。未操作3306、现役国内、真实HTTP/AI或生产DDL。`productionTouched=false`仅为runner范围自述，不能证明历史生产库未变。

## 增量矩阵

| 项目 | 本轮状态与边界 |
|---|---|
| request与first-claim intent写前持久化 | PASS_ISOLATED：`prepare`及两个`prepareIntent`发生在claim前；本轮准备阶段会写自有request文件及合成DB，非全程只读。 |
| 双连接claim单赢家及commit后ACK丢失 | PASS_ISOLATED：未知ACK不产生proof，已提交owner元组只用于只读对账。 |
| 重开request journal与新Node读取 | PASS_ISOLATED：新Node仅加载request journal并输出文件证据；不连接DB、不加载env/Worker。 |
| DB inspection与缺ACK journal判别 | PASS_ISOLATED：只读事务区分`claimed_journal_verified`和`claimed_without_journal`；前后12表快照不变，均无自动claim/write权限。 |
| 复制record/intent、inspection冒充claim proof | PASS_ISOLATED：品牌拒绝。 |
| 真正继续未知ACK claim、epoch2、执行恢复 | NOT_IMPLEMENTED/NOT_TESTED；`recoveryExecuted=false`、`epoch2Executed=false`、`automaticClaimAllowed=false`。 |
| 父聚合/cursor并发、shared scan/permit、持久AI预算/通知 | NOT_IMPLEMENTED/NOT_TESTED；生产`FULL_RUNTIME_NO_GO / CUTOVER_HOLD`。 |

后续须独立冻结执行恢复及epoch2，并保持intent对账不隐式授予写能力；项目经理继续维持现役国内与生产NO_GO。
