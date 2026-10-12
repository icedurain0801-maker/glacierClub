# scheduled request/intent inspection 增量 QA 交接

Status: FROZEN / ISOLATED_INSPECTION_PASS / FULL_RUNTIME_NO_GO / CUTOVER_HOLD

冻结包根：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-YQr5UJ`。
manifest SHA256：`0fcfdc232718520775b3911c40b63f2b3cfbe890ce980b5c6501ab3dc5a65d27`。
冻结包前后各 681 个文件，`node scripts/freeze-overseas-scheduled-candidate.js --verify <SHA>` 均通过。

本次只执行新增 `node scripts/overseas-isolated-mariadb.js --scheduled-inspection`，未重跑已独立 QA 的旧成功链和旧异常链。结果为 `PASS_ISOLATED_SCHEDULED_INSPECTION_ONLY`，原始结果位于 `.temp/overseas-real-db-PEfVM8/result.json`，SHA256：`C980E494F4B86FC96CCD5593A10E20C6FF51233CA186093E76E4429E23C0550E`。

覆盖项：

1. 原 request journal 重开、可信 claim inspection、缺 ACK journal 停止；新 Node 进程只读取 request 文件，不连接 DB、不加载 env、不导入 worker。
2. 双连接 first claim 单赢家、commit 后 ACK 丢失只做只读对账；inspection 不授予 claim 权、不发布 proof、不写数据库。
3. copy record/intent 跨品牌拒绝，父子 manifest/epoch/重复 fence 与完整回滚矩阵通过。

结果明确：`restartJournalReadExecuted=true`、`newNodeProcessRequestReadExecuted=true`、`recoveryExecuted=false`、`epoch2Executed=false`、`automaticClaimAllowed=false`、`realHttpExecuted=false`、`productionActivationAllowed=false`；`productionTouched=false`，13316/serverId20261036 自有实例已停止并释放端口。

本增量不宣称 epoch2/执行恢复已完成；first ACK 真正继续、父终态聚合与 cursor 并发、shared scan/permit、持久 AI 预算/通知边界仍待后续独立实现和 QA。继续保持生产 FULL_RUNTIME_NO_GO / CUTOVER_HOLD，不做生产 DDL、服务切换、真实 HTTP、账号刷新、AI/翻译消费，也不触碰国内现役链路。

独立 QA 已完成：`.tests/2026-10/2026-10-09/v089_overseas_scheduled_request_intent_independent_qa.md`；QA 原始结果根 `.temp/overseas-real-db-Pgi3op/result.json`，SHA256：`e2d35d9071dd4d4789267e78e8a8f03dd415a2cfd3e76b0ee9ace04e1c3da0ba`。QA 确认 fresh 13316 exit0、自有实例停止且端口释放、现役 PID 启动时间不变；结论仍为 `ISOLATED_INSPECTION_ONLY_PASS`，未将 inspection 误报为执行恢复。
