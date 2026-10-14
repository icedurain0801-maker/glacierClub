# v025 精确消费者旧 API 旁路修复 QA 交接

Status: READY_FOR_INDEPENDENT_QA_ISOLATED_ONLY
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

本轮修复 v024 QA 的 P1：对象字面量中重复的 `claimExact`/`reserve` 实现已删除，唯一旧 API 方法实际抛出 `EXACT_LEGACY_API_DISABLED`；直接调用负测断言 job/call/budget/audit 前后零写。正式 consumer 只走原子 `admit`、`verifyClaim`、`markDispatchStarted`、`settle`、`complete`。

冻结根目录：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-exact-consumer-v025-fixed-20261010/`

冻结根运行命令：

```text
node --require ./offline-guard.cjs --test worker/test/overseasExactConsumer.test.js
```

开发聚焦测试：16/16 PASS；`git diff --check` PASS；615 全量 stdout 未保存，未重跑。QA 应复跑旧 API 直接调用零写负测，并保留 v024 的动态 tuple、三 hash 结算、同 job 竞争、跨 scope/global、claim 快照和 UNKNOWN 回归。verifyClaim 漂移属于已准入后的 HOLD 语义，不做恢复/退款绕过。

仅允许 offline guard + 内存测试；不接 SQL、HTTP、AI、通知、13316、生产或国内服务。旧冻结包保留，不覆盖。
