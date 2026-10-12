# v021 精确消费者阻断修复 QA 交接

Status: READY_FOR_INDEPENDENT_QA_ISOLATED_ONLY
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 修复范围

新冻结包只修复 QA 退回的四项缺陷：

1. pending job 缺 source/account/game/community/site/board 任一归属字段即 fail closed。
2. 完成/结算再次核对 call manifest/tuple/scope hash、job fingerprint/version 和 lease epoch。
3. 只有明确 `dispatched:false` 才是 `NOT_DISPATCHED`；timeout/无证据异常为 `UNKNOWN_HOLD`。
4. 额度 reserve 先于 claim；cap 拒绝不会留下第二个 running job 或 lease。

## 正式冻结

冻结根目录：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-exact-consumer-v023-fixed-20261010/`

manifest SHA：以冻结根目录 `manifest.json` 为准，交接消息同步最终值。

独立命令（冻结根目录 cwd）：

```text
node --require ./offline-guard.cjs --test worker/test/overseasExactConsumer.test.js
```

## 开发验证

- 聚焦测试：10/10 PASS。
- `git diff --check`：PASS。
- 不重跑 615 全量；历史全量 stdout 未保存，继续标记 `NOT_SAVED_NOT_RECREATED`。

## QA 必查

- 复跑四项负测并检查 provider 调用、副作用、job 状态、lease、call 状态和 audit。
- 用不同 manifest/scope 做预算竞争；当前 repo 的 scope 计数是隔离 fixture 语义，跨 scope 结论需由 QA 实测后再定，不能推断为生产 global 账本。
- 只允许离线 guard；不得连接 SQL、HTTP、真实 provider、通知、13316 或现役 worker。

## 门禁

结论只能是 `ISOLATED_PASS` 或缺陷退回；不代表真实 SQL、现役排他、生产预算或完整 runtime 已验证。旧 v021 冻结包保留，不覆盖。
