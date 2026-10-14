# v124 持久预算冻结与独立 QA 交接

Status: ISOLATED_CALL_BUDGET_PASS

冻结路径：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-qa-scheduled-stage-ghwuaG`

清单外部 SHA256：`bb86eb5e404806f4ca5e9fc5a17fefba4ae7adbaae1c8a7c04d8e900108c1326`，688 文件。

开发冻结执行：先后运行 `node scripts/freeze-overseas-scheduled-candidate.js --verify <SHA>`，均返回 verified:true/files:688。中间运行 `node scripts/overseas-isolated-mariadb.js --isolated-call-budget`，13 检查通过。SQL 原件：仓库根 `.temp/overseas-real-db-mC6qGc/result.json`，SHA256 `23f7c45e6119d60faf64486646e2fe111ba31c0b83d130304b5d6872fca94c1c`。实例停止、端口释放均 true。

开发 verify 输出在本会话工具终端，无独立 raw 文件；不得将开发证据冒充 QA 证据。已给测试负责人发消息，要求 QA 独立前后 verify 与测试原件均落盘并登记 SHA。旧 v122 未留存的前后 verify/纯测 raw 保持 NOT_VERIFIED，不补造。

## 交付范围

真实隔离 SQL 逐调用预算、精确当前内容/job 校验、跨进程持久计数、单剩余额度并发、重复 call 无第二凭据、reserve/consume ACK UNKNOWN 无自动重放、receipt getter 拒绝、禁发通知 outbox。scope 是身份窗口总额度，全局是 UTC 日额度。模拟消费不改变业务 job，也不调用任何 provider 或通知消费者。

第二 reserve ACK 场景显式 rekey 已耗尽的全局日桶来建立新合成夹具，此设置不属于模块能力，不等同跨日真实验收。translation 和全字段漂移仍需增补，不能称完整消费链通过。

## 未完成项

| 项目 | 状态 |
|---|---|
| 本闭包独立 QA | 已消息流转，待验收 |
| 父任务可信 SQL 读取/原子收尾/成功 cursor 并发 | 仅员工只读设计完成，未实现 |
| translation/全身份字段漂移矩阵 | 待补 |
| 恢复 proof/共享完整入口/默认500页实测 | 未放行 |
| 四辅助原语 | 未放行且不接 factory，已知品牌/等待环缺陷保留 |

整体 FULL_RUNTIME_NO_GO / CUTOVER_HOLD。国内和现役未更改，无 commit/push/发版/生产 DDL/服务重启。本轮向项目经理回报已送达。

独立 QA 已接收：`.tests/2026-10/2026-10-09/v124_overseas_isolated_call_budget_qa.md`。前后 verify raw SHA 均 `775abcbd304b9d8ffa2a9acea39c3d4e72deb80a7108ab9b0c0cdd04142c56fb`；SQL raw SHA `1794c919848664ca3b8e5e0a49f4795f8fb336e741304ccadb398cd24d7715ea`。开发已重算三文件 SHA 与报告一致。独立实例 `.temp/overseas-real-db-03BdEi` 停止释放。仅该预算隔离闭包通过，其他范围维持表中未完成/未放行。
