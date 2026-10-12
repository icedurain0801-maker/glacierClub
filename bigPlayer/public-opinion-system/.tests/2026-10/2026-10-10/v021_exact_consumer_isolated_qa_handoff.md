# v021 海外精确消费者隔离实现 QA 交接

Status: READY_FOR_INDEPENDENT_QA_ISOLATED_ONLY
Date: 2026-10-10 (Asia/Shanghai)
Owner: 开发负责人

## 交接范围

正式冻结目录（仓库根，可独立复跑）：`C:/Users/Administrator/AppData/Roaming/Code/User/project manage/.temp/overseas-exact-consumer-v021-runnable-20261010/`

正式冻结 manifest SHA-256：以冻结目录内 `manifest.json` 的 SHA-256 为准（本交接消息同步给出的值）。

冻结包状态：`ISOLATED_ONLY_PENDING_QA`，`productionActivationAllowed=false`。原项目目录 `.temp/overseas-exact-consumer-v021/` 与扁平 rootfix 包保留为历史证据，不作为本次 QA 输入。

原件包含：

- `overseasExactConsumer.js`：严格 manifest、已有 job claim、global+scope 原子额度、单 attempt、dispatch 状态区分、UNKNOWN_HOLD、lease epoch 和内存事务回滚。
- `overseasExactConsumer.test.js`：6 个隔离测试。
- `v021_exact_consumer_isolated_implementation_changelog.md`：变更记录。
- `manifest.json`：逐文件 bytes/SHA-256 和冻结状态。
- `verify.json`：import 闭包、源文件 before/冻结文件 after 逐文件核对、可复跑命令及历史 stdout 说明。
- `offline-guard.cjs`：复跑前置 guard，阻断 fetch/http/https/net/tls。
- `focused-test.raw.txt`：本次聚焦离线测试原始输出。
- `overseasBigPlayerRunContractJournal.js`：`overseasExactConsumer.js` 的 canonical import 闭包原件。

## 开发侧验证

- `node --test worker/test/overseasExactConsumer.test.js`：6/6 PASS。
- `npm --workspace worker test`：开发侧曾执行并得到 615/615 PASS；原始 stdout 未保存，本次不扩大复跑，冻结 `verify.json` 明确标记 `NOT_SAVED_NOT_RECREATED`。
- `git diff --check`：PASS。

## 独立复跑

在冻结根目录执行：

```text
node --require ./offline-guard.cjs --test worker/test/overseasExactConsumer.test.js
```

该命令不依赖工作树路径；`worker/src`、`worker/test` 和 `overseasStateDirectoryPolicy.js` 均在冻结包内。`verify.json` 记录 source-before/copy-after 的真实 SHA。历史 615 全量 stdout 未保存，不声称冻结包已复跑全量。

## QA 必查项

1. manifest 缺字段、getter/symbol、重复 job/content、hash/动态追加和 profile/targetLanguage/version 漂移必须拒绝。
2. claim 只能取 manifest 已列的 pending job；不得扫描、backfill、deep、cache、quality、reconcile、alert、DingTalk 或 notify。
3. 每 tuple 只能一次 dispatch，`maxRetries=0`；明确未发送返回 `NOT_DISPATCHED`，发送后无 ACK/未知返回 `UNKNOWN_HOLD`，两者不得重放或退款。
4. global 与 scope cap=1 并发竞争只能一个 reserve 成功；失败不调用 provider，跨 scope 不借额。
5. lease epoch、fingerprint、版本或 scope 漂移不可 completed；事务失败后 job 不得 completed，audit 不得伪造完成，账本状态必须可解释。
6. 验收结论只能为 `ISOLATED_PASS` 或缺陷退回；不得声称真实 SQL、现役排他、provider、生产预算或通知已验证。

## 明确未覆盖

未连接生产 repository、现役 advisory/translation gate、真实 provider/model/金额/token cap、HTTP/token exchange、DDL、迁移、服务启动、13316、9io1Ti 或 YLd7mL 原包。QA 不得补做这些操作。
