# v024 精确消费者二次阻断修复 QA 交接

Status: READY_FOR_INDEPENDENT_QA_ISOLATED_ONLY
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

本轮修复 v023 QA 的两项 P1，并收口竞争/预算接口：

- tuple 集合、tuple 元素和 manifest hash 固定；入口与 dispatch 前重新核 hash，动态追加/替换拒绝。
- `settle` 与 `complete` 共用完整 call manifest/tuple/scope、job scope/fingerprint/version/lease epoch 前置条件；伪 hash 不写 audit。
- 有效 job 校验、唯一 claim、global+scope 额度准入合并为单一内存原子 `admit`；失败零写，不退款语义只适用于已成功 dispatch/UNKNOWN。
- 不同 scope 使用独立 scope key，共享 global 累计；claim 返回快照再次与权威 job 比较。
- 旧 `claimExact`/`reserve` 旁路显式 fail-closed；内存 receipt 标记 `offline`，不宣称 durable。

开发聚焦测试：15/15 PASS。未重跑 615 全量，历史 stdout 未保存。新冻结根目录与 manifest SHA 由交接消息同步；冻结包内命令：

```text
node --require ./offline-guard.cjs --test worker/test/overseasExactConsumer.test.js
```

QA 必须复跑：动态 tuple 追加、伪 tuple/manifest/scope 失败结算、同 job 并发零写竞争、不同 scope 独立 cap + shared global、claim 快照漂移、lease epoch 伪改；仅 offline guard，不接 SQL/HTTP/provider/通知/13316。

结论只能是 `ISOLATED_PASS` 或退回；不代表生产预算、真实 SQL 或现役排他已验证。旧冻结全部保留，不覆盖。
